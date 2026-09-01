import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useCreateSaleMutation, useAccountsByContactQuery } from '../hooks/useTransactions';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { InvoiceDocument } from '@/features/invoices/InvoiceDocument';

type Contact = { id: string; name: string; role: string };
type Item = { id: string; name: string; sellingPrice: string };
type Service = { id: string; name: string };

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

export function SaleForm({ open, onClose }: Props) {
  const createMut = useCreateSaleMutation();

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
  const { data: services } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: () => api.get<Service[]>('/services'),
    enabled: open,
  });

  const [contactId, setContactId] = useState('');
  const [note, setNote] = useState('');
  const [amountPaidNow, setAmountPaidNow] = useState('');
  const [itemRows, setItemRows] = useState<Array<{ itemId: string; quantity: string }>>([]);
  const [serviceRows, setServiceRows] = useState<Array<{ serviceId: string; amount: string }>>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  const { data: accounts } = useAccountsByContactQuery(contactId);

  useEffect(() => {
    if (open) {
      setContactId('');
      setNote('');
      setAmountPaidNow('');
      setItemRows([]);
      setServiceRows([]);
      setFieldErrors({});
      setApiError(null);
    }
  }, [open]);

  // Show invoice document when a sale was just created
  if (invoiceId) {
    return <InvoiceDocument transactionId={invoiceId} onClose={() => { setInvoiceId(null); onClose(); }} />;
  }

  if (!open) return null;

  const isSubmitting = createMut.isPending;

  const customerContacts = contacts?.filter((c) => c.role === 'CUSTOMER' || c.role === 'BOTH') ?? [];
  const walkInContact = contacts?.find((c) => (c as unknown as { isWalkIn?: boolean }).isWalkIn === true) ?? null;
  const computedTotal = (() => {
    let t = 0;
    for (const r of itemRows) {
      const it = items?.find((x) => x.id === r.itemId);
      if (it && r.quantity) t += Number(it.sellingPrice) * Number(r.quantity || 0);
    }
    for (const r of serviceRows) if (r.amount) t += Number(r.amount || 0);
    return t;
  })();
  const remainingDebt = (() => {
    const paid = Number(amountPaidNow || 0);
    return (computedTotal - paid).toFixed(2);
  })();

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!contactId) errs.contactId = 'جهة الاتصال مطلوبة';
    if (itemRows.length === 0 && serviceRows.length === 0) {
      errs.items = 'يجب إضافة منتج واحد على الأقل أو خدمة واحدة';
    }
    if (amountPaidNow && amountPaidNow.trim() && !/^\d+(\.\d{1,2})?$/.test(amountPaidNow.trim())) errs.amountPaidNow = 'المبلغ المدفوع يجب أن يكون رقمًا صحيحًا';
    else if (amountPaidNow && Number(amountPaidNow) > computedTotal) errs.amountPaidNow = 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي';
    itemRows.forEach((r, i) => {
      if (!r.itemId) errs[`item_${i}_itemId`] = 'المنتج مطلوب';
      if (!r.quantity.trim()) errs[`item_${i}_quantity`] = 'الكمية مطلوبة';
      else if (!isPositiveInt(r.quantity)) errs[`item_${i}_quantity`] = 'الكمية يجب أن تكون عددًا صحيحًا موجبًا';
    });
    serviceRows.forEach((r, i) => {
      if (!r.serviceId) errs[`service_${i}_serviceId`] = 'الخدمة مطلوبة';
      if (!r.amount.trim()) errs[`service_${i}_amount`] = 'المبلغ مطلوب';
      else if (!isPositiveNumeric(r.amount)) errs[`service_${i}_amount`] = 'المبلغ يجب أن يكون رقمًا موجبًا';
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    // Resolve CUSTOMER account
    const customerAccount = accounts?.find((a) => a.role === 'CUSTOMER');
    if (!customerAccount) {
      setApiError('لا يوجد حساب عميل لجهة الاتصال المحددة');
      return;
    }

    // Build itemLines with unitPrice from items sellingPrice
    const itemLines: Array<{ itemId: string; quantity: number; unitPrice: string }> = [];
    let itemsTotal = 0;
    for (const r of itemRows) {
      const item = items?.find((it) => it.id === r.itemId);
      const unitPrice = item ? Number(item.sellingPrice).toFixed(2) : '0.00';
      const total = Number(unitPrice) * Number(r.quantity);
      itemsTotal += total;
      itemLines.push({
        itemId: r.itemId,
        quantity: Number(r.quantity),
        unitPrice,
      });
    }

    const serviceLines: Array<{ serviceId: string; amount: string }> = [];
    let servicesTotal = 0;
    for (const r of serviceRows) {
      servicesTotal += Number(r.amount);
      serviceLines.push({
        serviceId: r.serviceId,
        amount: Number(r.amount).toFixed(2),
      });
    }

    const totalAmount = (itemsTotal + servicesTotal).toFixed(2);
    // If no items/services total is 0, fallback to 0.00 but validation already ensures at least one
    const amount = Number(totalAmount) > 0 ? totalAmount : '0.00';

    try {
      const result = await createMut.mutateAsync({
        contactId,
        accountId: customerAccount.id,
        amount,
        amountPaidNow: amountPaidNow.trim() ? Number(amountPaidNow).toFixed(2) : undefined,
        note: note.trim() || undefined,
        itemLines: itemLines.length > 0 ? itemLines : undefined,
        serviceLines: serviceLines.length > 0 ? serviceLines : undefined,
      } as never) as unknown as { id: string };
      const newId = (result as { id?: string })?.id;
      if (newId) {
        setInvoiceId(newId);
      } else {
        onClose();
      }
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
        aria-label="إنشاء عملية بيع"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">عملية بيع</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="sale-contact" className="mb-1 block text-sm font-medium text-slate-300">
              جهة الاتصال <span className="text-rose-400">*</span>
            </label>
            <select
              id="sale-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors.contactId ? 'border-rose-500/50' : 'border-slate-700'}`}
            >
              <option value="">اختر جهة الاتصال</option>
              {customerContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
            {fieldErrors.contactId && <p className="mt-1 text-xs text-rose-400">{fieldErrors.contactId}</p>}
            {walkInContact && (
              <button type="button" onClick={() => setContactId(walkInContact.id)} className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20">زبون عابر</button>
            )}
          </div>

          <div>
            <label htmlFor="sale-note" className="mb-1 block text-sm font-medium text-slate-300">
              ملاحظة
            </label>
            <textarea
              id="sale-note"
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
              <h3 className="text-sm font-semibold text-slate-100">المنتجات</h3>
              <button
                type="button"
                onClick={() => setItemRows((prev) => [...prev, { itemId: '', quantity: '' }])}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                <Plus className="h-3 w-3" /> إضافة منتج
              </button>
            </div>
            {fieldErrors.items && <p className="mb-2 text-xs text-rose-400">{fieldErrors.items}</p>}
            {itemRows.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد منتجات مضافة.</p>
            ) : (
              <div className="space-y-2">
                {itemRows.map((row, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-md border border-slate-700 bg-slate-800/50 p-2">
                    <div className="flex-1">
                      <select
                        value={row.itemId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItemRows((prev) => prev.map((r, i) => (i === idx ? { ...r, itemId: v } : r)));
                        }}
                        className={`w-full rounded-md border bg-slate-800 px-2 py-1.5 text-sm text-slate-100 ${fieldErrors[`item_${idx}_itemId`] ? 'border-rose-500/50' : 'border-slate-700'}`}
                      >
                        <option value="">اختر المنتج</option>
                        {items?.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                      {fieldErrors[`item_${idx}_itemId`] && <p className="mt-1 text-xs text-rose-400">{fieldErrors[`item_${idx}_itemId`]}</p>}
                    </div>
                    <div className="w-24">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="الكمية"
                        value={row.quantity}
                        onChange={(e) => {
                          const v = e.target.value;
                          setItemRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: v } : r)));
                        }}
                        className={`w-full rounded-md border bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors[`item_${idx}_quantity`] ? 'border-rose-500/50' : 'border-slate-700'}`}
                        dir="ltr"
                      />
                      {fieldErrors[`item_${idx}_quantity`] && <p className="mt-1 text-xs text-rose-400">{fieldErrors[`item_${idx}_quantity`]}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setItemRows((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-md p-1.5 text-rose-400 hover:bg-slate-700"
                      aria-label="حذف المنتج"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">الخدمات</h3>
              <button
                type="button"
                onClick={() => setServiceRows((prev) => [...prev, { serviceId: '', amount: '' }])}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                <Plus className="h-3 w-3" /> إضافة خدمة
              </button>
            </div>
            {serviceRows.length === 0 ? (
              <p className="text-xs text-slate-500">لا توجد خدمات مضافة.</p>
            ) : (
              <div className="space-y-2">
                {serviceRows.map((row, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-md border border-slate-700 bg-slate-800/50 p-2">
                    <div className="flex-1">
                      <select
                        value={row.serviceId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setServiceRows((prev) => prev.map((r, i) => (i === idx ? { ...r, serviceId: v } : r)));
                        }}
                        className={`w-full rounded-md border bg-slate-800 px-2 py-1.5 text-sm text-slate-100 ${fieldErrors[`service_${idx}_serviceId`] ? 'border-rose-500/50' : 'border-slate-700'}`}
                      >
                        <option value="">اختر الخدمة</option>
                        {services?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      {fieldErrors[`service_${idx}_serviceId`] && <p className="mt-1 text-xs text-rose-400">{fieldErrors[`service_${idx}_serviceId`]}</p>}
                    </div>
                    <div className="w-28">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="المبلغ"
                        value={row.amount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setServiceRows((prev) => prev.map((r, i) => (i === idx ? { ...r, amount: v } : r)));
                        }}
                        className={`w-full rounded-md border bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors[`service_${idx}_amount`] ? 'border-rose-500/50' : 'border-slate-700'}`}
                        dir="ltr"
                      />
                      {fieldErrors[`service_${idx}_amount`] && <p className="mt-1 text-xs text-rose-400">{fieldErrors[`service_${idx}_amount`]}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setServiceRows((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-md p-1.5 text-rose-400 hover:bg-slate-700"
                      aria-label="حذف الخدمة"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="sale-paid" className="mb-1 block text-sm font-medium text-slate-300">المبلغ المدفوع الآن</label>
            <input id="sale-paid" type="text" inputMode="decimal" placeholder="0.00" value={amountPaidNow} onChange={(e) => setAmountPaidNow(e.target.value)} className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 ${fieldErrors.amountPaidNow ? 'border-rose-500/50' : 'border-slate-700'}`} dir="ltr" />
            {fieldErrors.amountPaidNow && <p className="mt-1 text-xs text-rose-400">{fieldErrors.amountPaidNow}</p>}
            <p className="mt-1 text-xs text-slate-500">المتبقي كدين: {remainingDebt} دج — الإجمالي: {computedTotal.toFixed(2)} دج</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700">
              إلغاء
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
              {isSubmitting ? 'جاري الحفظ...' : 'إنشاء عملية البيع'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
