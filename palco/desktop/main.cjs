const { app, BrowserWindow, session, dialog } = require('electron');
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
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
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'speaker-selection'));
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'speaker-selection');
  const splash = openSplash();
  openWindow(splash);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) openWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
