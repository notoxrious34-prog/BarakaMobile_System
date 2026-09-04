import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useCreatePaymentMutation, useAccountsByContactQuery } from '../hooks/useTransactions';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Contact = { id: string; name: string; role: string };

type Props = {
  open: boolean;
  onClose: () => void;
  presetContactId?: string;
  presetPaymentType?: 'PAYMENT_IN' | 'PAYMENT_OUT';
  onPaid?: () => void;
};

/** TB-074: Decimal-only amount parse — positive, finite, max 2dp. */
function parseAmountInput(v: string): Decimal | null {
  const t = v.trim();
  if (!t) return null;
  try {
    const d = new Decimal(t);
    if (!d.isFinite() || d.lessThanOrEqualTo(new Decimal(0))) return null;
    if (d.decimalPlaces() > 2) return null;
    return d;
  } catch {
    return null;
  }
}

export function PaymentForm({ open, onClose, presetContactId, presetPaymentType, onPaid }: Props) {
  const createMut = useCreatePaymentMutation();

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<Contact[]>('/contacts'),
    enabled: open,
  });

  const [paymentType, setPaymentType] = useState<'PAYMENT_IN' | 'PAYMENT_OUT'>('PAYMENT_IN');
  const [contactId, setContactId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: accounts } = useAccountsByContactQuery(contactId);

  useEffect(() => {
    if (open) {
      setPaymentType(presetPaymentType ?? 'PAYMENT_IN');
      setContactId(presetContactId ?? '');
      setAmount('');
      setNote('');
      setFieldErrors({});
      setApiError(null);
    }
  }, [open, presetPaymentType, presetContactId]);

  // Reset contact when payment type changes if current contact doesn't match new filter
  useEffect(() => {
    if (!contactId || !contacts) return;
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const allowed =
      paymentType === 'PAYMENT_IN'
        ? contact.role === 'CUSTOMER' || contact.role === 'BOTH'
        : contact.role === 'SUPPLIER' || contact.role === 'BOTH';
    if (!allowed) setContactId('');
  }, [paymentType, contacts, contactId]);

  if (!open) return null;

  const isSubmitting = createMut.isPending;

  const filteredContacts =
    contacts?.filter((c) =>
      paymentType === 'PAYMENT_IN' ? c.role === 'CUSTOMER' || c.role === 'BOTH' : c.role === 'SUPPLIER' || c.role === 'BOTH',
    ) ?? [];

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!paymentType) errs.paymentType = 'نوع الدفع مطلوب';
    if (!contactId) errs.contactId = 'جهة الاتصال مطلوبة';
    if (!amount.trim()) errs.amount = 'المبلغ مطلوب';
    else if (!parseAmountInput(amount)) errs.amount = 'المبلغ يجب أن يكون رقمًا موجبًا (رقمان عشريان كحد أقصى)';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    const role = paymentType === 'PAYMENT_IN' ? 'CUSTOMER' : 'SUPPLIER';
    const account = accounts?.find((a) => a.role === role);
    if (!account) {
      setApiError(role === 'CUSTOMER' ? 'لا يوجد حساب عميل لجهة الاتصال' : 'لا يوجد حساب مورد لجهة الاتصال');
      return;
    }

    const parsed = parseAmountInput(amount);
    if (!parsed) {
      setApiError('المبلغ غير صالح');
      return;
    }

    try {
      await createMut.mutateAsync({
        contactId,
        type: paymentType,
        amount: parsed.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
        note: note.trim() || undefined,
        accountId: account.id,
      } as never);
      onPaid?.();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      setApiError(msg);
    }
  }

  const headerTitle = paymentType === 'PAYMENT_IN' ? 'قبض مبلغ من زبون' : 'تسديد مبلغ لمورّد';
  const submitLabel = isSubmitting ? 'جاري الحفظ...' : paymentType === 'PAYMENT_IN' ? 'تأكيد قبض المبلغ' : 'تأكيد دفع المبلغ';
  const submitClass =
    paymentType === 'PAYMENT_IN'
      ? 'rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50'
      : 'rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
        className="relative z-10 w-full max-w-md rounded-xl border border-navy-border/40 bg-navy-900 p-6 text-slate-100 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">{headerTitle}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-xl p-1 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="payment-type" className="mb-1 block text-sm font-medium text-slate-300">
              نوع الدفع <span className="text-rose-400">*</span>
            </label>
            <select
              id="payment-type"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value as never)}
              disabled={isSubmitting}
              className={`w-full rounded-xl border bg-navy-950/60 px-3 py-2 text-sm text-slate-100 ${fieldErrors.paymentType ? 'border-rose-500/50' : 'border-navy-border/40'}`}
            >
              <option value="PAYMENT_IN">تحصيل</option>
              <option value="PAYMENT_OUT">دفع</option>
            </select>
            {fieldErrors.paymentType && <p className="mt-1 text-xs text-rose-400">{fieldErrors.paymentType}</p>}
          </div>

          <div>
            <label htmlFor="payment-contact" className="mb-1 block text-sm font-medium text-slate-300">
              جهة الاتصال <span className="text-rose-400">*</span>
            </label>
            <select
              id="payment-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-xl border bg-navy-950/60 px-3 py-2 text-sm text-slate-100 ${fieldErrors.contactId ? 'border-rose-500/50' : 'border-navy-border/40'}`}
            >
              <option value="">اختر جهة الاتصال</option>
              {filteredContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
            {fieldErrors.contactId && <p className="mt-1 text-xs text-rose-400">{fieldErrors.contactId}</p>}
          </div>

          <div>
            <label htmlFor="payment-amount" className="mb-1 block text-sm font-medium text-slate-300">
              المبلغ <span className="text-rose-400">*</span>
            </label>
            <input
              id="payment-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-xl border bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors.amount ? 'border-rose-500/50' : 'border-navy-border/40'}`}
              placeholder="مثال: 500.00"
              dir="ltr"
            />
            {fieldErrors.amount && <p className="mt-1 text-xs text-rose-400">{fieldErrors.amount}</p>}
          </div>

          <div>
            <label htmlFor="payment-note" className="mb-1 block text-sm font-medium text-slate-300">
              ملاحظة
            </label>
            <textarea
              id="payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              placeholder="ملاحظة اختيارية"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.06]">
              إلغاء
            </button>
            <button type="submit" disabled={isSubmitting} className={submitClass}>
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
