import { useState } from 'react';
import { X } from 'lucide-react';
import { useV3PeriodClosing } from '../api/accountingV3Hooks';
import { canClosePeriod } from '../utils/v3StatementChecks';
import { summarizeAccountingError } from '@/features/flexy/utils/v3FlexyPayload';

/**
 * DIRECTIVE-023 Stage 10.4 — fiscal period close confirmation modal.
 *
 * Two-step arming (confirm checkbox + button) before the irreversible
 * sweep of nominals into 30100 Retained Earnings. Reports the closing
 * journal + net income on success; CLOSED/LOCKED rejections surface as
 * Arabic errors. Double-submit guarded by `isPending`.
 */
export function V3ClosePeriodModal({ periodId, periodName, onClose }: { periodId: string; periodName: string; onClose: (closed: boolean) => void }) {
  const closing = useV3PeriodClosing();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  async function handleClose(): Promise<void> {
    setError(null);
    try {
      const result = await closing.mutateAsync(periodId);
      setReceipt(`أُغلقت الفترة ${result.periodName} — صافي ${result.netIncome} د.ج في 30100 (قيد ${result.closingJournalNumber ?? '—'})`);
    } catch (e) {
      setError(summarizeAccountingError(e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="إغلاق الفترة المالية"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-rose-500/30 bg-navy-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">إغلاق الفترة {periodName}</h2>
          <button onClick={() => onClose(false)} aria-label="إغلاق" className="rounded-lg p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-slate-300">
          سيُصفّر هذا الإجراء كل الحسابات الاسمية (4xxxx / 5xxxx) في الأرباح المحتجزة (30100) ويُقفل الفترة نهائياً ضد أي ترحيل.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={armed} onChange={(e) => setArmed(e.target.checked)} className="h-4 w-4" />
          أفهم أن الإغلاق لا يمكن التراجع عنه من الواجهة
        </label>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {receipt && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{receipt}</p>}
        <button
          onClick={() => (receipt ? onClose(true) : void handleClose())}
          disabled={closing.isPending || (!receipt && !armed)}
          className="rounded-xl bg-rose-600 px-5 py-2.5 font-bold text-white disabled:opacity-50"
        >
          {receipt ? 'إغلاق' : closing.isPending ? 'جارٍ الإغلاق…' : 'تأكيد إغلاق الفترة'}
        </button>
      </div>
    </div>
  );
}

export { canClosePeriod };
