'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const WINDOWS_CANDIDATES = [
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];

const EDGE_CANDIDATES = [
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];

function versionFromFolder(exePath) {
  try {
    const appDir = path.dirname(exePath);
    const versions = fs
      .readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 4; i += 1) {
          if (pa[i] !== pb[i]) return pa[i] - pb[i];
        }
        return 0;
      });
    return versions.at(-1) || null;
  } catch {
    return null;
  }
}

function detectBrowser() {
  for (const exePath of WINDOWS_CANDIDATES) {
    if (!exePath) continue;
    try {
      if (fs.existsSync(exePath)) {
        return { found: true, name: 'Google Chrome', path: exePath, version: versionFromFolder(exePath), channel: 'chrome' };
      }
    } catch {
      // keep looking
    }
  }
  for (const exePath of EDGE_CANDIDATES) {
    if (!exePath) continue;
    try {
      if (fs.existsSync(exePath)) {
        return { found: true, name: 'Microsoft Edge', path: exePath, version: versionFromFolder(exePath), channel: 'msedge' };
      }
    } catch {
      // keep looking
    }
  }
  return { found: false, name: null, path: null, version: null, channel: null };
}

function openSignInWindow(profileDir, browser) {
  if (!browser?.found) throw new Error('Google Chrome was not found on this computer.');
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [
    `--user-data-dir=${profileDir}`,
    '--profile-directory=Default',
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fwww.google.com%2Fmaps',
  ];
  const child = spawn(browser.path, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return { opened: true };
}

async function checkSignedIn(profileDir, browser) {
  if (!browser?.found) return { signedIn: false, error: 'Chrome was not found.' };
  const { chromium } = require('playwright-core');
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      executablePath: browser.path,
      headless: true,
      viewport: { width: 1200, height: 800 },
      locale: 'en-US',
      args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
    });
    const cookies = await context.cookies('https://www.google.com');
    const names = new Set(cookies.map((cookie) => cookie.name));
    const signedIn = ['SAPISID', 'SID', '__Secure-1PSID', '__Secure-3PSID'].some((name) => names.has(name));
    return { signedIn };
  } catch (error) {
    return {
      signedIn: false,
      error:
        'Could not check the Chrome profile. If the Chrome sign-in window is still open, close it and try again. ' +
        (error?.message || ''),
    };
  } finally {
    await context?.close().catch(() => {});
  }
}

module.exports = { checkSignedIn, detectBrowser, openSignInWindow };
