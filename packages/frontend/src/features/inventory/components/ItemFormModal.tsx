import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  useCreateItemMutation,
  useUpdateItemMutation,
  type Item,
} from '../hooks/useInventory';

type Props = {
  open: boolean;
  onClose: () => void;
  item?: Item | null;
};

function isPositiveNumeric(value: string): boolean {
  if (!value.trim()) return false;
  // allow decimal with up to 2dp, positive only
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return false;
  const num = Number(value);
  return !Number.isNaN(num) && num > 0;
}

function toDisplayPrice(value: string | undefined): string {
  if (value === undefined || value === null) return '';
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toFixed(2);
}

export function ItemFormModal({ open, onClose, item }: Props) {
  const isEdit = !!item;
  const createMut = useCreateItemMutation();
  const updateMut = useUpdateItemMutation();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    costPrice?: string;
    sellingPrice?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (item) {
        setName(item.name);
        setSku(item.sku ?? '');
        setCostPrice(toDisplayPrice(item.costPrice));
        setSellingPrice(toDisplayPrice(item.sellingPrice));
      } else {
        setName('');
        setSku('');
        setCostPrice('');
        setSellingPrice('');
      }
      setFieldErrors({});
      setApiError(null);
    }
  }, [open, item]);

  if (!open) return null;

  const isSubmitting = createMut.isPending || updateMut.isPending;

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!name.trim()) errs.name = 'الاسم مطلوب';
    if (!costPrice.trim()) errs.costPrice = 'سعر التكلفة مطلوب';
    else if (!isPositiveNumeric(costPrice)) errs.costPrice = 'سعر التكلفة يجب أن يكون رقمًا موجبًا';
    if (!sellingPrice.trim()) errs.sellingPrice = 'سعر البيع مطلوب';
    else if (!isPositiveNumeric(sellingPrice)) errs.sellingPrice = 'سعر البيع يجب أن يكون رقمًا موجبًا';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;
    try {
      if (isEdit && item) {
        const payload: Record<string, string> = {};
        payload.name = name.trim();
        if (sku.trim()) payload.sku = sku.trim();
        else payload.sku = sku.trim(); // allow empty to clear? backend accepts optional
        payload.costPrice = costPrice.trim();
        payload.sellingPrice = sellingPrice.trim();
        // Remove empty sku if needed
        if (!sku.trim()) delete payload.sku;
        await updateMut.mutateAsync({ id: item.id, payload });
      } else {
        const payload: Record<string, string> = {
          name: name.trim(),
          costPrice: costPrice.trim(),
          sellingPrice: sellingPrice.trim(),
        };
        if (sku.trim()) payload.sku = sku.trim();
        await createMut.mutateAsync(payload as never);
      }
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'حدث خطأ غير متوقع';
      setApiError(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'تعديل المنتج' : 'إضافة منتج'}
        className="relative z-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            {isEdit ? 'تعديل المنتج' : 'إضافة منتج'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="item-name" className="mb-1 block text-sm font-medium text-zinc-700">
              الاسم <span className="text-red-500">*</span>
            </label>
            <input
              id="item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 ${
                fieldErrors.name ? 'border-red-500' : 'border-zinc-300'
              }`}
              placeholder="أدخل اسم المنتج"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="item-sku" className="mb-1 block text-sm font-medium text-zinc-700">
              SKU
            </label>
            <input
              id="item-sku"
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
              placeholder="رمز المنتج (اختياري)"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="item-cost" className="mb-1 block text-sm font-medium text-zinc-700">
              سعر التكلفة <span className="text-red-500">*</span>
            </label>
            <input
              id="item-cost"
              type="text"
              inputMode="decimal"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 ${
                fieldErrors.costPrice ? 'border-red-500' : 'border-zinc-300'
              }`}
              placeholder="مثال: 50.50"
              dir="ltr"
            />
            {fieldErrors.costPrice && <p className="mt-1 text-xs text-red-600">{fieldErrors.costPrice}</p>}
          </div>

          <div>
            <label htmlFor="item-selling" className="mb-1 block text-sm font-medium text-zinc-700">
              سعر البيع <span className="text-red-500">*</span>
            </label>
            <input
              id="item-selling"
              type="text"
              inputMode="decimal"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 ${
                fieldErrors.sellingPrice ? 'border-red-500' : 'border-zinc-300'
              }`}
              placeholder="مثال: 85.00"
              dir="ltr"
            />
            {fieldErrors.sellingPrice && <p className="mt-1 text-xs text-red-600">{fieldErrors.sellingPrice}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التغييرات' : 'إضافة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
