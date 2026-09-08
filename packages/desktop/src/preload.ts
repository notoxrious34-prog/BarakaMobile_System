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
});
