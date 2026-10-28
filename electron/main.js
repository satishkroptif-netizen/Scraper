'use strict';

const path = require('path');
const fsp = require('fs/promises');
const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  clipboard,
  dialog,
  ipcMain,
  shell,
} = require('electron');

app.setName('Step in Scraper');
app.setAppUserModelId('com.stepinscraper.app');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

const { buildPaths } = require('./paths');
const { Store } = require('./store');
const { TaskService } = require('./task-service');
const { detectBrowser, openSignInWindow, checkSignedIn } = require('./chrome');
const { startApiServer } = require('./api-server');
const { DISCLAIMER, REVIEW_NOTE } = require('../shared/constants');
const { safeMessage } = require('./util');
const { loadLicense, validateLicense, hardwareId } = require('./license');

// MAPSCRAPER_USER_DATA keeps test runs (and portable copies) away from the real
// profile. Normal installs always use %APPDATA%\Step in Scraper.
app.setPath(
  'userData',
  process.env.MAPSCRAPER_USER_DATA
    ? path.resolve(process.env.MAPSCRAPER_USER_DATA)
    : path.join(app.getPath('appData'), 'Step in Scraper')
);

const paths = buildPaths();
const browser = detectBrowser();
let store = null;
let service = null;
let api = null;
let apiError = null;
let mainWindow = null;
let allowClose = false;

function iconPath() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  return candidates.find((candidate) => {
    try {
      require('fs').accessSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function register(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return { ok: true, data: await handler(event, ...args) };
    } catch (error) {
      return { ok: false, error: safeMessage(error) };
    }
  });
}

function validateExternal(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new Error('That link is not valid.');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Only http and https links can be opened.');
  return parsed.toString();
}

async function createApi() {
  if (api) {
    await api.close().catch(() => {});
    api = null;
  }
  apiError = null;
  try {
    const settings = store.getSettings();
    api = await startApiServer({
      store,
      service,
      appVersion: app.getVersion(),
      preferredPort: settings.apiPort,
    });
    if (api.port !== settings.apiPort) {
      await store.saveSettings({ apiPort: api.port });
    }
    send('api:info', { url: api.url, port: api.port, error: null });
  } catch (error) {
    apiError = safeMessage(error);
    send('api:info', { url: null, port: null, error: apiError });
  }
}

function apiInfo() {
  if (!api) return { url: null, port: null, error: apiError };
  return { url: api.url, port: api.port, error: null };
}

async function appInfo() {
  const settings = store.getSettings();
  return {
    name: 'Step in Scraper',
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    paths: {
      dataDir: paths.dataDir,
      profileDir: paths.profileDir,
      documents: paths.documents,
    },
    chrome: browser,
    api: apiInfo(),
    apiTokenRequired: Boolean(settings.apiToken),
    activeTaskId: service?.active?.task?.id || null,
    disclaimer: DISCLAIMER,
    reviewNote: REVIEW_NOTE,
  };
}

function registerIpc() {
  register('app:info', () => appInfo());
  register('app:open-external', async (event, url) => {
    await shell.openExternal(validateExternal(url));
    return true;
  });
  register('app:open-data-folder', async () => {
    await fsp.mkdir(paths.dataDir, { recursive: true });
    const error = await shell.openPath(paths.dataDir);
    if (error) throw new Error(error);
    return true;
  });
  register('app:open-profile-folder', async () => {
    await fsp.mkdir(paths.profileDir, { recursive: true });
    const error = await shell.openPath(paths.profileDir);
    if (error) throw new Error(error);
    return true;
  });
  register('app:copy-text', async (event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  register('tasks:list', () => service.list());
  register('tasks:get', async (event, id) => {
    const task = await service.get(id);
    if (!task) throw new Error('Search not found.');
    return task;
  });
  register('tasks:create', async (event, payload) => service.create(payload));
  register('tasks:cancel', async (event, id) => service.cancel(id));
  register('tasks:delete', async (event, id) => {
    await service.delete(id);
    return true;
  });
  register('tasks:rerun', async (event, id) => {
    const task = await service.rerun(id);
    if (!task) throw new Error('Search not found.');
    return task;
  });
  register('tasks:clear-all', async () => {
    await service.clearAll();
    return true;
  });
  register('tasks:export', async (event, { id, kind }) => {
    const exported = await service.getExport(id, kind === 'reviews' ? 'reviews' : 'leads');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: kind === 'reviews' ? 'Export reviews' : 'Export leads',
      defaultPath: path.join(paths.documents, exported.filename),
      filters: [{ name: 'CSV spreadsheet', extensions: ['csv'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await fsp.writeFile(result.filePath, exported.csv, 'utf8');
    return { saved: true, path: result.filePath, filename: path.basename(result.filePath) };
  });

  register('settings:get', () => store.getSettings());
  register('settings:save', async (event, patch) => {
    const before = store.getSettings();
    const settings = await store.saveSettings(patch);
    if (before.apiPort !== settings.apiPort) {
      await createApi();
    }
    send('api:info', { ...apiInfo(), tokenRequired: Boolean(settings.apiToken) });
    return { settings, api: apiInfo() };
  });

  register('license:info', () => {
    const machineId = hardwareId();
    let license = null;
    try {
      license = loadLicenseSync(paths.dataDir);
    } catch {
      license = null;
    }
    return { machineId, license, valid: Boolean(license && validateLicense(license, machineId).valid) };
  });

  register('browser:open-signin', async () => {
    if (service?.active) {
      throw new Error('Finish or cancel the running search before connecting Google.');
    }
    await fsp.mkdir(paths.profileDir, { recursive: true });
    openSignInWindow(paths.profileDir, browser);
    return true;
  });

  register('browser:check-signin', async () => {
    if (service?.active) {
      throw new Error('Finish or cancel the running search before checking the Google connection.');
    }
    return checkSignedIn(paths.profileDir, browser);
  });
}

function serviceNotifications({ title, body }) {
  if (!Notification.isSupported()) return;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) return;
  const notification = new Notification({
    title,
    body: String(body || '').slice(0, 220),
    icon: iconPath(),
    silent: false,
  });
  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
}

function wireService() {
  service.on('update', (summary) => send('task:update', summary));
  service.on('log', (payload) => send('task:log', payload));
  service.on('result', (payload) => send('task:result', payload));
  service.on('done', (payload) => send('task:done', payload));
  service.on('removed', (payload) => send('task:removed', payload));
  service.on('cleared', () => send('tasks:cleared'));
  service.on('error', (error) => send('app:error', { message: safeMessage(error) }));
}

function buildMenu() {
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(process.env.VITE_DEV_SERVER_URL ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const settings = store.getSettings();
  const bounds = settings.windowBounds || {};
  const options = {
    width: Math.max(1080, Number(bounds.width) || 1420),
    height: Math.max(700, Number(bounds.height) || 920),
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Step in Scraper',
    backgroundColor: '#f5f3ee',
    autoHideMenuBar: true,
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  };
  if (Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
    options.x = bounds.x;
    options.y = bounds.y;
  }

  mainWindow = new BrowserWindow(options);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!store.getSettings().windowBounds) mainWindow.center();
  });

  mainWindow.on('close', (event) => {
    if (!allowClose && service?.active) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: 'Search in progress',
        message: 'A search is still running.',
        detail: 'If you quit now, the search stops. Partial results are saved and you can run it again later.',
        buttons: ['Keep running', 'Quit anyway'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (choice === 0) {
        event.preventDefault();
        return;
      }
      allowClose = true;
      service.shutdown();
    }
    if (!mainWindow.isMinimized() && !mainWindow.isMaximized()) {
      const [width, height] = mainWindow.getSize();
      const [x, y] = mainWindow.getPosition();
      store.saveSettings({ windowBounds: { x, y, width, height } }).catch(() => {});
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      shell.openExternal(validateExternal(url));
    } catch {
      // ignore invalid links
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL();
    const allowed =
      (devUrl && url.startsWith(devUrl)) ||
      (url.startsWith('file://') && current.startsWith('file://'));
    if (!allowed) {
      event.preventDefault();
      try {
        shell.openExternal(validateExternal(url));
      } catch {
        // ignore
      }
    }
  });

  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Step in Scraper restarted',
        message: 'The app window stopped unexpectedly.',
        detail: `Reason: ${details.reason}. Step in Scraper will reload.`,
        buttons: ['OK'],
      }).then(() => mainWindow?.reload());
    }
  });
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  await fsp.mkdir(paths.dataDir, { recursive: true });
  store = new Store(paths);
  store.onError((error) => send('app:error', { message: safeMessage(error) }));

  try {
    await store.init();
  } catch (error) {
    dialog.showErrorBox(
      'Step in Scraper could not start',
      `Your data folder could not be opened.\n\n${safeMessage(error)}\n\nFolder: ${paths.dataDir}`
    );
    app.quit();
    return;
  }

  service = new TaskService(store, {
    paths,
    browser,
    appVersion: app.getVersion(),
    onNotify: serviceNotifications,
  });
  wireService();
  registerIpc();
  buildMenu();

  // --- License validation (offline, self-signed) ---------------------------
  const machineId = hardwareId();
  let license = null;
  try {
    license = await loadLicense(paths.dataDir);
  } catch {
    license = null;
  }

  const licenseResult = license ? validateLicense(license, machineId) : { valid: false, reason: null };

  if (!licenseResult.valid) {
    const dataDir = paths.dataDir;
    const message = licenseResult.reason
      ? licenseResult.reason + '\n\n'
      : 'No valid license found.\n\n';
    const detail = `${message}Place your signed license.json file in:\n${dataDir}\n\nThen restart Step in Scraper.`;
    dialog.showErrorBox('Step in Scraper — License required', detail);
    app.quit();
    return;
  }

  await createApi();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  allowClose = true;
  service?.shutdown();
  api?.close().catch(() => {});
});
