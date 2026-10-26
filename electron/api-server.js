'use strict';

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CITIES = require('../shared/cities.json');
const DEFAULTS = require('../shared/defaults.json');

function localOrigin(origin) {
  if (!origin) return false;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left[i] ^ right[i];
  return result === 0;
}

async function listenWithFallback(app, preferredPort) {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = preferredPort + offset;
    const server = http.createServer(app);
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.close();
          reject(error);
        };
        server.once('error', onError);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', onError);
          resolve();
        });
      });
      return { server, port };
    } catch (error) {
      if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') throw error;
    }
  }
  throw new Error('Could not find a free port for the local API.');
}

async function startApiServer({ store, service, appVersion, preferredPort }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (localOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      if (!origin) return res.sendStatus(204);
      if (!localOrigin(origin)) return res.status(403).json({ error: 'Origin not allowed.' });
      return res.sendStatus(204);
    }
    next();
  });

  app.use((req, res, next) => {
    const settings = store.getSettings();
    if (!settings.apiToken) return next();
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const key = bearer || req.headers['x-api-key'] || '';
    if (!safeEqual(key, settings.apiToken)) {
      return res.status(401).json({ error: 'Invalid API token. Add “Authorization: Bearer <token>”.' });
    }
    return next();
  });

  app.get('/api/v1/health', (req, res) => {
    const summaries = service.list();
    res.json({
      ok: true,
      name: 'MapScraper local API',
      version: appVersion,
      activeTaskId: summaries.find((task) => task.status === 'running')?.id || null,
      tasks: summaries.length,
    });
  });

  app.get('/api/v1/tasks', (req, res) => {
    const status = String(req.query.status || '').trim();
    const mode = String(req.query.mode || '').trim();
    let tasks = service.list();
    if (status) tasks = tasks.filter((task) => task.status === status);
    if (mode) tasks = tasks.filter((task) => task.mode === mode);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    res.json({ tasks: tasks.slice(0, limit), total: tasks.length });
  });

  app.post('/api/v1/tasks', async (req, res, next) => {
    try {
      const task = await service.create(req.body || {});
      res.status(202).json({ task, urls: { self: `/api/v1/tasks/${task.id}` } });
    } catch (error) {
      if (error.code === 'INVALID_INPUT' || error.code === 'QUEUE_FULL') {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      return next(error);
    }
  });

  app.get('/api/v1/tasks/:id', async (req, res, next) => {
    try {
      const task = await service.get(req.params.id);
      if (!task) return res.status(404).json({ error: 'Search not found.' });
      if (String(req.query.include || '') === 'results') {
        return res.json({
          id: task.id,
          title: task.title,
          status: task.status,
          counts: task.counts,
          progress: task.progress,
          results: task.results,
        });
      }
      return res.json(task);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/tasks/:id/results', async (req, res, next) => {
    try {
      const task = await service.get(req.params.id);
      if (!task) return res.status(404).json({ error: 'Search not found.' });
      res.json({ task: { id: task.id, title: task.title, status: task.status }, results: task.results || [] });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/tasks/:id/cancel', async (req, res, next) => {
    try {
      const cancelled = await service.cancel(req.params.id);
      if (!cancelled) return res.status(409).json({ error: 'This search is not running.' });
      res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/tasks/:id/rerun', async (req, res, next) => {
    try {
      const task = await service.rerun(req.params.id);
      if (!task) return res.status(404).json({ error: 'Search not found.' });
      res.status(202).json({ task });
    } catch (error) {
      if (error.code === 'INVALID_INPUT' || error.code === 'QUEUE_FULL') {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      return next(error);
    }
  });

  app.delete('/api/v1/tasks/:id', async (req, res, next) => {
    try {
      const task = await service.get(req.params.id);
      if (!task) return res.status(404).json({ error: 'Search not found.' });
      await service.delete(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      if (String(error.message).includes('still running')) {
        return res.status(409).json({ error: error.message });
      }
      return next(error);
    }
  });

  app.get('/api/v1/tasks/:id/export', async (req, res, next) => {
    try {
      const format = req.query.format === 'reviews' ? 'reviews' : 'leads';
      const exported = await service.getExport(req.params.id, format);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `${req.query.download === '0' ? 'inline' : 'attachment'}; filename="${exported.filename.replace(/"/g, '')}"`
      );
      res.send(exported.csv);
    } catch (error) {
      if (String(error.message).includes('no reviews')) return res.status(404).json({ error: error.message });
      return next(error);
    }
  });

  app.get('/api/v1/meta', (req, res) => {
    const settings = store.getSettings();
    res.json({
      version: appVersion,
      cities: CITIES,
      defaults: DEFAULTS,
      apiTokenRequired: Boolean(settings.apiToken),
      docs: 'POST /api/v1/tasks with mode search, links, or country. See the API page in the app.',
    });
  });

  app.get('/', (req, res) => {
    res.json({
      name: 'MapScraper local API',
      version: appVersion,
      health: '/api/v1/health',
      endpoints: [
        'GET /api/v1/tasks',
        'POST /api/v1/tasks',
        'GET /api/v1/tasks/:id',
        'GET /api/v1/tasks/:id/results',
        'GET /api/v1/tasks/:id/export?format=leads|reviews',
        'POST /api/v1/tasks/:id/cancel',
        'POST /api/v1/tasks/:id/rerun',
        'DELETE /api/v1/tasks/:id',
        'GET /api/v1/meta',
      ],
    });
  });

  app.use((req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.code === 'INVALID_INPUT' ? 400 : 500;
    return res.status(status).json({ error: error.message || 'Unexpected server error.' });
  });

  const { server, port } = await listenWithFallback(app, Number(preferredPort) || 4319);
  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

module.exports = { startApiServer };
