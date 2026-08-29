import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function resolveBackendPath(): string {
  if (app.isPackaged) {
    // In production: resources/backend/dist/main.js relative to app.getAppPath()
    return path.join(process.resourcesPath, 'backend', 'dist', 'main.js');
  } else {
    // In development: packages/backend/dist/main.js relative to project root
    return path.join(__dirname, '..', '..', 'packages', 'backend', 'dist', 'main.js');
  }
}

function spawnBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const backendPath = resolveBackendPath();
    const env = { ...process.env, PORT: '3001' };

    console.log(`[Desktop] Spawning backend from: ${backendPath}`);

    const child = spawn('node', [backendPath], {
      env,
      stdio: app.isPackaged ? 'ignore' : 'inherit',
      detached: false,
    });

    backendProcess = child;

    child.on('error', (err) => {
      console.error('[Desktop] Backend spawn error:', err);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      console.log(`[Desktop] Backend exited with code ${code}, signal ${signal}`);
      backendProcess = null;
    });

    // Wait for backend health check
    const startTime = Date.now();
    const timeoutMs = 30000;
    const pollIntervalMs = 500;

    const checkHealth = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/health');
        if (response.ok) {
          console.log('[Desktop] Backend health check passed');
          resolve();
          return;
        }
      } catch {
        // Ignore errors, keep polling
      }

      if (Date.now() - startTime > timeoutMs) {
        reject(new Error('Backend failed to start within 30 seconds'));
        return;
      }

      setTimeout(checkHealth, pollIntervalMs);
    };

    checkHealth();
  });
}

function killBackend(): void {
  if (backendProcess) {
    console.log('[Desktop] Killing backend process...');
    backendProcess.kill('SIGTERM');
    // Force kill after 3 seconds
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        backendProcess.kill('SIGKILL');
      }
    }, 3000);
    backendProcess = null;
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'BarakaMobile',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const loadUrl = app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'dist', 'index.html')
    : 'http://localhost:5173';

  console.log(`[Desktop] Loading frontend from: ${loadUrl}`);

  if (app.isPackaged) {
    await mainWindow.loadFile(loadUrl);
  } else {
    await mainWindow.loadURL(loadUrl);
  }
}

app.whenReady().then(async () => {
  try {
    // Setup IPC for preload
    ipcMain.handle('get-version', () => app.getVersion());

    // Start backend
    await spawnBackend();

    // Create window after backend is ready
    await createWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
      }
    });
  } catch (err) {
    console.error('[Desktop] Failed to start:', err);
    dialog.showErrorBox(
      'BarakaMobile - Startup Error',
      `Failed to start the application:\n${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On Windows, quit when all windows closed
  app.quit();
});

app.on('will-quit', () => {
  killBackend();
});

// Ensure backend is killed on any exit
process.on('exit', killBackend);
process.on('SIGINT', () => {
  killBackend();
  app.quit();
});
process.on('SIGTERM', () => {
  killBackend();
  app.quit();
});