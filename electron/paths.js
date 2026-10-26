'use strict';

const path = require('path');
const { app } = require('electron');

function buildPaths() {
  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'data');
  return {
    userData,
    dataDir,
    tasksDir: path.join(dataDir, 'tasks'),
    settingsFile: path.join(dataDir, 'settings.json'),
    indexFile: path.join(dataDir, 'tasks-index.json'),
    profileDir: path.join(userData, 'chrome-profile'),
    logsDir: path.join(dataDir, 'logs'),
    documents: app.getPath('documents'),
  };
}

module.exports = { buildPaths };
