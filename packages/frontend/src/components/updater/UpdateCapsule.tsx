import { useEffect } from 'react';
import { Download, Loader2, Rocket, Zap } from 'lucide-react';
import { useUpdaterStore, isUpdaterAvailable } from '@/store/updater.store';

/**
 * Tier 2 update capsule (TB-138) — visible only in the desktop shell and
 * only for actionable states (available/downloading/downloaded).
 */
export function UpdateCapsule() {
  const status = useUpdaterStore((s) => s.status);
  const progress = useUpdaterStore((s) => s.progress);
  const version = useUpdaterStore((s) => s.version);
  const setModalOpen = useUpdaterStore((s) => s.setModalOpen);
  const subscribe = useUpdaterStore((s) => s.subscribe);
  const startDownload = useUpdaterStore((s) => s.startDownload);

  useEffect(() => {
    subscribe();
  }, [subscribe]);

  if (!isUpdaterAvailable()) return null;
  if (status === 'idle' || status === 'not-available' || status === 'checking' || status === 'error') return null;

  if (status === 'downloading') {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-950/55 px-3 py-1.5 text-xs font-medium text-cyan-300"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        <span>جارٍ تنزيل التحديث</span>
        <span dir="ltr" className="font-mono tabular-nums">{progress}%</span>
      </div>
    );
  }

  if (status === 'downloaded') {
    return (
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex animate-pulse items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-extrabold text-emerald-300 shadow-lg shadow-emerald-500/20 hover:bg-emerald-500/25"
      >
        <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
        <span>تحديث جاهز: <span dir="ltr" className="font-mono tabular-nums">v{version}</span></span>
      </button>
    );
  }

  // available
  return (
    <button
      type="button"
      onClick={() => void startDownload()}
      className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-950/55 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/15"
    >
      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
      <span>يتوفر إصدار جديد <span dir="ltr" className="font-mono tabular-nums">v{version}</span></span>
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
