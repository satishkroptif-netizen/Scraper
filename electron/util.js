'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = 'tsk') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function atomicWrite(file, contents) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  await fsp.writeFile(tmp, contents, 'utf8');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fsp.rename(tmp, file);
      return;
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'EACCES') throw error;
      await sleep(60 * (attempt + 1));
    }
  }
  await fsp.rm(tmp, { force: true });
  throw new Error(`Could not write ${path.basename(file)}. Close any app that may have it open and try again.`);
}

async function readJson(file, fallback = null) {
  try {
    const text = await fsp.readFile(file, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function safeFilePart(value, fallback = 'export') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '')
    .slice(0, 70);
  return cleaned || fallback;
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function safeMessage(error) {
  if (!error) return 'Something went wrong.';
  const message = typeof error === 'string' ? error : error.message;
  return String(message || 'Something went wrong.').slice(0, 1200);
}

function isDirectory(value) {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
}

module.exports = {
  atomicWrite,
  formatDate,
  isDirectory,
  nowIso,
  readJson,
  safeFilePart,
  safeMessage,
  sleep,
  uid,
};
