const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    fullscreen: false,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWindow.loadFile('index.html');
  
  // Toggle fullscreen with F11
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for music player
ipcMain.handle('open-music-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Music Folder'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    const musicFiles = getMusicFiles(folderPath);
    return { folderPath, files: musicFiles };
  }
  return null;
});

ipcMain.handle('open-music-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] }
    ],
    title: 'Select Music Files'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths.map(filePath => ({
      path: filePath,
      name: path.basename(filePath, path.extname(filePath)),
      ext: path.extname(filePath)
    }));
  }
  return null;
});

function getMusicFiles(folderPath) {
  const musicExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
  const files = [];
  
  try {
    const items = fs.readdirSync(folderPath);
    for (const item of items) {
      const fullPath = path.join(folderPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase();
        if (musicExtensions.includes(ext)) {
          files.push({
            path: fullPath,
            name: path.basename(item, ext),
            ext: ext
          });
        }
      }
    }
  } catch (err) {
    console.error('Error reading music folder:', err);
  }
  
  return files;
}

// Window controls
ipcMain.on('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('close-window', () => {
  mainWindow.close();
});

ipcMain.on('toggle-fullscreen', () => {
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
