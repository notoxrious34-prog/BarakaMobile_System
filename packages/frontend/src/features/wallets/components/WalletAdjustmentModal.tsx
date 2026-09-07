import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { X, Scale } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAdjustBalanceMutation } from '../hooks/useWallets';

type Props = {
  open: boolean;
  walletId: string | null;
  currentBalance: string;
  onClose: () => void;
};

const CREDIT_REASONS = ['مكافأة أو بونيس من المتعامل', 'تسوية خطأ يدوي', 'أخرى'];
const DEBIT_REASONS = ['رسوم اشتراك الشريحة', 'اقتطاع ضريبة أو خدمة', 'تسوية خطأ يدوي', 'أخرى'];

function to2dp(raw: string | Decimal): string {
  try {
    const d = raw instanceof Decimal ? raw : new Decimal(raw);
    if (!d.isFinite()) return '0.00';
    return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

export function WalletAdjustmentModal({ open, walletId, currentBalance, onClose }: Props) {
  const adjustMut = useAdjustBalanceMutation();
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState(CREDIT_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const reasons = direction === 'credit' ? CREDIT_REASONS : DEBIT_REASONS;

  const preview = useMemo(() => {
    try {
      if (amount.trim() === '') return null;
      const cur = new Decimal(currentBalance);
      const mag = new Decimal(amount.trim());
      if (!mag.isFinite() || mag.lte(0)) return null;
      const delta = direction === 'credit' ? mag : mag.neg();
      const next = cur.plus(delta);
      return { current: to2dp(cur), delta: to2dp(delta), next: to2dp(next), negative: next.lt(0) };
    } catch {
      return null;
    }
  }, [amount, direction, currentBalance]);

  if (!open) return null;
  const isSubmitting = adjustMut.isPending;

  async function handleSubmit() {
    if (!walletId || !preview || preview.negative) return;
    try {
      await adjustMut.mutateAsync({
        walletId,
        amount: preview.delta,
        reason: reason === 'أخرى' ? customReason.trim() || 'أخرى' : reason,
      });
      setToast({ type: 'success', message: `تمت التسوية — الرصيد الجديد ${preview.next} د.ج` });
      setAmount('');
      setCustomReason('');
    } catch (e) {
      setToast({ type: 'error', message: e instanceof ApiError ? e.message : 'فشلت التسوية' });
    }
  }

  const inputCls =
    'w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="تسوية رصيد المحفظة"
        className="scrollbar-premium relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900 p-5 text-slate-100 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="text-base font-extrabold tracking-tight">تسوية الرصيد</h2>
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

        {toast && (
          <div
            role="status"
            className={`mb-3 rounded-xl border px-3 py-2 text-xs font-bold ${
              toast.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {toast.message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setDirection('credit'); setReason(CREDIT_REASONS[0]); }}
            aria-pressed={direction === 'credit'}
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${
              direction === 'credit'
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : 'border-navy-border/40 text-slate-400 hover:bg-white/[0.04]'
            }`}
          >
            + إضافة رصيد / مكافأة
          </button>
          <button
            type="button"
            onClick={() => { setDirection('debit'); setReason(DEBIT_REASONS[0]); }}
            aria-pressed={direction === 'debit'}
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${
              direction === 'debit'
                ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                : 'border-navy-border/40 text-slate-400 hover:bg-white/[0.04]'
            }`}
          >
            − اقتطاع / رسوم شريحة
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="adj-amount" className="mb-1 block text-xs font-bold text-slate-300">المبلغ (د.ج)</label>
            <input
              id="adj-amount"
              type="text"
              inputMode="decimal"
              dir="ltr"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="adj-reason" className="mb-1 block text-xs font-bold text-slate-300">السبب</label>
            <select
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100"
            >
              {reasons.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        {reason === 'أخرى' && (
          <input
            aria-label="سبب مخصص"
            type="text"
            placeholder="اكتب السبب…"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            className={`${inputCls} mt-2`}
          />
        )}

        {preview && (
          <div className="mt-3 rounded-2xl border border-navy-border/30 bg-navy-950/50 p-3 text-center">
            <p className="text-[11px] text-slate-400">الرصيد الحالي ← الرصيد الناتج</p>
            <p dir="ltr" className="mt-1 font-mono text-base font-bold text-slate-100">
              {preview.current} ← <span className={preview.negative ? 'text-rose-300' : 'text-emerald-300'}>{preview.next}</span>
            </p>
            {preview.negative && (
              <p role="alert" className="mt-1 text-[11px] font-bold text-rose-300">التسوية مرفوضة: لا يمكن أن يصبح الرصيد سالبًا</p>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/[0.06] disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !preview || preview.negative}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {isSubmitting ? 'جارٍ الحفظ…' : 'تأكيد التسوية'}
          </button>
        </div>
      </div>
    </div>
  );
}
