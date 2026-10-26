'use strict';

const fsp = require('fs/promises');
const path = require('path');
const DEFAULTS = require('../shared/defaults.json');
const { BROWSER_MODES } = require('../shared/constants');
const { atomicWrite, nowIso, readJson, uid } = require('./util');

const EMPTY_COUNTS = { results: 0, withEmail: 0, withWebsite: 0, reviews: 0, avgRating: 0 };

function makeSummary(task) {
  return {
    id: task.id,
    title: task.title,
    mode: task.mode,
    status: task.status,
    input: task.input,
    options: task.options,
    createdAt: task.createdAt,
    startedAt: task.startedAt || null,
    finishedAt: task.finishedAt || null,
    progress: task.progress || null,
    counts: task.counts || { ...EMPTY_COUNTS },
    error: task.error || null,
    notices: Array.isArray(task.notices) ? task.notices : [],
  };
}

function normalizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const int = (value, fallback, min, max) => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    ...DEFAULTS,
    maxResults: int(source.maxResults, DEFAULTS.maxResults, 1, 100),
    maxResultsPerCity: int(source.maxResultsPerCity, DEFAULTS.maxResultsPerCity, 1, 50),
    reviews: source.reviews === undefined ? DEFAULTS.reviews : Boolean(source.reviews),
    maxReviews: int(source.maxReviews, DEFAULTS.maxReviews, 1, 500),
    enrich: source.enrich === undefined ? DEFAULTS.enrich : Boolean(source.enrich),
    browserMode: BROWSER_MODES.includes(source.browserMode) ? source.browserMode : DEFAULTS.browserMode,
    apiPort: int(source.apiPort, DEFAULTS.apiPort, 1024, 65535),
    apiToken: typeof source.apiToken === 'string' ? source.apiToken.slice(0, 200) : '',
    minimizeBrowser: Boolean(source.minimizeBrowser),
    windowBounds: source.windowBounds && typeof source.windowBounds === 'object' ? source.windowBounds : null,
  };
}

class Store {
  constructor(paths) {
    this.paths = paths;
    this.index = [];
    this.settings = normalizeSettings({});
    this.errorHandler = null;
    this.chain = Promise.resolve();
  }

  onError(handler) {
    this.errorHandler = handler;
  }

  async init() {
    await fsp.mkdir(this.paths.tasksDir, { recursive: true });
    this.settings = normalizeSettings(await readJson(this.paths.settingsFile, {}));
    this.index = await readJson(this.paths.indexFile, []);

    if (!Array.isArray(this.index)) {
      this.index = [];
      await this.rebuildIndex();
    }

    const files = await fsp.readdir(this.paths.tasksDir).catch(() => []);
    const taskFiles = files.filter((name) => name.endsWith('.json'));
    const known = new Set(this.index.map((item) => item.id));
    const onDisk = new Set();

    for (const file of taskFiles) {
      const id = path.basename(file, '.json');
      onDisk.add(id);
      if (!known.has(id)) {
        const task = await readJson(path.join(this.paths.tasksDir, file), null).catch(() => null);
        if (task && task.id) this.index.push(makeSummary(task));
      }
    }

    this.index = this.index.filter((item) => onDisk.has(item.id));

    let reclaimed = 0;
    for (const summary of this.index) {
      if (summary.status === 'running' || summary.status === 'queued') {
        const task = await this.getTask(summary.id);
        if (!task) continue;
        task.status = 'failed';
        task.error = {
          code: 'APP_CLOSED',
          message: 'The app closed before this search finished. Partial results are saved — run it again for a complete list.',
        };
        task.finishedAt = nowIso();
        task.progress = { ...(task.progress || {}), phase: 'done', percent: 100, message: 'Stopped before finishing' };
        await this.saveTask(task);
        reclaimed += 1;
      }
    }

    this.index.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    await this.saveIndex();
    return { reclaimed };
  }

  async rebuildIndex() {
    const files = await fsp.readdir(this.paths.tasksDir).catch(() => []);
    const next = [];
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const task = await readJson(path.join(this.paths.tasksDir, file), null).catch(() => null);
      if (task && task.id) next.push(makeSummary(task));
    }
    this.index = next;
    await this.saveIndex();
  }

  listTasks() {
    return [...this.index].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getTask(id) {
    if (!/^tsk_[a-z0-9_]+$/i.test(String(id || ''))) return null;
    return readJson(path.join(this.paths.tasksDir, `${id}.json`), null);
  }

  createTask(data) {
    const now = nowIso();
    const task = {
      id: uid('tsk'),
      title: data.title,
      mode: data.mode,
      input: data.input,
      options: data.options,
      status: 'queued',
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      progress: {
        phase: 'queued',
        percent: 0,
        message: 'Waiting to start\u2026',
        current: 0,
        total: 0,
        found: 0,
      },
      counts: { ...EMPTY_COUNTS },
      error: null,
      notices: [],
      logs: [],
      results: [],
    };
    this.index.unshift(makeSummary(task));
    return { task, write: this.saveTask(task) };
  }

  saveTask(task) {
    const snapshot = JSON.stringify(task);
    const summary = makeSummary(task);
    const existing = this.index.findIndex((item) => item.id === task.id);
    if (existing >= 0) this.index[existing] = summary;
    else this.index.unshift(summary);
    this.index.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const taskFile = path.join(this.paths.tasksDir, `${task.id}.json`);
    this.chain = this.chain
      .then(async () => {
        await atomicWrite(taskFile, snapshot);
        await this.saveIndexNow();
      })
      .catch((error) => {
        if (this.errorHandler) this.errorHandler(error);
      });
    return this.chain;
  }

  async saveIndex() {
    this.chain = this.chain.then(() => this.saveIndexNow()).catch((error) => {
      if (this.errorHandler) this.errorHandler(error);
    });
    return this.chain;
  }

  async saveIndexNow() {
    await atomicWrite(this.paths.indexFile, JSON.stringify(this.index));
  }

  async deleteTask(id) {
    this.index = this.index.filter((item) => item.id !== id);
    await fsp.rm(path.join(this.paths.tasksDir, `${id}.json`), { force: true });
    await this.saveIndex();
  }

  async clearTasks() {
    const files = await fsp.readdir(this.paths.tasksDir).catch(() => []);
    await Promise.all(
      files
        .filter((name) => name.endsWith('.json'))
        .map((name) => fsp.rm(path.join(this.paths.tasksDir, name), { force: true }).catch(() => {}))
    );
    this.index = [];
    await this.saveIndex();
  }

  getSettings() {
    return { ...this.settings };
  }

  async saveSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...(patch || {}) });
    const snapshot = JSON.stringify(this.settings, null, 2);
    this.chain = this.chain.then(() => atomicWrite(this.paths.settingsFile, snapshot)).catch((error) => {
      if (this.errorHandler) this.errorHandler(error);
    });
    await this.chain;
    return this.getSettings();
  }
}

module.exports = { Store, EMPTY_COUNTS, makeSummary, normalizeSettings };
