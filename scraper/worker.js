'use strict';

const { MapsScraper } = require('./maps-scraper');

let scraper = null;
let started = false;
let cancelRequested = false;
let finished = false;

function send(type, payload) {
  if (!process.connected) return;
  try {
    process.send({ type, payload });
  } catch {
    // parent may have gone away
  }
}

function log(level, message) {
  send('log', { level, message, time: new Date().toISOString() });
}

function finish(status, error = null) {
  if (finished) return;
  finished = true;
  if (error) {
    send('error', {
      code: error.code || 'SCRAPE_FAILED',
      message: error.message || 'The search failed.',
    });
  } else {
    send('done', { status });
  }
  setTimeout(() => process.exit(0), 350);
}

async function start(payload) {
  if (started) return;
  started = true;
  const { task, profileDir, browser, appVersion } = payload || {};
  if (!task) {
    finish('failed', new Error('No search details were provided.'));
    return;
  }

  scraper = new MapsScraper({
    profileDir,
    browser,
    appVersion,
    emit: (type, data) => send(type, data),
    log,
  });

  try {
    const result = await scraper.run(task);
    if (cancelRequested || result.status === 'cancelled') {
      finish('cancelled');
      return;
    }
    log('success', `Collected ${scraper.foundCount || 0} ${scraper.foundCount === 1 ? 'business' : 'businesses'}.`);
    finish('completed');
  } catch (error) {
    if (cancelRequested || error?.code === 'CANCELLED') {
      finish('cancelled');
      return;
    }
    if (error?.name === 'TimeoutError') {
      finish(
        'failed',
        Object.assign(new Error('Google Maps took too long to respond. Check your connection and try again.'), {
          code: 'TIMEOUT',
        })
      );
      return;
    }
    if (/Target page, context or browser has been closed/i.test(String(error?.message))) {
      finish(
        'failed',
        Object.assign(
          new Error('The Chrome window was closed. Keep it open while a search runs, then try again.'),
          { code: 'BROWSER_CLOSED' }
        )
      );
      return;
    }
    finish('failed', error);
  } finally {
    await scraper?.close().catch(() => {});
  }
}

process.on('message', (message) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'start') {
    start(message.payload).catch((error) => finish('failed', error));
    return;
  }
  if (message.type === 'cancel') {
    cancelRequested = true;
    scraper?.abort();
    if (!started) finish('cancelled');
    return;
  }
  if (message.type === 'shutdown') {
    scraper?.close().then(() => process.exit(0)).catch(() => process.exit(0));
  }
});

process.on('uncaughtException', (error) => {
  finish('failed', error);
});
process.on('unhandledRejection', (error) => {
  finish('failed', error instanceof Error ? error : new Error(String(error)));
});
process.on('disconnect', () => {
  scraper?.abort();
  process.exit(0);
});
