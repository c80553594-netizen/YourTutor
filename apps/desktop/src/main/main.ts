import { app, BrowserWindow, safeStorage } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage, NodeSqliteDriver } from '@yourtutor/storage';
import { registerDesktopIpcHandlers } from './ipc.js';
import { ElectronSafeStorageSecretStore } from './secret-store.js';
import { DesktopTutorController } from './tutor-controller.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let controller: DesktopTutorController | null = null;

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 380,
    minHeight: 640,
    title: 'YourTutor — AI Reverse-Engineering Exam Tutor',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.YOURTUTOR_DEV_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap(): Promise<void> {
  const userDataDir = app.getPath('userData');
  const dbPath = join(userDataDir, 'yourtutor.sqlite');
  const vaultPath = join(userDataDir, 'secrets.vault.json');

  const driver = new NodeSqliteDriver(dbPath);
  const storage = await createStorage(driver);
  const secretStore = new ElectronSafeStorageSecretStore(vaultPath, safeStorage);

  controller = new DesktopTutorController({ storage, secretStore });
  await controller.initializeFromStoredConfigs();
  registerDesktopIpcHandlers(controller);

  await createMainWindow();
}

void app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (controller) {
    void controller.companionServer.stop();
    void controller.storage.close();
  }
});
