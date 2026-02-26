const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { fork, spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For easier IPC initially, consider security later
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built React app
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  const scriptPath = path.join(__dirname, '../scripts/local-ffmpeg-server.js');

  // In production, we might need to handle the script path differently
  // if it's bundled. But since we are forking, we expect the file to exist.
  // We'll ensure "scripts" folder is copied to resources in build config.

  // Set env vars for the server to know where ffmpeg binaries are
  const ffmpegPath = require('ffmpeg-static');
  const ffprobePath = require('ffprobe-static').path;

  const env = {
    ...process.env,
    FFMPEG_PATH: ffmpegPath.replace('app.asar', 'app.asar.unpacked'),
    FFPROBE_PATH: ffprobePath.replace('app.asar', 'app.asar.unpacked'),
    ELECTRON_RUN: 'true'
  };

  if (!isDev) {
     // In prod, resources are often in process.resourcesPath
     // We need to make sure the server script uses correct CWD
     env.CWD_OVERRIDE = process.resourcesPath;
  }

  console.log('Starting server from:', scriptPath);

  serverProcess = fork(scriptPath, [], {
    env,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server]: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server ERR]: ${data}`);
  });
}

app.on('ready', () => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
