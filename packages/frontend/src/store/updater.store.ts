import { create } from 'zustand';
import { api } from '@/lib/api';

/**
 * Desktop updater state (TB-138, AD-74) — mirrors the native engine in
 * packages/desktop/src/updater.ts. Graceful no-op outside Electron.
 */

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type RendererUpdaterState = {
  status: UpdaterStatus;
  currentVersion?: string;
  targetVersion?: string | null;
  releaseNotes?: string | null;
  totalBytes?: number;
  transferredBytes?: number;
  percent?: number;
  bytesPerSecond?: number;
  error?: string | null;
};

type Bridge = {
  check: () => Promise<RendererUpdaterState>;
  startDownload: () => Promise<RendererUpdaterState>;
  installNow: () => Promise<void>;
  getStatus: () => Promise<RendererUpdaterState>;
  onStatusChange: (cb: (s: RendererUpdaterState) => void) => () => void;
};

function bridge(): Bridge | null {
  try {
    const w = window as unknown as { electronAPI?: { updater?: Bridge } };
    return w.electronAPI?.updater ?? null;
  } catch {
    return null;
  }
}

export function isUpdaterAvailable(): boolean {
  return bridge() !== null;
}

type UpdaterStore = {
  status: UpdaterStatus;
  progress: number;
  version: string | null;
  releaseNotes: string | null;
  error: string | null;
  modalOpen: boolean;
  backingUp: boolean;
  subscribed: boolean;
  setModalOpen: (open: boolean) => void;
  subscribe: () => void;
  check: () => Promise<void>;
  startDownload: () => Promise<void>;
  install: () => Promise<void>;
};

function applyState(s: RendererUpdaterState) {
  useUpdaterStore.setState({
    status: s.status,
    progress: typeof s.percent === 'number' ? s.percent : 0,
    version: s.targetVersion ?? null,
    releaseNotes: s.releaseNotes ?? null,
    error: s.error ?? null,
  });
}

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  status: 'idle',
  progress: 0,
  version: null,
  releaseNotes: null,
  error: null,
  modalOpen: false,
  backingUp: false,
  subscribed: false,

  setModalOpen: (open) => set({ modalOpen: open }),

  subscribe: () => {
    if (get().subscribed) return;
    const b = bridge();
    if (!b) return;
    set({ subscribed: true });
    b.onStatusChange(applyState);
    b.getStatus().then(applyState).catch(() => null);
  },

  check: async () => {
    const b = bridge();
    if (!b) return;
    set({ status: 'checking', error: null });
    try {
      applyState(await b.check());
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  startDownload: async () => {
    const b = bridge();
    if (!b) return;
    try {
      applyState(await b.startDownload());
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  /** Pre-Update Safety Shield: mandatory backup snapshot, then install. */
  install: async () => {
    const b = bridge();
    if (!b) return;
    set({ backingUp: true, error: null });
    try {
      // Mandatory safety snapshot (label pre-update); a backup failure
      // blocks the install — data safety first.
      await api.post<{ success: boolean }>('/backup/create');
    } catch (e) {
      set({ backingUp: false, error: `تعذّر أخذ نسخة الأمان: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    set({ backingUp: false });
    try {
      await b.installNow();
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
