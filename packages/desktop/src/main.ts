import { app, BrowserWindow, shell, dialog, ipcMain, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function resolveBackendPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'index.js');
  } else {
    return path.join(__dirname, '..', '..', 'packages', 'backend', 'bundle_out', 'index.js');
  }
}

function resolveFrontendPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'frontend', 'dist', 'index.html');
  } else {
    return 'http://localhost:5173';
  }
}

function resolveNodeExecutable(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'node', 'node.exe');
  }
  return 'node';
}

function getDatabaseUrl(): string {
  if (app.isPackaged) {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const dbPath = path.join(userDataPath, 'barakamobile.db');
    if (!fs.existsSync(dbPath)) {
      const bundledDb = path.join(process.resourcesPath, 'backend', 'prisma', 'dev.db');
      try {
        if (fs.existsSync(bundledDb)) {
          fs.copyFileSync(bundledDb, dbPath);
          console.log(`[Desktop] Seeded database to ${dbPath}`);
        }
      } catch (e) {
        console.warn('[Desktop] Failed to seed database:', e);
      }
    }
    const normalized = dbPath.replace(/\\/g, '/');
    return `file:${normalized}`;
  } else {
    return 'file:./dev.db';
  }
}

function spawnBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const backendPath = resolveBackendPath();
    const databaseUrl = getDatabaseUrl();
    const nodeExecutable = resolveNodeExecutable();
    const prismaEnginePath = app.isPackaged
      ? path.join(process.resourcesPath, 'backend', 'prisma-client', 'query_engine-windows.dll.node')
      : '';
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: '3001',
      DATABASE_URL: databaseUrl,
      ...(prismaEnginePath ? { PRISMA_QUERY_ENGINE_LIBRARY: prismaEnginePath } : {}),
    };
    let logPath: string | null = null;
    let stdioOption: any = app.isPackaged ? 'ignore' : 'inherit';

    if (app.isPackaged) {
      logPath = path.join(app.getPath('userData'), 'backend.log');
      try {
        // Overwrite on each launch for simplicity
        fs.writeFileSync(logPath, `BarakaMobile backend log — ${new Date().toISOString()}\n`, 'utf8');
      } catch {}
      try {
        const logFd = fs.openSync(logPath, 'a');
        stdioOption = ['ignore', logFd, logFd];
      } catch (e) {
        console.warn('[Desktop] Failed to open backend log file:', e);
        stdioOption = 'ignore';
      }
    }

    console.log(`[Desktop] Spawning backend from: ${backendPath}`);
    console.log(`[Desktop] Using node: ${nodeExecutable}`);
    console.log(`[Desktop] DATABASE_URL: ${databaseUrl}`);
    if (prismaEnginePath) console.log(`[Desktop] PRISMA_QUERY_ENGINE_LIBRARY: ${prismaEnginePath}`);
    if (logPath) console.log(`[Desktop] Backend log: ${logPath}`);

    const child = spawn(nodeExecutable, [backendPath], {
      env,
      stdio: stdioOption,
      detached: false,
      windowsHide: true,
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
        const suffix = logPath ? `. Check the log file at: ${logPath} for details.` : '';
        reject(new Error(`Backend failed to start within 30 seconds${suffix}`));
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
    try {
      backendProcess.kill('SIGTERM');
    } catch {}
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        try {
          backendProcess.kill('SIGKILL');
        } catch {}
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const loadUrl = resolveFrontendPath();

  console.log(`[Desktop] Loading frontend from: ${loadUrl}`);

  if (app.isPackaged) {
    await mainWindow.loadFile(loadUrl);
  } else {
    await mainWindow.loadURL(loadUrl);
  }
}

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    ipcMain.handle('get-version', () => app.getVersion());

    if (app.isPackaged) {
      await spawnBackend();
    }

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
  app.quit();
});

app.on('will-quit', () => {
  killBackend();
});

process.on('exit', killBackend);
process.on('SIGINT', () => {
  killBackend();
  app.quit();
});
process.on('SIGTERM', () => {
  killBackend();
  app.quit();
});
