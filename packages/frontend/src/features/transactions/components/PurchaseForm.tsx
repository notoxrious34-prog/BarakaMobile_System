import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useCreatePurchaseMutation, useAccountsByContactQuery } from '../hooks/useTransactions';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Contact = { id: string; name: string; role: string };
type Item = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

function isPositiveNumeric(v: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0;
}
function isPositiveInt(v: string): boolean {
  return /^\d+$/.test(v.trim()) && Number(v) > 0 && Number.isInteger(Number(v));
}

export function PurchaseForm({ open, onClose }: Props) {
  const createMut = useCreatePurchaseMutation();

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<Contact[]>('/contacts'),
    enabled: open,
  });
  const { data: items } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: () => api.get<Item[]>('/inventory/items'),
    enabled: open,
  });

  const [contactId, setContactId] = useState('');
  const [note, setNote] = useState('');
  const [amountPaidNow, setAmountPaidNow] = useState('');
  const [rows, setRows] = useState<Array<{ itemId: string; quantity: string; costPrice: string }>>([
    { itemId: '', quantity: '', costPrice: '' },
  ]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: accounts } = useAccountsByContactQuery(contactId);

  useEffect(() => {
    if (open) {
      setContactId('');
      setNote('');
      setAmountPaidNow('');
      setRows([{ itemId: '', quantity: '', costPrice: '' }]);
      setFieldErrors({});
      setApiError(null);
    }
  }, [open]);
  if (!open) return null;

  const isSubmitting = createMut.isPending;
  const supplierContacts = contacts?.filter((c) => c.role === 'SUPPLIER' || c.role === 'BOTH') ?? [];
  const computedTotal = rows.reduce((sum, r) => {
    const q = Number(r.quantity || 0);
    const p = Number(r.costPrice || 0);
    return sum + (q && p ? q * p : 0);
  }, 0);
  const remainingDebt = (computedTotal - Number(amountPaidNow || 0)).toFixed(2);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!contactId) errs.contactId = 'جهة الاتصال مطلوبة';
    if (rows.length === 0) errs.items = 'يجب إضافة منتج واحد على الأقل';
    if (amountPaidNow && amountPaidNow.trim() && !/^\d+(\.\d{1,2})?$/.test(amountPaidNow.trim())) errs.amountPaidNow = 'المبلغ المدفوع يجب أن يكون رقمًا صحيحًا';
    else if (amountPaidNow && Number(amountPaidNow) > computedTotal) errs.amountPaidNow = 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي';
    rows.forEach((r, i) => {
      if (!r.itemId) errs[`row_${i}_itemId`] = 'المنتج مطلوب';
      if (!r.quantity.trim()) errs[`row_${i}_quantity`] = 'الكمية مطلوبة';
      else if (!isPositiveInt(r.quantity)) errs[`row_${i}_quantity`] = 'الكمية يجب أن تكون عددًا صحيحًا موجبًا';
      if (!r.costPrice.trim()) errs[`row_${i}_costPrice`] = 'سعر التكلفة مطلوب';
      else if (!isPositiveNumeric(r.costPrice)) errs[`row_${i}_costPrice`] = 'سعر التكلفة يجب أن يكون رقمًا موجبًا';
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    const supplierAccount = accounts?.find((a) => a.role === 'SUPPLIER');
    if (!supplierAccount) {
      setApiError('لا يوجد حساب مورد لجهة الاتصال المحددة');
      return;
    }

    const itemLines = rows.map((r) => ({
      itemId: r.itemId,
      quantity: Number(r.quantity),
      unitPrice: Number(r.costPrice).toFixed(2),
    }));
    const total = rows.reduce((sum, r) => sum + Number(r.costPrice) * Number(r.quantity), 0);
    const amount = total.toFixed(2);

    try {
      await createMut.mutateAsync({
        contactId,
        accountId: supplierAccount.id,
        amount,
        amountPaidNow: amountPaidNow.trim() ? Number(amountPaidNow).toFixed(2) : undefined,
        note: note.trim() || undefined,
        itemLines,
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
        aria-label="إنشاء عملية شراء"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">عملية شراء</h2>
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
            <label htmlFor="purchase-contact" className="mb-1 block text-sm font-medium text-slate-300">
              جهة الاتصال <span className="text-rose-400">*</span>
            </label>
            <select
              id="purchase-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors.contactId ? 'border-rose-500/50' : 'border-slate-700'}`}
            >
              <option value="">اختر جهة الاتصال</option>
              {supplierContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
            {fieldErrors.contactId && <p className="mt-1 text-xs text-rose-400">{fieldErrors.contactId}</p>}
          </div>

          <div>
            <label htmlFor="purchase-note" className="mb-1 block text-sm font-medium text-slate-300">
              ملاحظة
            </label>
            <textarea
              id="purchase-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
              placeholder="ملاحظة اختيارية"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                المنتجات <span className="text-rose-400">*</span>
              </h3>
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, { itemId: '', quantity: '', costPrice: '' }])}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                <Plus className="h-3 w-3" /> إضافة منتج
              </button>
            </div>
            {fieldErrors.items && <p className="mb-2 text-xs text-rose-400">{fieldErrors.items}</p>}
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border border-slate-700 bg-slate-800/50 p-2">
                  <div className="flex-1">
                    <select
                      value={row.itemId}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, itemId: e.target.value } : r)))}
                      className={`w-full rounded-md border bg-slate-800 px-2 py-1.5 text-sm text-slate-100 ${fieldErrors[`row_${idx}_itemId`] ? 'border-rose-500/50' : 'border-slate-700'}`}
                    >
                      <option value="">اختر المنتج</option>
                      {items?.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                    {fieldErrors[`row_${idx}_itemId`] && <p className="mt-1 text-xs text-rose-400">{fieldErrors[`row_${idx}_itemId`]}</p>}
                  </div>
                  <div className="w-20">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="الكمية"
                      value={row.quantity}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))}
                      className={`w-full rounded-md border bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors[`row_${idx}_quantity`] ? 'border-rose-500/50' : 'border-slate-700'}`}
                      dir="ltr"
                    />
                    {fieldErrors[`row_${idx}_quantity`] && <p className="mt-1 text-xs text-rose-400">{fieldErrors[`row_${idx}_quantity`]}</p>}
                  </div>
                  <div className="w-24">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="التكلفة"
                      value={row.costPrice}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, costPrice: e.target.value } : r)))}
                      className={`w-full rounded-md border bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors[`row_${idx}_costPrice`] ? 'border-rose-500/50' : 'border-slate-700'}`}
                      dir="ltr"
                    />
                    {fieldErrors[`row_${idx}_costPrice`] && <p className="mt-1 text-xs text-rose-400">{fieldErrors[`row_${idx}_costPrice`]}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-md p-1.5 text-rose-400 hover:bg-slate-700"
                    aria-label="حذف المنتج"
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="purchase-paid" className="mb-1 block text-sm font-medium text-slate-300">المبلغ المدفوع الآن</label>
            <input id="purchase-paid" type="text" inputMode="decimal" placeholder="0.00" value={amountPaidNow} onChange={(e) => setAmountPaidNow(e.target.value)} className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors.amountPaidNow ? 'border-rose-500/50' : 'border-slate-700'}`} dir="ltr" />
            {fieldErrors.amountPaidNow && <p className="mt-1 text-xs text-rose-400">{fieldErrors.amountPaidNow}</p>}
            <p className="mt-1 text-xs text-slate-500">المتبقي كدين: {remainingDebt} دج — الإجمالي: {computedTotal.toFixed(2)} دج</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700">
              إلغاء
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50">
              {isSubmitting ? 'جاري الحفظ...' : 'إنشاء عملية الشراء'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
