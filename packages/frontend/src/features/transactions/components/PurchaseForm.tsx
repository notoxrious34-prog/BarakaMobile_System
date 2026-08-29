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
      setRows([{ itemId: '', quantity: '', costPrice: '' }]);
      setFieldErrors({});
      setApiError(null);
    }
  }, [open]);

  if (!open) return null;

  const isSubmitting = createMut.isPending;
  const supplierContacts = contacts?.filter((c) => c.role === 'SUPPLIER' || c.role === 'BOTH') ?? [];

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!contactId) errs.contactId = 'جهة الاتصال مطلوبة';
    if (rows.length === 0) errs.items = 'يجب إضافة منتج واحد على الأقل';
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="إنشاء عملية شراء"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">عملية شراء</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="purchase-contact" className="mb-1 block text-sm font-medium text-zinc-700">
              جهة الاتصال <span className="text-red-500">*</span>
            </label>
            <select
              id="purchase-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border px-3 py-2 text-sm ${fieldErrors.contactId ? 'border-red-500' : 'border-zinc-300'}`}
            >
              <option value="">اختر جهة الاتصال</option>
              {supplierContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
            {fieldErrors.contactId && <p className="mt-1 text-xs text-red-600">{fieldErrors.contactId}</p>}
          </div>

          <div>
            <label htmlFor="purchase-note" className="mb-1 block text-sm font-medium text-zinc-700">
              ملاحظة
            </label>
            <textarea
              id="purchase-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="ملاحظة اختيارية"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">
                المنتجات <span className="text-red-500">*</span>
              </h3>
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, { itemId: '', quantity: '', costPrice: '' }])}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium hover:bg-zinc-50"
              >
                <Plus className="h-3 w-3" /> إضافة منتج
              </button>
            </div>
            {fieldErrors.items && <p className="mb-2 text-xs text-red-600">{fieldErrors.items}</p>}
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border border-zinc-200 p-2">
                  <div className="flex-1">
                    <select
                      value={row.itemId}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, itemId: e.target.value } : r)))}
                      className={`w-full rounded-md border px-2 py-1.5 text-sm ${fieldErrors[`row_${idx}_itemId`] ? 'border-red-500' : 'border-zinc-300'}`}
                    >
                      <option value="">اختر المنتج</option>
                      {items?.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                    {fieldErrors[`row_${idx}_itemId`] && <p className="mt-1 text-xs text-red-600">{fieldErrors[`row_${idx}_itemId`]}</p>}
                  </div>
                  <div className="w-20">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="الكمية"
                      value={row.quantity}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))}
                      className={`w-full rounded-md border px-2 py-1.5 text-sm ${fieldErrors[`row_${idx}_quantity`] ? 'border-red-500' : 'border-zinc-300'}`}
                      dir="ltr"
                    />
                    {fieldErrors[`row_${idx}_quantity`] && <p className="mt-1 text-xs text-red-600">{fieldErrors[`row_${idx}_quantity`]}</p>}
                  </div>
                  <div className="w-24">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="التكلفة"
                      value={row.costPrice}
                      onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, costPrice: e.target.value } : r)))}
                      className={`w-full rounded-md border px-2 py-1.5 text-sm ${fieldErrors[`row_${idx}_costPrice`] ? 'border-red-500' : 'border-zinc-300'}`}
                      dir="ltr"
                    />
                    {fieldErrors[`row_${idx}_costPrice`] && <p className="mt-1 text-xs text-red-600">{fieldErrors[`row_${idx}_costPrice`]}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                    aria-label="حذف المنتج"
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm">
              إلغاء
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
              {isSubmitting ? 'جاري الحفظ...' : 'إنشاء عملية الشراء'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
