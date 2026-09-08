import { useQuery } from '@tanstack/react-query';
import { fetchAvailability } from '@/features/serials/serialsApi';

type Props = {
  itemId: string;
  itemName: string;
  excludeIds: string[];
  onBind: (serial: { id: string; imei1: string }) => void;
  onClose: () => void;
};

/** Bind one IN_STOCK IMEI to a ticket line (one unit per serial). */
export function SerialPickerModal({ itemId, itemName, excludeIds, onBind, onClose }: Props) {
  const availQ = useQuery({
    queryKey: ['serials', 'availability', itemId],
    queryFn: () => fetchAvailability([itemId]),
  });
  const serials = (availQ.data?.[itemId]?.serials ?? []).filter((s) => !excludeIds.includes(s.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4" role="dialog" aria-modal="true" aria-label="اختيار IMEI">
      <div className="w-full max-w-sm space-y-2 rounded-2xl border border-navy-border/40 bg-navy-900 p-4">
        <h3 className="text-sm font-extrabold text-slate-100">اختيار IMEI — {itemName}</h3>
        {availQ.isLoading ? (
          <p className="text-center text-xs text-slate-500">جاري التحميل…</p>
        ) : serials.length === 0 ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-300">
            لا توجد تسلسليات متاحة لهذا الصنف
          </p>
        ) : (
          <div className="scrollbar-premium max-h-64 space-y-1 overflow-y-auto">
            {serials.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onBind(s); onClose(); }}
                dir="ltr"
                className="w-full rounded-xl border border-navy-border/30 bg-white/[0.02] px-3 py-2 font-mono text-xs text-slate-200 hover:border-cyan-500/40"
              >
                {s.imei1}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={onClose} className="w-full rounded-xl border border-navy-border/40 px-3 py-2 text-xs text-slate-300">إغلاق</button>
      </div>
    </div>
  );
}
