import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { X, Zap } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useWalletsQuery, useTopupMutation } from '../hooks/useWallets';

type Contact = { id: string; name: string; role: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

const PRESETS = [
  { value: '10000', label: '10,000' },
  { value: '20000', label: '20,000' },
  { value: '50000', label: '50,000' },
  { value: '100000', label: '100,000' },
];
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

function to2dp(raw: string | Decimal): string {
  try {
    const d = raw instanceof Decimal ? raw : new Decimal(raw);
    if (!d.isFinite()) return '0.00';
    return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

export function WalletTopupModal({ open, onClose }: Props) {
  const topupMut = useTopupMutation();
  const { data: wallets, isLoading: walletsLoading } = useWalletsQuery(open);
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<Contact[]>('/contacts'),
    enabled: open,
  });

  const [walletId, setWalletId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [topupAmount, setTopupAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paidInFull, setPaidInFull] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeWallets = useMemo(() => (wallets ?? []).filter((w) => w.isActive), [wallets]);

  useEffect(() => {
    if (open) {
      const def = wallets?.find((w) => w.isActive && w.type === 'FLEXY') ?? wallets?.find((w) => w.isActive) ?? null;
      setWalletId(def?.id ?? '');
      setSupplierId(def?.defaultSupplierId ?? '');
      setTopupAmount('');
      setPaidAmount('');
      setPaidInFull(true);
      setPaymentMethod('CASH');
      setNotes('');
      setFieldErrors({});
      setApiError(null);
      setToast(null);
    }
  }, [open, wallets]);

  // Fallback auto-select: covers late query resolution after the open-reset ran.
  useEffect(() => {
    if (!open || walletId || activeWallets.length === 0) return;
    const first = activeWallets[0];
    setWalletId(first.id);
    setSupplierId((prev) => prev || first.defaultSupplierId || '');
  }, [open, walletId, activeWallets]);
  // Keep paid synced while "paid in full" is on.
  useEffect(() => {
    if (paidInFull) setPaidAmount(topupAmount);
  }, [paidInFull, topupAmount]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const isSubmitting = topupMut.isPending;
  const supplierContacts = contacts?.filter((c) => c.role === 'SUPPLIER' || c.role === 'BOTH') ?? [];
  const currentWallet = activeWallets.find((w) => w.id === walletId) ?? null;

  const preview = useMemo(() => {
    try {
      const cur = new Decimal(currentWallet?.currentBalance ?? '0');
      const top = topupAmount.trim() === '' ? new Decimal(0) : new Decimal(topupAmount.trim());
      const paid = paidAmount.trim() === '' ? new Decimal(0) : new Decimal(paidAmount.trim());
      if (!top.isFinite() || !paid.isFinite()) return null;
      return {
        newBalance: to2dp(cur.plus(top)),
        outflow: to2dp(paid),
        debt: to2dp(top.minus(paid)),
      };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWallet?.currentBalance, topupAmount, paidAmount]);

  if (!open) return null;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!walletId) errs.walletId = 'اختر المحفظة';
    if (!MONEY_RE.test(topupAmount.trim()) || new Decimal(topupAmount.trim()).lte(0)) {
      errs.topupAmount = 'مبلغ الشحن يجب أن يكون رقمًا موجبًا (مثال: 50000.00)';
    }
    if (!MONEY_RE.test(paidAmount.trim())) {
      errs.paidAmount = 'المبلغ المدفوع يجب أن يكون رقمًا (مثال: 25000.00)';
    } else if (MONEY_RE.test(topupAmount.trim())) {
      const top = new Decimal(topupAmount.trim());
      const paid = new Decimal(paidAmount.trim());
      if (paid.gt(top)) errs.paidAmount = 'المدفوع لا يمكن أن يتجاوز مبلغ الشحن';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    setApiError(null);
    if (!validate()) return;
    try {
      const res = await topupMut.mutateAsync({
        walletId,
        supplierId: supplierId || undefined,
        topupAmount: to2dp(topupAmount.trim()),
        paidAmount: to2dp(paidAmount.trim() === '' ? '0' : paidAmount.trim()),
        paymentMethod,
        notes: notes.trim() || undefined,
      });
      setToast({ type: 'success', message: `تم شحن المحفظة بنجاح — الرصيد الجديد ${res.newWalletBalance} د.ج` });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'فشل شحن المحفظة';
      setApiError(msg);
      setToast({ type: 'error', message: msg });
    }
  }

  const inputCls = (bad?: string) =>
    `w-full rounded-xl border bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${
      bad ? 'border-rose-500/50' : 'border-navy-border/40'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="شحن محفظة رقمية"
        className="scrollbar-premium relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900 p-6 text-slate-100 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Zap className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-extrabold tracking-tight">شحن محفظة رقمية</h2>
              <p className="text-[11px] text-slate-500">شراء رصيد من مورد — قيد مزدوج: خزينة + دين مورد</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200">
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
        {apiError && !toast && (
          <div role="alert" className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
            {apiError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="topup-wallet" className="mb-1 block text-xs font-bold text-slate-300">المحفظة</label>
            <select
              id="topup-wallet"
              value={walletId}
              disabled={walletsLoading}
              onChange={(e) => {
                setWalletId(e.target.value);
                const w = activeWallets.find((x) => x.id === e.target.value);
                setSupplierId(w?.defaultSupplierId ?? '');
              }}
              className={`${inputCls(fieldErrors.walletId)} disabled:opacity-50`}
            >
              {walletsLoading ? (
                <option value="">جارٍ تحميل المحافظ…</option>
              ) : activeWallets.length === 0 ? (
                <option value="">لا توجد محافظ متاحة</option>
              ) : (
                <option value="">— اختر —</option>
              )}
              {activeWallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {to2dp(w.currentBalance)} د.ج
                </option>
              ))}
            </select>
            {fieldErrors.walletId && <p className="mt-1 text-[11px] text-rose-400">{fieldErrors.walletId}</p>}
          </div>
          <div>
            <label htmlFor="topup-supplier" className="mb-1 block text-xs font-bold text-slate-300">المورد (اختياري)</label>
            <select id="topup-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputCls()}>
              <option value="">— مورد عام —</option>
              {supplierContacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="topup-amount" className="mb-1 block text-xs font-bold text-slate-300">مبلغ الشحن (د.ج)</label>
            <input
              id="topup-amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className={inputCls(fieldErrors.topupAmount)}
              dir="ltr"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setTopupAmount(p.value)}
                  className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-300 hover:bg-white/[0.06]"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {fieldErrors.topupAmount && <p className="mt-1 text-[11px] text-rose-400">{fieldErrors.topupAmount}</p>}
          </div>
          <div>
            <label htmlFor="topup-paid" className="mb-1 block text-xs font-bold text-slate-300">المبلغ المدفوع (د.ج)</label>
            <input
              id="topup-paid"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={paidAmount}
              disabled={paidInFull}
              onChange={(e) => setPaidAmount(e.target.value)}
              className={`${inputCls(fieldErrors.paidAmount)} disabled:opacity-50`}
              dir="ltr"
            />
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[11px] font-bold text-emerald-300">
              <input
                type="checkbox"
                checked={paidInFull}
                onChange={(e) => setPaidInFull(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              مدفوع بالكامل
            </label>
            {fieldErrors.paidAmount && <p className="mt-1 text-[11px] text-rose-400">{fieldErrors.paidAmount}</p>}
          </div>
          <div>
            <label htmlFor="topup-method" className="mb-1 block text-xs font-bold text-slate-300">طريقة الدفع</label>
            <select id="topup-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'BANK_TRANSFER')} className={inputCls()}>
              <option value="CASH">نقدًا (الخزينة)</option>
              <option value="BANK_TRANSFER">تحويل بنكي</option>
            </select>
          </div>
          <div>
            <label htmlFor="topup-notes" className="mb-1 block text-xs font-bold text-slate-300">ملاحظات / مرجع</label>
            <input id="topup-notes" type="text" placeholder="اختياري" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls()} />
          </div>
        </div>

        {preview && (
          <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl border border-navy-border/30 bg-navy-950/50 p-3 sm:grid-cols-3">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2.5">
              <p className="text-[11px] text-slate-400">الرصيد الجديد للمحفظة</p>
              <p dir="ltr" className="mt-0.5 text-left font-mono text-base font-bold text-cyan-300">{preview.newBalance} د.ج</p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5">
              <p className="text-[11px] text-slate-400">المدفوع من الخزينة</p>
              <p dir="ltr" className="mt-0.5 text-left font-mono text-base font-bold text-rose-300">{preview.outflow} د.ج</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
              <p className="text-[11px] text-slate-400">دين جديد للمورد</p>
              <p dir="ltr" className="mt-0.5 text-left font-mono text-base font-bold text-amber-300">{preview.debt} د.ج</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/[0.06] disabled:opacity-50">
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-amber-400 disabled:opacity-50"
          >
            <Zap className="h-4 w-4" aria-hidden="true" />
            {isSubmitting ? 'جارٍ الشحن…' : 'تأكيد شحن المحفظة'}
          </button>
        </div>
      </div>
    </div>
  );
}
