const { app, BrowserWindow, session, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function openSplash() {
  const splash = new BrowserWindow({
    width: 620, height: 340, frame: false, resizable: false, alwaysOnTop: true,
    center: true, show: false, backgroundColor: '#202020',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  splash.loadFile(path.join(__dirname, '../src/splash.html'));
  splash.once('ready-to-show', () => splash.show());
  return splash;
}

function openWindow(splash) {
  const window = new BrowserWindow({
    width: 1400, height: 930, minWidth: 980, minHeight: 700,
    backgroundColor: '#171717', title: 'Palco Multitracks',
    autoHideMenuBar: true, show: false,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question', buttons: ['Continuar sessão', 'Fechar'], defaultId: 0, cancelId: 0,
      title: 'Fechar sessão?', message: 'A sessão atual não será salva.',
      detail: 'Os arquivos de áudio originais permanecem no computador.'
    });
    if (choice === 1) event.preventDefault();
  });
  window.loadFile(path.join(__dirname, '../src/index.html'));
  window.once('ready-to-show', () => {
    setTimeout(() => {
      if (!window.isDestroyed()) { window.show(); window.focus(); }
      if (splash && !splash.isDestroyed()) splash.close();
    }, 1400);
  });
  return window;
}

app.whenReady().then(() => {
  ipcMain.handle('project:save', async (_event, content) => {
    const result = await dialog.showSaveDialog({
      title: 'Salvar projeto Palco', defaultPath: 'projeto-palco.palco.json',
      filters: [{ name: 'Projeto Palco', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, content, 'utf8');
    return { canceled: false, path: result.filePath };
  });
  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Abrir projeto Palco', properties: ['openFile'],
      filters: [{ name: 'Projeto Palco', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, path: result.filePaths[0], content: await fs.readFile(result.filePaths[0], 'utf8') };
  });
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'speaker-selection'));
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'speaker-selection');
  const splash = openSplash();
  openWindow(splash);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) openWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
