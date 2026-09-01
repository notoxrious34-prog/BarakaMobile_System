import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useCreateOffsetMutation, useAccountsByContactQuery } from '../hooks/useTransactions';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Contact = { id: string; name: string; role: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

function isPositiveNumeric(v: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0;
}

export function OffsetForm({ open, onClose }: Props) {
  const createMut = useCreateOffsetMutation();
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<Contact[]>('/contacts'),
    enabled: open,
  });

  const [contactId, setContactId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: accounts, isLoading: accountsLoading } = useAccountsByContactQuery(contactId);

  useEffect(() => {
    if (open) {
      setContactId('');
      setAmount('');
      setNote('');
      setFieldErrors({});
      setApiError(null);
    }
  }, [open]);
  if (!open) return null;

  const isSubmitting = createMut.isPending;
  const bothContacts = contacts?.filter((c) => c.role === 'BOTH') ?? [];

  const supplierBalance = accounts?.find((a) => a.role === 'SUPPLIER')?.currentBalance ?? null;
  const customerBalance = accounts?.find((a) => a.role === 'CUSTOMER')?.currentBalance ?? null;

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!contactId) errs.contactId = 'جهة الاتصال مطلوبة';
    if (!amount.trim()) errs.amount = 'المبلغ مطلوب';
    else if (!isPositiveNumeric(amount)) errs.amount = 'المبلغ يجب أن يكون رقمًا موجبًا';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    try {
      await createMut.mutateAsync({
        contactId,
        amount: Number(amount).toFixed(2),
        note: note.trim() || undefined,
      } as never);
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
      setApiError(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="إنشاء مقاصة"
        className="relative z-10 w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">مقاصة</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="offset-contact" className="mb-1 block text-sm font-medium text-slate-300">
              جهة الاتصال <span className="text-rose-400">*</span>
            </label>
            <select
              id="offset-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 ${fieldErrors.contactId ? 'border-rose-500/50' : 'border-slate-700'}`}
            >
              <option value="">اختر جهة اتصال (مورد وعميل)</option>
              {bothContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors.contactId && <p className="mt-1 text-xs text-rose-400">{fieldErrors.contactId}</p>}
            {bothContacts.length === 0 && <p className="mt-1 text-xs text-slate-500">لا توجد جهات اتصال من نوع مورد وعميل.</p>}
          </div>

          {contactId && (
            <div className="rounded-md border border-slate-700 bg-slate-800 p-3 text-sm">
              {accountsLoading ? (
                <p className="text-slate-500">جاري تحميل الأرصدة...</p>
              ) : (
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">رصيد المورد:</span>
                    <span dir="ltr" className="font-mono font-medium text-slate-100">
                      {supplierBalance !== null ? `${Number(supplierBalance).toFixed(2)} ${currencySymbol}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">رصيد العميل:</span>
                    <span dir="ltr" className="font-mono font-medium text-slate-100">
                      {customerBalance !== null ? `${Number(customerBalance).toFixed(2)} ${currencySymbol}` : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="offset-amount" className="mb-1 block text-sm font-medium text-slate-300">
              المبلغ <span className="text-rose-400">*</span>
            </label>
            <input
              id="offset-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors.amount ? 'border-rose-500/50' : 'border-slate-700'}`}
              placeholder="مثال: 400.00"
              dir="ltr"
            />
            {fieldErrors.amount && <p className="mt-1 text-xs text-rose-400">{fieldErrors.amount}</p>}
          </div>

          <div>
            <label htmlFor="offset-note" className="mb-1 block text-sm font-medium text-slate-300">
              ملاحظة
            </label>
            <textarea
              id="offset-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              placeholder="ملاحظة اختيارية"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700">
              إلغاء
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50">
              {isSubmitting ? 'جاري الحفظ...' : 'تأكيد المقاصة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
