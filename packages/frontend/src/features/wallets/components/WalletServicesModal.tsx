import { X, Settings2 } from 'lucide-react';
import { WalletServicesPanel } from './WalletServicesPanel';

type Props = {
  open: boolean;
  walletId: string | null;
  onClose: () => void;
};

/** Modal shell around the shared services manager (cockpit entry point). */
export function WalletServicesModal({ open, walletId, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="إعدادات الخدمات والعمولات"
        className="scrollbar-premium relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900 p-5 text-slate-100 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
              <Settings2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-base font-extrabold tracking-tight">إعدادات الخدمات والعمولات</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <WalletServicesPanel walletId={walletId} />
      </div>
    </div>
  );
}
