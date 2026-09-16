import { useState } from 'react';
import { X } from 'lucide-react';
import { useCloseShiftMutation } from '../api/shiftV3Hooks';
import { previewDiscrepancy, summarizeV3SaleError } from '@/features/pos/utils/buildV3Sale';
import type { ShiftDetails } from '@/api/v3/types';

/**
 * DIRECTIVE-021 Stage 10.2 — end-of-shift reconciliation modal.
 *
 * Cashier enters the physically counted drawer cash; the discrepancy
 * preview (decimal.js, 2dp) shows عجز/فائض live against the expected
 * total. Submitting closes via `POST /v3/shifts/:id/close` — the backend
 * posts the 50300 shortage / 40400 overage journal automatically.
 * Double-submit guarded by `isPending` + the SDK idempotency key.
 */
export function V3ShiftCloseModal({ details, onClose }: { details: ShiftDetails; onClose: () => void }) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const closeMut = useCloseShiftMutation(details.register.id);

  const preview = previewDiscrepancy(counted, details.totals.expectedCash);

  async function handleClose(): Promise<void> {
    setError(null);
    try {
      await closeMut.mutateAsync({ shiftId: details.shift.id, payload: { actualCash: counted.trim(), notes: notes.trim() || undefined } });
      onClose();
    } catch (e) {
      setError(summarizeV3SaleError(e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="إغلاق الوردية"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-navy-border/40 bg-navy-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">إغلاق الوردية {details.shift.shiftNumber}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center justify-between font-mono text-sm" dir="ltr">
          <span className="font-sans text-slate-300">المتوقع في الدرج</span>
          <span>{details.totals.expectedCash} د.ج</span>
        </div>
        <input
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          placeholder="المبلغ المعدود فعلياً"
          inputMode="decimal"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono"
          dir="ltr"
        />
        {preview.tone !== 'none' && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              preview.tone === 'match'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : preview.tone === 'surplus'
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {preview.tone === 'match' && 'مطابق تماماً — لا فرق'}
            {preview.tone === 'surplus' && (
              <span dir="ltr" className="font-mono">
                فائض: +{preview.difference} (يُقيّد في 40400)
              </span>
            )}
            {preview.tone === 'deficit' && (
              <span dir="ltr" className="font-mono">
                عجز: {preview.difference} (يُقيّد في 50300)
              </span>
            )}
          </div>
        )}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات الإغلاق (اختياري)"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          onClick={() => void handleClose()}
          disabled={closeMut.isPending || preview.tone === 'none'}
          className="rounded-xl bg-rose-600 px-5 py-2.5 font-bold text-white disabled:opacity-50"
        >
          {closeMut.isPending ? 'جارٍ الإغلاق…' : 'تأكيد الإغلاق'}
        </button>
      </div>
    </div>
  );
}
