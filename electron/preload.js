'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('mapscraper', {
  platform: process.platform,
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
    openProfileFolder: () => ipcRenderer.invoke('app:open-profile-folder'),
    copyText: (text) => ipcRenderer.invoke('app:copy-text', text),
    openSignIn: () => ipcRenderer.invoke('browser:open-signin'),
    checkSignIn: () => ipcRenderer.invoke('browser:check-signin'),
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id) => ipcRenderer.invoke('tasks:get', id),
    create: (payload) => ipcRenderer.invoke('tasks:create', payload),
    cancel: (id) => ipcRenderer.invoke('tasks:cancel', id),
    delete: (id) => ipcRenderer.invoke('tasks:delete', id),
    rerun: (id) => ipcRenderer.invoke('tasks:rerun', id),
    export: (id, kind) => ipcRenderer.invoke('tasks:export', { id, kind }),
    clearAll: () => ipcRenderer.invoke('tasks:clear-all'),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch) => ipcRenderer.invoke('settings:save', patch),
  },
  license: {
    info: () => ipcRenderer.invoke('license:info'),
  },
  onTaskUpdate: (callback) => subscribe('task:update', callback),
  onTaskLog: (callback) => subscribe('task:log', callback),
  onTaskResult: (callback) => subscribe('task:result', callback),
  onTaskDone: (callback) => subscribe('task:done', callback),
  onTaskRemoved: (callback) => subscribe('task:removed', callback),
  onTasksCleared: (callback) => subscribe('tasks:cleared', callback),
  onAppError: (callback) => subscribe('app:error', callback),
  onApiInfo: (callback) => subscribe('api:info', callback),
});
