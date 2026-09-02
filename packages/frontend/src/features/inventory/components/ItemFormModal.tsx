import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  useCreateItemMutation,
  useUpdateItemMutation,
  type Item,
  type CreateItemPayload,
  type UpdateItemPayload,
} from '../hooks/useInventory';

type Props = {
  open: boolean;
  onClose: () => void;
  item?: Item | null;
};

function isPositiveNumeric(value: string): boolean {
  if (!value.trim()) return false;
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
  const [minStock, setMinStock] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    costPrice?: string;
    sellingPrice?: string;
    minStock?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (item) {
        setName(item.name);
        setSku(item.sku ?? '');
        setCostPrice(toDisplayPrice(item.costPrice));
        setSellingPrice(toDisplayPrice(item.sellingPrice));
        setMinStock(item.minStock !== undefined && item.minStock !== null ? String(item.minStock) : '');
      } else {
        setName('');
        setSku('');
        setCostPrice('');
        setSellingPrice('');
        setMinStock('');
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
    if (minStock.trim() !== '') {
      const n = Number(minStock.trim());
      if (!Number.isInteger(n) || n < 0) errs.minStock = 'الحد الأدنى يجب أن يكون عددًا صحيحًا غير سالب';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;
    try {
      if (isEdit && item) {
        const payload: UpdateItemPayload = {
          name: name.trim(),
          costPrice: costPrice.trim(),
          sellingPrice: sellingPrice.trim(),
        };
        if (sku.trim()) payload.sku = sku.trim();
        if (minStock.trim() !== '') {
          payload.minStock = Number(minStock.trim());
        }
        await updateMut.mutateAsync({ id: item.id, payload });
      } else {
        const payload: CreateItemPayload = {
          name: name.trim(),
          costPrice: costPrice.trim(),
          sellingPrice: sellingPrice.trim(),
        };
        if (sku.trim()) payload.sku = sku.trim();
        if (minStock.trim() !== '') {
          payload.minStock = Number(minStock.trim());
        }
        await createMut.mutateAsync(payload);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'تعديل المنتج' : 'إضافة منتج'}
        className="relative z-10 w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            {isEdit ? 'تعديل المنتج' : 'إضافة منتج'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="item-name" className="mb-1 block text-sm font-medium text-slate-300">
              الاسم <span className="text-rose-400">*</span>
            </label>
            <input
              id="item-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 ${
                fieldErrors.name ? 'border-rose-500/40' : 'border-slate-700'
              }`}
              placeholder="أدخل اسم المنتج"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-rose-400">{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="item-sku" className="mb-1 block text-sm font-medium text-slate-300">
              SKU
            </label>
            <input
              id="item-sku"
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
              placeholder="رمز المنتج (اختياري)"
              dir="ltr"
            />
          </div>

          <div>
            <label htmlFor="item-cost" className="mb-1 block text-sm font-medium text-slate-300">
              سعر التكلفة <span className="text-rose-400">*</span>
            </label>
            <input
              id="item-cost"
              type="text"
              inputMode="decimal"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 ${
                fieldErrors.costPrice ? 'border-rose-500/40' : 'border-slate-700'
              }`}
              placeholder="مثال: 50.50"
              dir="ltr"
            />
            {fieldErrors.costPrice && <p className="mt-1 text-xs text-rose-400">{fieldErrors.costPrice}</p>}
          </div>

          <div>
            <label htmlFor="item-selling" className="mb-1 block text-sm font-medium text-slate-300">
              سعر البيع <span className="text-rose-400">*</span>
            </label>
            <input
              id="item-selling"
              type="text"
              inputMode="decimal"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 ${
                fieldErrors.sellingPrice ? 'border-rose-500/40' : 'border-slate-700'
              }`}
              placeholder="مثال: 85.00"
              dir="ltr"
            />
            {fieldErrors.sellingPrice && <p className="mt-1 text-xs text-rose-400">{fieldErrors.sellingPrice}</p>}
          </div>

          <div>
            <label htmlFor="item-minStock" className="mb-1 block text-sm font-medium text-slate-300">
              الحد الأدنى للمخزون
            </label>
            <input
              id="item-minStock"
              type="text"
              inputMode="numeric"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 ${
                fieldErrors.minStock ? 'border-rose-500/40' : 'border-slate-700'
              }`}
              placeholder="مثال: 5 (اختياري)"
              dir="ltr"
            />
            {fieldErrors.minStock && <p className="mt-1 text-xs text-rose-400">{fieldErrors.minStock}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التغييرات' : 'إضافة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
