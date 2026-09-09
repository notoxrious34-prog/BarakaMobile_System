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
    'inline-flex h-9 w-11 items-center justify-center text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-500/60';

  return (
    <div className="flex shrink-0 items-stretch app-no-drag" aria-label="أزرار النافذة">
      <button
        type="button"
        aria-label="تصغير"
        title="تصغير"
        onClick={() => void b?.minimize().catch(() => null)}
        className={`${base} hover:bg-white/[0.08] hover:text-slate-100`}
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
        className={`${base} hover:bg-white/[0.08] hover:text-slate-100`}
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
