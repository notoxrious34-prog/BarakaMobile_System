import { useState } from 'react';
import Decimal from 'decimal.js';
import { Plus, X } from 'lucide-react';
import { to2dp } from '../hooks/usePosTicket';

type Props = {
  onAdd: (name: string, unitPrice2dp: string, qty: number) => void;
  onClose: () => void;
};

/**
 * TB-070 fast ad-hoc line entry (service / uncataloged item).
 * Price validated strictly in Decimal (> 0); result enters the ticket as an
 * isCustom line (stock bypass, excluded from backend itemLines at checkout).
 */
export function CustomItemModal({ onAdd, onClose }: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);

  function submit(): void {
    const label = name.trim();
    if (label.length < 2) {
      setError('الاسم مطلوب (حرفان على الأقل)');
      return;
    }
    let unit: string;
    try {
      const p = new Decimal(price.trim());
      if (p.lte(new Decimal(0))) {
        setError('السعر يجب أن يكون أكبر من صفر');
        return;
      }
      unit = to2dp(p);
    } catch {
      setError('السعر غير صالح');
      return;
    }
    const q = Number.parseInt(qty.trim(), 10);
    if (!Number.isSafeInteger(q) || q < 1) {
      setError('الكمية يجب أن تكون عدداً صحيحاً ≥ 1');
      return;
    }
    setError(null);
    onAdd(label, unit, q);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="بند مخصص"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex items-center justify-between border-b border-navy-border/30 p-3">
          <h3 className="text-sm font-bold text-slate-100">+ بند مخصص / خدمة</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-2 p-3">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              else if (e.key === 'Escape') onClose();
            }}
            placeholder="الاسم (مثال: تركيب حماية شاشة)"
            aria-label="اسم البند"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="السعر (د.ج)"
              aria-label="سعر الوحدة"
              className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-xs placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
              dir="ltr"
            />
            <input
              type="text"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="الكمية"
              aria-label="الكمية"
              className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-xs placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
              dir="ltr"
            />
          </div>
          {error && (
            <p className="text-xs font-bold text-rose-400" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            إضافة إلى السلة
          </button>
        </div>
      </div>
    </div>
  );
}
