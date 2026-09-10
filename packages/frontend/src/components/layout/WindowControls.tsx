import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

type ElectronWindowBridge = {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (cb: (maximized: boolean) => void) => () => void;
};

function bridge(): ElectronWindowBridge | null {
  try {
    const w = window as unknown as { electronAPI?: { window?: ElectronWindowBridge } };
    return w.electronAPI?.window ?? null;
  } catch {
    return null;
  }
}

/** True when running inside the Electron shell (bridge present). */
export function isDesktopShell(): boolean {
  return bridge() !== null;
}

export function useDesktopVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    try {
      const w = window as unknown as { electronAPI?: { getVersion?: () => Promise<string> } };
      w.electronAPI?.getVersion?.().then(setVersion).catch(() => null);
    } catch {
      /* browser — no version */
    }
  }, []);
  return version;
}

/**
 * Native Windows window controls for the frameless shell (TB-131).
 * Hidden in browser mode (no bridge). All buttons are no-drag regions.
 */
export function WindowControls() {
  const [available, setAvailable] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    setAvailable(true);
    b.isMaximized().then(setMaximized).catch(() => null);
    const off = b.onMaximizedChange(setMaximized);
    return off;
  }, []);

  if (!available) return null;
  const b = bridge();

  const base =
    'inline-flex h-8 w-11 items-center justify-center text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-500/60';
  const softHover = 'hover:bg-slate-800/70 hover:text-white';

  return (
    <div className="app-no-drag flex shrink-0 items-stretch" dir="ltr" aria-label="أزرار النافذة">
      <button
        type="button"
        aria-label="تصغير"
        title="تصغير"
        onClick={() => void b?.minimize().catch(() => null)}
        className={`${base} ${softHover}`}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'استعادة' : 'تكبير'}
        title={maximized ? 'استعادة' : 'تكبير'}
        onClick={() => {
          setMaximized((v) => !v);
          void b?.toggleMaximize().catch(() => setMaximized((v) => !v));
        }}
        className={`${base} ${softHover}`}
      >
        {maximized ? <Copy className="h-3.5 w-3.5" aria-hidden="true" /> : <Square className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label="إغلاق"
        title="إغلاق"
        onClick={() => void b?.close().catch(() => null)}
        className={`${base} hover:bg-rose-600 hover:text-white`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Toggle maximize from background layers (e.g. header double-click). */
export function toggleWindowMaximize(): void {
  void bridge()?.toggleMaximize().catch(() => null);
}
