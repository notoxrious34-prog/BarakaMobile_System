import Decimal from 'decimal.js';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  recordCustomerPayment,
  recordSupplierPayment,
  type SettlementVoucherResult,
} from '../api/counterpartyApi';

const QUICK_AMOUNTS = ['500', '1000', '2000', '5000'];

function to2dp(v: string | Decimal): string {
  try {
    return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function todayYmd(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  currentBalance: string;
  kind: 'customer' | 'supplier';
  onSettled?: () => void;
};

/**
 * AD-77 settlement voucher (TB-144). Dual mode: customer collection
 * (emerald, cash IN) vs supplier payout (amber/rose, cash OUT). Posts to
 * the atomic /payments endpoints. Remaining preview via decimal.js only;
 * all money stays string.
 */
export function SettlementVoucherModal({ open, onClose, contactId, contactName, currentBalance, kind, onSettled }: Props) {
  const qc = useQueryClient();
  const isCustomer = kind === 'customer';
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [notes, setNotes] = useState('');
  const [successData, setSuccessData] = useState<SettlementVoucherResult | null>(null);

  const remaining = useMemo(() => {
    try {
      const bal = new Decimal(currentBalance);
      const pay = amount.trim() === '' ? new Decimal(0) : new Decimal(amount.trim());
      return bal.minus(pay).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    } catch {
      return currentBalance;
    }
  }, [amount, currentBalance]);

  const amountValid = useMemo(() => {
    const t = amount.trim();
    if (!t) return false;
    try {
      const d = new Decimal(t);
      if (!d.isFinite() || d.lte(0) || d.decimalPlaces() > 2) return false;
      return d.lte(new Decimal(currentBalance));
    } catch {
      return false;
    }
  }, [amount, currentBalance]);

  const isNegative = useMemo(() => {
    try {
      return new Decimal(remaining).lt(0);
    } catch {
      return false;
    }
  }, [remaining]);

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        amount: to2dp(amount.trim()),
        ...(date ? { paymentDate: new Date(`${date}T00:00:00`).toISOString() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      return isCustomer
        ? recordCustomerPayment(contactId, payload)
        : recordSupplierPayment(contactId, payload);
    },
    onSuccess: (res) => {
      setSuccessData(res);
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['debt-ledger'] });
      qc.invalidateQueries({ queryKey: ['supplier-ledger'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      onSettled?.();
    },
  });

  if (!open) return null;

  const theme = isCustomer
    ? {
        box: 'border-emerald-500/25 bg-emerald-500/[0.07]',
        text: 'text-emerald-400',
        successBox: 'border-emerald-500/30 bg-emerald-500/10',
        successText: 'text-emerald-300',
        button: 'bg-emerald-600 hover:bg-emerald-500',
      }
    : {
        box: 'border-amber-500/25 bg-amber-500/[0.07]',
        text: 'text-amber-400',
        successBox: 'border-amber-500/30 bg-amber-500/10',
        successText: 'text-amber-300',
        button: 'bg-amber-600 hover:bg-amber-500',
      };
  const title = isCustomer ? `سند قبض عميل — ${contactName}` : `سند صرف مورد — ${contactName}`;
  const submitLabel = isCustomer ? 'تأكيد القبض' : 'تأكيد الصرف';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex items-center justify-between border-b border-navy-border/30 p-4">
          <h3 className="text-sm font-bold text-slate-100">{title}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06]">
            ✕
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className={`rounded-xl border px-3 py-2 ${theme.box}`}>
            <p className="text-xs text-slate-400">{isCustomer ? 'الدين المستحق' : 'المستحق للمورد'}</p>
            <p dir="ltr" className={`font-mono text-lg font-bold tabular-nums ${theme.text}`}>
              {to2dp(currentBalance)} د.ج
            </p>
          </div>

          <div className="flex flex-wrap gap-1">
            {QUICK_AMOUNTS.map((q) => (
              <button key={q} type="button" onClick={() => setAmount(q)} className="h-7 rounded-lg border border-navy-border/40 bg-white/[0.03] px-2 py-0.5 font-mono text-xs tabular-nums text-slate-300 hover:border-cyan-500/40">
                {q}
              </button>
            ))}
            <button type="button" onClick={() => setAmount(to2dp(currentBalance))} className="h-7 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">
              كامل المبلغ
            </button>
            <button type="button" onClick={() => setAmount('')} className="h-7 rounded-lg border border-navy-border/40 px-2 py-0.5 text-xs text-slate-500">
              مسح
            </button>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300">المبلغ</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="مثال: 1000.00"
              dir="ltr"
              className="mt-1 w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm tabular-nums text-slate-100 outline-none focus:border-cyan-500/50"
            />
            <p className={`mt-1 text-xs ${isNegative || (!amountValid && amount.trim() !== '') ? 'text-rose-400' : 'text-slate-500'}`}>
              المتبقي:{' '}
              <span dir="ltr" className="font-mono font-bold tabular-nums">
                {remaining} د.ج
              </span>{' '}
              {isNegative && '— يتجاوز المستحق'}
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300">التاريخ (يسمح بالتواريخ السابقة)</label>
            <input
              type="date"
              value={date}
              min="2010-01-01"
              max={todayYmd()}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
              className="mt-1 w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm tabular-nums text-slate-100 outline-none focus:border-cyan-500/50"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300">ملاحظات (اختياري)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظة…"
              className="mt-1 w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            />
          </div>

          {mut.isError && (
            <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {(mut.error as Error).message}
            </p>
          )}

          {successData ? (
            <div className={`rounded-xl border p-3 text-center ${theme.successBox}`}>
              <p className={`text-sm font-bold ${theme.successText}`}>تم تسجيل السند بنجاح</p>
              <p dir="ltr" className="font-mono text-xs tabular-nums text-slate-400">
                المبلغ: {to2dp(successData.ledgerEntry.amount)} د.ج — المتبقي: {to2dp(successData.currentBalance)} د.ج
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => window.print()} className="flex-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300">
                  طباعة الإيصال الحراري
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold text-white ${theme.button}`}
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!amountValid || mut.isPending}
              onClick={() => mut.mutate()}
              className={`w-full rounded-xl px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-40 ${theme.button}`}
            >
              {mut.isPending ? 'جاري التسجيل…' : submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
