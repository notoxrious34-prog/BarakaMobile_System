import Decimal from 'decimal.js';
import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postSupplierSettlement } from '../api/debtApi';

function to2dp(v: string | Decimal): string {
  try { return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2); } catch { return '0.00'; }
}

type Props = {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  currentPayable: string;
  onSettled?: () => void;
};

function pctOf(debt: string, pct: number): string {
  try {
    return new Decimal(debt).times(pct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch { return '0.00'; }
}

export function SupplierDebtSettlementModal({ open, onClose, contactId, contactName, currentPayable, onSettled }: Props) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [successData, setSuccessData] = useState<{ amount: string; remaining: string } | null>(null);

  const remaining = useMemo(() => {
    try {
      const debt = new Decimal(currentPayable);
      const pay = amount.trim() === '' ? new Decimal(0) : new Decimal(amount.trim());
      return debt.minus(pay).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    } catch { return currentPayable; }
  }, [amount, currentPayable]);

  const amountValid = useMemo(() => {
    const t = amount.trim();
    if (!t) return false;
    try {
      const d = new Decimal(t);
      if (!d.isFinite() || d.lte(0) || d.decimalPlaces() > 2) return false;
      return d.lte(new Decimal(currentPayable));
    } catch { return false; }
  }, [amount, currentPayable]);

  const isNegative = useMemo(() => {
    try { return new Decimal(remaining).lt(0); } catch { return false; }
  }, [remaining]);

  const mut = useMutation({
    mutationFn: () => postSupplierSettlement(contactId, { amount: to2dp(amount.trim()), notes: notes.trim() || undefined }),
    onSuccess: (res) => {
      const paid = to2dp(amount.trim());
      const rem = (res?.account?.currentBalance ?? remaining);
      setSuccessData({ amount: paid, remaining: to2dp(rem) });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onSettled?.();
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="تسديد دين المورد">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex items-center justify-between border-b border-navy-border/30 p-4">
          <h3 className="text-sm font-bold text-slate-100">تسديد مورد — {contactName}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06]">✕</button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2">
            <p className="text-xs text-slate-400">المستحقات للمورد</p>
            <p dir="ltr" className="font-mono text-lg font-bold text-amber-400">{to2dp(currentPayable)} د.ج</p>
          </div>

          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setAmount(to2dp(currentPayable))} className="h-7 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">تسديد كامل المبلغ (100%)</button>
            <button type="button" onClick={() => setAmount(pctOf(currentPayable, 50))} className="h-7 rounded-lg border border-navy-border/40 bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-slate-300 hover:border-cyan-500/40">50%</button>
            <button type="button" onClick={() => setAmount(pctOf(currentPayable, 25))} className="h-7 rounded-lg border border-navy-border/40 bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-slate-300 hover:border-cyan-500/40">25%</button>
            <button type="button" onClick={() => setAmount('')} className="h-7 rounded-lg border border-navy-border/40 px-2 py-0.5 text-xs text-slate-500">مسح</button>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300">المبلغ المسدد</label>
            <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="مثال: 1000.00" dir="ltr" className="mt-1 w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50" />
            <p className={`mt-1 text-xs ${isNegative || (!amountValid && amount.trim() !== '') ? 'text-rose-400' : 'text-slate-500'}`}>
              المتبقي: <span dir="ltr" className="font-mono font-bold">{remaining} د.ج</span> {isNegative && '— يتجاوز الدين'}
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300">ملاحظات (اختياري)</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="رقم الوصل / اسم ممثل المورد…" className="mt-1 w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50" />
          </div>

          {mut.isError && <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{(mut.error as Error).message}</p>}

          {successData ? (
            <div id="supplier-debt-receipt" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
              <p className="text-sm font-bold text-emerald-300">وصل تسديد مورد / إخراج نقدية</p>
              <p className="mt-1 text-xs text-slate-300">{contactName}</p>
              <p dir="ltr" className="font-mono text-xs text-slate-400">المدفوع: {successData.amount} د.ج — المتبقي: {successData.remaining} د.ج</p>
              <p className="mt-1 flex justify-between text-[11px] text-slate-500">
                <span>توقيع المستلم: ـــــــــ</span>
                <span>توقيع الصندوق: ـــــــــ</span>
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => window.print()} className="flex-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300">طباعة الإيصال الحراري</button>
                <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white">إغلاق</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={!amountValid || mut.isPending} onClick={() => mut.mutate()} className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-500 disabled:opacity-40">
              {mut.isPending ? 'جاري التسديد…' : 'تأكيد التسديد'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
