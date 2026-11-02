const { app, BrowserWindow, session, dialog } = require('electron');
const path = require('node:path');

function openWindow() {
  const window = new BrowserWindow({
    width: 1400, height: 930, minWidth: 980, minHeight: 700,
    backgroundColor: '#111413', title: 'Palco Multitracks',
    autoHideMenuBar: true,
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
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  openWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) openWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
