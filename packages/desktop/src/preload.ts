import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: (): Promise<string> => ipcRenderer.invoke('get-version'),
  platform: process.platform,
  exportInvoicePDF: (invoiceNumber?: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('export-invoice-pdf', invoiceNumber),
  exportViewPDF: (suggestedFileName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('export-view-pdf', suggestedFileName),
  pickBackupFile: (): Promise<{ canceled: boolean; filePath: string | null }> => ipcRenderer.invoke('pick-backup-file'),
  saveBackupFile: (suggestedName?: string): Promise<{ canceled: boolean; filePath: string | null }> =>
    ipcRenderer.invoke('save-backup-file', suggestedName),
  // TB-131: frameless window controls (absent in browser mode — renderer hides).
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) => {
      const listener = (_event: unknown, maximized: boolean) => cb(maximized);
      ipcRenderer.on('window:maximized-changed', listener as never);
      return () => ipcRenderer.removeListener('window:maximized-changed', listener as never);
    },
  },
});
