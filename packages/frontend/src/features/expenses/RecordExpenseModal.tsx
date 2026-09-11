import Decimal from 'decimal.js';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { Printer } from 'lucide-react';
import { validateCashInput } from '@/features/cash/utils/cashLabels';
import {
  fetchCashBalance,
  fetchExpenseCategories,
  postExpense,
} from '@/features/cash/api/cashApi';
import type { ExpenseItem, ExpensePaymentSource } from '@/features/cash/types';
import { ExpenseVoucher } from './ExpenseVoucher';

const SOURCES: { value: ExpensePaymentSource; label: string }[] = [
  { value: 'REGISTER_CASH', label: 'صندوق الكاشير (الدرج الحالي)' },
  { value: 'SAFE_VAULT', label: 'الخزينة الرئيسية' },
  { value: 'EXTERNAL_ACCOUNT', label: 'حساب بنكي / بطاقة' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  cashierName?: string;
};

function to2dp(v: string): string {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function RecordExpenseModal({ open, onClose, cashierName }: Props) {
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<ExpensePaymentSource>('REGISTER_CASH');
  const [recipient, setRecipient] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [description, setDescription] = useState('');
  const [printNow, setPrintNow] = useState(true);
  const [created, setCreated] = useState<ExpenseItem | null>(null);

  const categoriesQ = useQuery({ queryKey: ['cash', 'expense-categories'], queryFn: fetchExpenseCategories, enabled: open,
    // TASK-BRIEF-001: near-static reference data — 10min stale, 15min gc (category mutations invalidate on change).
    staleTime: 600000, gcTime: 900000 });
  const balanceQ = useQuery({ queryKey: ['cash', 'balance'], queryFn: fetchCashBalance, enabled: open && source === 'REGISTER_CASH' });
  const drawerBalance = balanceQ.data?.currentBalance ?? '0.00';

  const amountValidation = validateCashInput(amount);

  const exceedsDrawer = useMemo(() => {
    if (source !== 'REGISTER_CASH' || !amountValidation.isValid || !amountValidation.decimalValue) return false;
    try {
      return amountValidation.decimalValue.gt(new Decimal(drawerBalance));
    } catch {
      return false;
    }
  }, [source, amountValidation, drawerBalance]);

  const needsDescription = description.trim() === '';
  const canSubmit =
    categoryId !== '' && amountValidation.isValid && !needsDescription && !exceedsDrawer && !created;

  const mut = useMutation({
    mutationFn: () =>
      postExpense({
        categoryId,
        amount: to2dp(amountValidation.decimalValue!.toString()),
        description: description.trim(),
        paymentSource: source,
        recipientName: recipient.trim() || undefined,
        invoiceReference: invoiceRef.trim() || undefined,
      }),
    onSuccess: (res) => {
      setCreated(res);
      for (const key of [['cash', 'expenses'], ['cash', 'expense-breakdown'], ['cash', 'balance'], ['cash', 'movements']]) {
        qc.invalidateQueries({ queryKey: key });
      }
      if (printNow) window.setTimeout(() => window.print(), 350);
    },
  });

  if (!open) return null;

  const inputCls =
    'rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-rose-500/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="تسجيل مصروف جديد">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex items-center justify-between border-b border-navy-border/30 p-4">
          <h3 className="text-sm font-extrabold text-slate-100">تسجيل مصروف جديد</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06]" aria-label="إغلاق">✕</button>
        </div>
        <div className="scrollbar-premium flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <label className="text-xs font-bold text-slate-300">البند</label>
            <div className="mt-1 flex flex-wrap gap-1">
              {(categoriesQ.data ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${categoryId === c.id ? 'bg-rose-600 text-white' : 'border border-navy-border/40 text-slate-300 hover:border-rose-500/40'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300">المبلغ (د.ج)</label>
            <input type="text" inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${inputCls} mt-1 w-full font-mono text-lg font-extrabold`} />
            {!amountValidation.isValid && amount.trim() !== '' && (
              <p className="mt-1 text-xs text-rose-400">{amountValidation.error}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300">مصدر الدفع</label>
            <div className="mt-1 grid gap-1">
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSource(s.value)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold ${source === s.value ? 'border-rose-500/50 bg-rose-500/10 text-rose-200' : 'border-navy-border/40 text-slate-300 hover:border-rose-500/30'}`}
                >
                  {s.label}
                  {s.value === 'REGISTER_CASH' && (
                    <span dir="ltr" className="font-mono text-[11px] text-slate-400">المتاح: {drawerBalance}</span>
                  )}
                </button>
              ))}
            </div>
            {exceedsDrawer && (
              <p className="mt-1 text-xs font-bold text-rose-400" role="alert">المبلغ يتجاوز رصيد الدرج الحالي ({drawerBalance})</p>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs font-bold text-slate-300">المستلم / الجهة (اختياري)</label>
              <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="اسم المستلم…" className={`${inputCls} mt-1 w-full`} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-300">رقم الفاتورة الخارجية (اختياري)</label>
              <input type="text" dir="ltr" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="INV-…" className={`${inputCls} mt-1 w-full font-mono`} />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300">البيان / سبب الصرف (إلزامي)</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: فاتورة كهرباء شهر أوت…" className={`${inputCls} mt-1 w-full`} />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={printNow} onChange={(e) => setPrintNow(e.target.checked)} className="accent-rose-500" />
            طباعة سند الصرف الحراري فوراً
          </label>

          {mut.isError && (
            <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300" role="alert">
              {mut.error instanceof ApiError ? mut.error.message : 'تعذر تسجيل المصروف'}
            </p>
          )}

          {created ? (
            <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-center text-sm font-extrabold text-emerald-300">
                تم التسجيل — <bdi className="font-mono">{created.expenseNumber ?? '—'}</bdi>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => window.print()} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300">
                  <Printer className="h-4 w-4" /> طباعة السند
                </button>
                <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white">إغلاق</button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()} className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-rose-500 disabled:opacity-40">
              {mut.isPending ? 'جاري التسجيل…' : 'تأكيد تسجيل المصروف'}
            </button>
          )}
        </div>
      </div>

      {created && <ExpenseVoucher expense={created} cashierName={cashierName} />}
    </div>
  );
}
