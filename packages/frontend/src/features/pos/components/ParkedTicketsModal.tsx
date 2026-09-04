import { RotateCcw, Trash2, X } from 'lucide-react';
import { arPlural } from '@/lib/arPlural';
import type { ParkedTicket } from '../hooks/useParkedTickets';

type Props = {
  parked: ParkedTicket[];
  onRestore: (p: ParkedTicket) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

/** Arabic elapsed time since ISO timestamp. */
export function elapsedAr(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 1) return 'الآن';
  if (mins < 60) {
    return `منذ ${arPlural(mins, { one: 'دقيقة واحدة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة' })}`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `منذ ${arPlural(hours, { one: 'ساعة واحدة', two: 'ساعتان', few: 'ساعات', many: 'ساعة' })}`;
  }
  const days = Math.floor(hours / 24);
  return `منذ ${arPlural(days, { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً' })}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-DZ', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * TB-070 multi-hold drawer — rich preview cards (customer + phone, elapsed
 * time, item names, net total). Restore/delete decisions stay with the caller.
 */
export function ParkedTicketsModal({ parked, onRestore, onDelete, onClose }: Props) {
  function confirmDelete(p: ParkedTicket): void {
    if (window.confirm(`حذف الفاتورة المعلقة (${p.customerLabel})؟`)) {
      onDelete(p.id);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="الفواتير المعلقة"
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex shrink-0 items-center justify-between border-b border-navy-border/30 p-4">
          <h3 className="text-sm font-bold text-slate-100">
            الفواتير المعلقة{' '}
            <span dir="ltr" className="font-mono text-xs text-slate-400">
              ({parked.length})
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="scrollbar-premium min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {parked.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">لا توجد فواتير معلقة</p>
          ) : (
            parked.map((p) => {
              const phone = p.customer.kind === 'contact' ? p.customer.phone : null;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-navy-border/30 bg-navy-950/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {p.customerLabel}
                    </p>
                    <span dir="ltr" className="shrink-0 font-mono text-sm font-bold text-amber-400">
                      {p.grandTotal}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {phone && (
                      <>
                        <span dir="ltr" className="font-mono">{phone}</span>
                        {' · '}
                      </>
                    )}
                    {formatTime(p.createdAt)} · {elapsedAr(p.createdAt)}
                    {' · '}
                    <span dir="ltr" className="font-mono">{p.itemsCount}</span> صنف
                  </p>
                  {p.lines.length > 0 && (
                    <p className="mt-1 truncate text-[11px] text-slate-400">
                      {p.lines.map((l) => `${l.name} ×${l.quantity}`).join('، ')}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onRestore(p)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-extrabold text-navy-950 hover:bg-cyan-500"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> استعادة السلة
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(p)}
                      aria-label="حذف الفاتورة المعلقة"
                      className="rounded-lg border border-navy-border/40 p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
