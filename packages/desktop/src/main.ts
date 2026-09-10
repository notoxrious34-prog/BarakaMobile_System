import { app, BrowserWindow, shell, dialog, ipcMain, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, execSync, ChildProcess } from 'child_process';
import { updater, getAppVersion } from './updater';

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
      const candidates = [
        path.join(process.resourcesPath, 'backend', 'prisma', 'production-seed.db'),
        path.join(process.resourcesPath, 'backend', 'prisma', 'dev.db'),
      ];
      for (const bundledDb of candidates) {
        try {
          if (fs.existsSync(bundledDb)) {
            fs.copyFileSync(bundledDb, dbPath);
            console.log(`[Desktop] Seeded database to ${dbPath} from ${bundledDb}`);
            break;
          }
        } catch (e) {
          console.warn('[Desktop] Failed to seed database from', bundledDb, e);
        }
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
      // Hotfix: offline migration repair needs the bundled migration SQL files.
      ...(app.isPackaged
        ? { PRISMA_MIGRATIONS_DIR: path.join(process.resourcesPath, 'backend', 'prisma', 'migrations') }
        : {}),
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

/**
 * TB-145: synchronous backend process-TREE termination before the update
 * installer runs. On Windows the Prisma query-engine DLL stays memory-mapped
 * inside the backend Node process; taskkill /F /T releases every handle so
 * the installer never hits EBUSY. Zero deps — native child_process only.
 */
function killBackendTreeSync(): void {
  const proc = backendProcess;
  const pid = proc?.pid;
  backendProcess = null;
  if (!proc || !pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 10000 });
      return;
    } catch {
      try {
        proc.kill('SIGKILL');
      } catch {}
      return;
    }
  }
  try {
    proc.kill('SIGTERM');
  } catch {}
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'BarakaMobile',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    // TB-131: frameless command-center shell (custom WindowControls in renderer).
    frame: false,
    titleBarStyle: 'hidden',
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

  // TB-131: notify renderer of maximize state for toggle icon.
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false);
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
    ipcMain.handle('get-version', () => getAppVersion());
    // TB-137: native GitHub Releases updater (AD-74, zero-dep).
    const pushUpdater = () => {
      try {
        mainWindow?.webContents.send('updater:status-changed', updater.getStatus());
      } catch {
        /* renderer may be gone */
      }
    };
    const offUpdater = updater.onStatusChange(pushUpdater);
    process.on('exit', offUpdater);
    ipcMain.handle('updater:check', async () => {
      const s = await updater.check();
      pushUpdater();
      return s;
    });
    ipcMain.handle('updater:start-download', async () => {
      const s = await updater.startDownload();
      pushUpdater();
      return s;
    });
    ipcMain.handle('updater:install-now', () => {
      // TB-145: release the backend tree (DLL handles) BEFORE the
      // installer spawns — the engine owns the installer, main owns pid.
      killBackendTreeSync();
      return updater.installNow();
    });
    ipcMain.handle('updater:get-status', () => updater.getStatus());
    // TB-131: frameless window controls.
    ipcMain.handle('window:minimize', () => mainWindow?.minimize());
    ipcMain.handle('window:maximize', () => {
      if (!mainWindow) return;
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    });
    ipcMain.handle('window:close', () => mainWindow?.close());
    ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
    ipcMain.handle('export-invoice-pdf', async (_event, invoiceNumber?: string) => {
      if (!mainWindow) {
        return { success: false, error: 'no window' };
      }
      try {
        const pdfBuffer = await mainWindow.webContents.printToPDF({
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          pageSize: 'A4' as unknown as Record<string, unknown> as any,
          printBackground: true,
          preferCSSPageSize: true,
        } as unknown as Electron.PrintToPDFOptions);
        const defaultName = invoiceNumber && typeof invoiceNumber === 'string' && invoiceNumber.trim().length > 0
          ? `${invoiceNumber.trim()}.pdf`
          : `BarakaMobile-${new Date().toISOString().slice(0, 10)}.pdf`;
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
          title: 'حفظ الفاتورة كـ PDF',
          defaultPath: defaultName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (canceled || !filePath) {
          return { success: false, error: 'cancelled' };
        }
        fs.writeFileSync(filePath, pdfBuffer);
        return { success: true, filePath };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });
    ipcMain.handle('export-view-pdf', async (_event, suggestedFileName?: string) => {
      if (!mainWindow) {
        return { success: false, error: 'no window' };
      }
      try {
        const pdfBuffer = await mainWindow.webContents.printToPDF({
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          pageSize: 'A4' as unknown as Record<string, unknown> as any,
          printBackground: true,
          preferCSSPageSize: true,
        } as unknown as Electron.PrintToPDFOptions);
        const defaultName = suggestedFileName && typeof suggestedFileName === 'string' && suggestedFileName.trim().length > 0
          ? (suggestedFileName.trim().endsWith('.pdf') ? suggestedFileName.trim() : `${suggestedFileName.trim()}.pdf`)
          : `BarakaMobile-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
          title: 'حفظ التقرير كـ PDF',
          defaultPath: defaultName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (canceled || !filePath) {
          return { success: false, error: 'cancelled' };
        }
        fs.writeFileSync(filePath, pdfBuffer);
        return { success: true, filePath };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    });
    ipcMain.handle('pick-backup-file', async () => {
      if (!mainWindow) return { canceled: true, filePath: null as string | null };
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'اختر ملف النسخ الاحتياطي (.akb)',
        filters: [{ name: 'BarakaMobile Backup', extensions: ['akb'] }],
        properties: ['openFile'],
      });
      return { canceled, filePath: canceled ? null : filePaths[0] ?? null };
    });
    ipcMain.handle('save-backup-file', async (_event, suggestedName?: string) => {
      if (!mainWindow) return { canceled: true, filePath: null as string | null };
      const defaultName = suggestedName && suggestedName.trim() ? suggestedName.trim() : `BarakaMobile-${new Date().toISOString().slice(0, 10)}.akb`;
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'حفظ النسخة الاحتياطية',
        defaultPath: defaultName,
        filters: [{ name: 'BarakaMobile Backup', extensions: ['akb'] }],
      });
      return { canceled, filePath: canceled ? null : filePath ?? null };
    });

    if (app.isPackaged) {
      await spawnBackend();
    }

    await createWindow();

    // TB-137: silent update check 5s after boot (packaged only — no network
    // noise in dev, and dev version never matches a release tag).
    if (app.isPackaged) {
      setTimeout(() => {
        updater.check().then(pushUpdater).catch(() => null);
      }, 5000);
    }

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
