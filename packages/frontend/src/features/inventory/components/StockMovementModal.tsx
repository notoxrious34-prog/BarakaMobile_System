import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useCreateMovementMutation, type Item } from '../hooks/useInventory';

type Props = {
  open: boolean;
  onClose: () => void;
  item: Item | null;
};

const TYPE_OPTIONS: { value: 'IN' | 'OUT' | 'ADJUSTMENT'; label: string }[] = [
  { value: 'IN', label: 'وارد' },
  { value: 'OUT', label: 'صادر' },
  { value: 'ADJUSTMENT', label: 'تسوية' },
];

export function StockMovementModal({ open, onClose, item }: Props) {
  const createMut = useCreateMovementMutation();

  const [type, setType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('IN');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ type?: string; quantity?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType('IN');
      setQuantity('');
      setNote('');
      setFieldErrors({});
      setApiError(null);
    }
  }, [open, item]);

  if (!open || !item) return null;

  const isSubmitting = createMut.isPending;

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!type) errs.type = 'النوع مطلوب';
    if (!quantity.trim()) errs.quantity = 'الكمية مطلوبة';
    else {
      const n = Number(quantity);
      if (!Number.isInteger(n) || n <= 0) errs.quantity = 'الكمية يجب أن تكون عددًا صحيحًا موجبًا';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setApiError(null);
    if (!validate()) return;
    try {
      await createMut.mutateAsync({
        itemId: item!.id,
        type,
        quantity: Number(quantity),
        note: note.trim() || undefined,
      });
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
        aria-label="حركة مخزون"
        className="relative z-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">حركة مخزون</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mb-4 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <span className="text-zinc-500">المنتج:</span> {item.name}
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="movement-type" className="mb-1 block text-sm font-medium text-zinc-700">
              النوع <span className="text-red-500">*</span>
            </label>
            <select
              id="movement-type"
              value={type}
              onChange={(e) => setType(e.target.value as never)}
              disabled={isSubmitting}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 ${
                fieldErrors.type ? 'border-red-500' : 'border-zinc-300'
              }`}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldErrors.type && <p className="mt-1 text-xs text-red-600">{fieldErrors.type}</p>}
          </div>

          <div>
            <label htmlFor="movement-qty" className="mb-1 block text-sm font-medium text-zinc-700">
              الكمية <span className="text-red-500">*</span>
            </label>
            <input
              id="movement-qty"
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 ${
                fieldErrors.quantity ? 'border-red-500' : 'border-zinc-300'
              }`}
              placeholder="مثال: 5"
              dir="ltr"
            />
            {fieldErrors.quantity && <p className="mt-1 text-xs text-red-600">{fieldErrors.quantity}</p>}
          </div>

          <div>
            <label htmlFor="movement-note" className="mb-1 block text-sm font-medium text-zinc-700">
              ملاحظة
            </label>
            <textarea
              id="movement-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
              placeholder="ملاحظة اختيارية"
            />
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
              {isSubmitting ? 'جاري الحفظ...' : 'تسجيل الحركة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
