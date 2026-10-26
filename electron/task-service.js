'use strict';

const path = require('path');
const fsp = require('fs/promises');
const { EventEmitter } = require('events');
const { fork } = require('child_process');
const { app } = require('electron');
const { validateTaskPayload } = require('../shared/validation');
const { leadsToCsv, reviewsToCsv, exportFileName } = require('./csv');
const { makeSummary } = require('./store');
const { nowIso, safeMessage } = require('./util');

const MAX_LOGS = 300;
const MAX_QUEUED = 12;

class TaskService extends EventEmitter {
  constructor(store, { paths, browser, appVersion, onNotify } = {}) {
    super();
    this.store = store;
    this.paths = paths;
    this.browser = browser;
    this.appVersion = appVersion;
    this.onNotify = onNotify;
    this.active = null;
    this.queueTimer = null;
  }

  list() {
    return this.store.listTasks();
  }

  get(id) {
    return this.store.getTask(id);
  }

  async create(payload) {
    const validated = validateTaskPayload(payload);
    if (!validated.ok) {
      const error = new Error(validated.error);
      error.code = 'INVALID_INPUT';
      throw error;
    }
    const queued = this.store.listTasks().filter((task) => task.status === 'queued').length;
    if (queued >= MAX_QUEUED) {
      const error = new Error(`There are already ${MAX_QUEUED} searches waiting. Let a few finish first.`);
      error.code = 'QUEUE_FULL';
      throw error;
    }
    const { task, write } = this.store.createTask(validated.data);
    await write;
    const summary = makeSummary(task);
    this.emit('update', summary);
    this.pump();
    return summary;
  }

  async rerun(id) {
    const task = await this.store.getTask(id);
    if (!task) return null;
    return this.create({
      mode: task.mode,
      query: task.input?.query,
      businessType: task.input?.businessType,
      country: task.input?.country,
      cities: task.input?.cities,
      links: task.input?.links,
      options: task.options,
    });
  }

  async delete(id) {
    if (this.active?.task.id === id) {
      throw new Error('This search is still running. Cancel it before deleting.');
    }
    await this.store.deleteTask(id);
    this.emit('removed', { taskId: id });
  }

  async clearAll() {
    if (this.active) {
      throw new Error('A search is still running. Cancel it before clearing your history.');
    }
    await this.store.clearTasks();
    this.emit('cleared');
  }

  async cancel(id) {
    if (this.active?.task.id === id) {
      const active = this.active;
      active.cancelRequested = true;
      this.addLog(active.task, 'warn', 'Cancelling search\u2026');
      active.child?.send?.({ type: 'cancel' });
      clearTimeout(active.killTimer);
      active.killTimer = setTimeout(() => {
        if (this.active === active && !active.finalized) {
          try {
            active.child?.kill();
          } catch {
            // already gone
          }
        }
      }, 10000);
      this.markDirty(active.task, true);
      return true;
    }

    const task = await this.store.getTask(id);
    if (!task) return false;
    if (task.status === 'queued') {
      task.status = 'cancelled';
      task.finishedAt = nowIso();
      task.progress = { ...(task.progress || {}), phase: 'done', percent: 100, message: 'Cancelled' };
      await this.store.saveTask(task);
      this.emit('update', makeSummary(task));
      this.emit('done', { taskId: task.id, status: task.status, summary: makeSummary(task) });
      return true;
    }
    return false;
  }

  async getExport(id, kind = 'leads') {
    const task = await this.store.getTask(id);
    if (!task) throw new Error('Search not found.');
    const results = Array.isArray(task.results) ? task.results : [];
    const hasReviews = results.some((business) => (business.reviews || []).length > 0);
    if (kind === 'reviews' && !hasReviews) {
      throw new Error('This search has no reviews to export. Run it again with “Collect reviews” enabled.');
    }
    const csv = kind === 'reviews' ? reviewsToCsv(results) : leadsToCsv(results);
    return { csv, filename: exportFileName(task, kind), task };
  }

  pump() {
    if (this.active) return;
    clearTimeout(this.queueTimer);
    this.queueTimer = setTimeout(() => this.startNext().catch((error) => this.emit('error', error)), 30);
  }

  async startNext() {
    if (this.active) return;
    const next = this.store
      .listTasks()
      .filter((task) => task.status === 'queued')
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    if (!next) return;
    const task = await this.store.getTask(next.id);
    if (!task) return;
    await this.startTask(task);
  }

  workerPath() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'scraper', 'worker.js');
    }
    return path.join(__dirname, '..', 'scraper', 'worker.js');
  }

  async startTask(task) {
    task.status = 'running';
    task.startedAt = nowIso();
    task.progress = {
      phase: 'starting',
      percent: 0,
      message: 'Starting Chrome\u2026',
      current: 0,
      total: 0,
      found: 0,
    };

    if (!this.browser?.found) {
      task.status = 'failed';
      task.error = {
        code: 'CHROME_NOT_FOUND',
        message: 'Google Chrome was not found. Install Chrome or Microsoft Edge, then try again.',
      };
      task.finishedAt = nowIso();
      task.progress = { ...task.progress, phase: 'done', percent: 100, message: 'Chrome not found' };
      await this.store.saveTask(task);
      this.emit('update', makeSummary(task));
      this.emit('done', { taskId: task.id, status: 'failed', summary: makeSummary(task), error: task.error });
      this.pump();
      return;
    }

    await this.store.saveTask(task);
    this.addLog(task, 'info', `Starting “${task.title}”`);
    this.emit('update', makeSummary(task));

    const child = fork(this.workerPath(), [], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        MAPSCRAPER_APP_VERSION: this.appVersion,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
    });

    const active = {
      task,
      child,
      finalized: false,
      cancelRequested: false,
      saveTimer: null,
      killTimer: null,
      stderrTail: '',
    };
    this.active = active;

    child.stdout?.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text) this.addLog(task, 'debug', text.slice(0, 500));
    });
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (!text) return;
      active.stderrTail = (active.stderrTail + '\n' + text).slice(-4000);
      this.addLog(task, 'error', text.slice(0, 500));
    });

    child.on('message', (message) => {
      if (!message || typeof message !== 'object') return;
      this.handleWorkerMessage(active, message);
    });

    child.on('error', (error) => {
      this.finalize(active, 'failed', {
        code: 'WORKER_START_FAILED',
        message: `The search engine could not start. ${safeMessage(error)}`,
      });
    });

    child.on('exit', (code, signal) => {
      if (active.finalized) return;
      if (active.cancelRequested) {
        this.finalize(active, 'cancelled');
        return;
      }
      const detail = active.stderrTail ? ` ${active.stderrTail.split('\n').filter(Boolean).slice(-2).join(' ')}` : '';
      this.finalize(active, 'failed', {
        code: 'WORKER_CRASHED',
        message: `The search stopped unexpectedly${code !== null ? ` (exit code ${code})` : signal ? ` (${signal})` : ''}.${detail}`.slice(0, 1200),
      });
    });

    child.send({
      type: 'start',
      payload: {
        task: {
          id: task.id,
          title: task.title,
          mode: task.mode,
          input: task.input,
          options: task.options,
        },
        profileDir: this.paths.profileDir,
        browser: this.browser,
        appVersion: this.appVersion,
      },
    });
  }

  handleWorkerMessage(active, message) {
    const { task } = active;
    switch (message.type) {
      case 'progress': {
        const payload = message.payload || {};
        task.progress = {
          ...(task.progress || {}),
          ...payload,
          percent: Math.max(0, Math.min(100, Number(payload.percent) || 0)),
          found: Array.isArray(task.results) ? task.results.length : Number(payload.found) || 0,
        };
        this.emit('update', makeSummary(task));
        this.markDirty(task);
        break;
      }
      case 'log': {
        const entry = message.payload || {};
        this.addLog(task, entry.level || 'info', entry.message || '', entry.time);
        break;
      }
      case 'notice': {
        const text = String(message.payload?.message || '').trim();
        if (text && !(task.notices || []).some((item) => item.message === text)) {
          task.notices = [...(task.notices || []), { type: message.payload?.type || 'info', message: text }];
          this.emit('update', makeSummary(task));
          this.markDirty(task);
        }
        break;
      }
      case 'result': {
        const business = message.payload;
        if (!business || !business.name && !business.mapsUrl) break;
        const key = business.placeId || business.mapsUrl || business.name;
        const exists = (task.results || []).some(
          (item) => (item.placeId && item.placeId === business.placeId) || item.mapsUrl === business.mapsUrl
        );
        if (!exists) {
          task.results = task.results || [];
          task.results.push(business);
          task.counts = this.recount(task);
          this.emit('result', { taskId: task.id, result: business });
          this.emit('update', makeSummary(task));
          this.markDirty(task);
        }
        break;
      }
      case 'done': {
        const payload = message.payload || {};
        this.finalize(active, payload.status === 'cancelled' ? 'cancelled' : 'completed', null, payload);
        break;
      }
      case 'error': {
        const error = message.payload || {};
        this.finalize(active, 'failed', {
          code: error.code || 'SCRAPE_FAILED',
          message: error.message || 'The search failed. Please try again.',
        });
        break;
      }
      default:
        break;
    }
  }

  recount(task) {
    const results = task.results || [];
    const ratings = results.map((item) => Number(item.rating)).filter((value) => Number.isFinite(value) && value > 0);
    return {
      results: results.length,
      withEmail: results.filter((item) => item.email || (item.emails || []).length).length,
      withWebsite: results.filter((item) => item.website).length,
      reviews: results.reduce((sum, item) => sum + (Array.isArray(item.reviews) ? item.reviews.length : 0), 0),
      avgRating: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0,
    };
  }

  addLog(task, level, message, time) {
    const text = String(message || '').trim();
    if (!text) return;
    const entry = { time: time || nowIso(), level, message: text.slice(0, 1000) };
    task.logs = [...(task.logs || []), entry].slice(-MAX_LOGS);
    this.emit('log', { taskId: task.id, entry });
    this.markDirty(task);
  }

  markDirty(task, force = false) {
    const active = this.active;
    if (!active || active.task !== task) {
      this.store.saveTask(task);
      return;
    }
    if (force) {
      clearTimeout(active.saveTimer);
      active.saveTimer = null;
      this.store.saveTask(task);
      return;
    }
    if (active.saveTimer) return;
    active.saveTimer = setTimeout(() => {
      active.saveTimer = null;
      this.store.saveTask(task);
    }, 1200);
  }

  async finalize(active, status, error = null, payload = {}) {
    if (active.finalized) return;
    active.finalized = true;
    clearTimeout(active.saveTimer);
    clearTimeout(active.killTimer);

    const { task } = active;
    if (status === 'completed') {
      task.status = 'completed';
      task.progress = {
        ...(task.progress || {}),
        phase: 'done',
        percent: 100,
        message: `Finished \u2014 ${task.results.length} ${task.results.length === 1 ? 'business' : 'businesses'} found`,
        found: task.results.length,
      };
      task.counts = this.recount(task);
      this.addLog(task, 'success', `Finished with ${task.results.length} ${task.results.length === 1 ? 'lead' : 'leads'}.`);
    } else if (status === 'cancelled') {
      task.status = 'cancelled';
      task.progress = {
        ...(task.progress || {}),
        phase: 'done',
        percent: Math.max(1, Number(task.progress?.percent) || 0),
        message: 'Cancelled',
      };
      this.addLog(task, 'warn', 'Search cancelled. Partial results were saved.');
    } else {
      task.status = 'failed';
      task.error = error || { code: 'SCRAPE_FAILED', message: 'The search failed. Please try again.' };
      task.progress = {
        ...(task.progress || {}),
        phase: 'done',
        percent: Math.max(1, Number(task.progress?.percent) || 0),
        message: 'Search failed',
      };
      this.addLog(task, 'error', task.error.message);
    }

    task.finishedAt = nowIso();
    if (payload?.notices?.length) {
      for (const notice of payload.notices) {
        const text = String(notice?.message || '').trim();
        if (text && !(task.notices || []).some((item) => item.message === text)) {
          task.notices = [...(task.notices || []), { type: notice.type || 'info', message: text }];
        }
      }
    }
    task.counts = this.recount(task);

    await this.store.saveTask(task);
    const summary = makeSummary(task);
    this.emit('update', summary);
    this.emit('done', { taskId: task.id, status: task.status, summary, error: task.error });

    if (this.onNotify) {
      if (status === 'completed') {
        this.onNotify({
          title: `${task.results.length} lead${task.results.length === 1 ? '' : 's'} ready`,
          body: task.title,
        });
      } else if (status === 'failed') {
        this.onNotify({ title: 'Search needs attention', body: task.error?.message || task.title });
      }
    }

    try {
      active.child?.send?.({ type: 'shutdown' });
    } catch {
      // worker may already be exiting
    }
    try {
      active.child?.disconnect?.();
    } catch {
      // ignore
    }
    this.active = null;
    this.pump();
  }

  shutdown() {
    if (this.active) {
      try {
        this.active.child?.send?.({ type: 'cancel' });
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          this.active?.child?.kill();
        } catch {
          // ignore
        }
      }, 500).unref?.();
      this.active = null;
    }
    clearTimeout(this.queueTimer);
  }

  async revealTask(id) {
    const task = await this.store.getTask(id);
    if (!task) return false;
    return true;
  }
}

module.exports = { TaskService, MAX_LOGS };
