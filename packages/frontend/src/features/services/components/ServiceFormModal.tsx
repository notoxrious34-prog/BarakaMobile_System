import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  useCreateServiceMutation,
  useUpdateServiceMutation,
  useContactsForSupplierQuery,
  type Service,
  type PricingType,
} from '../hooks/useServices';

type Props = {
  open: boolean;
  onClose: () => void;
  service?: Service | null;
};

function isPositiveNumeric(value: string): boolean {
  if (!value.trim()) return false;
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return false;
  try {
    return new Decimal(value).gt(0);
  } catch {
    return false;
  }
}

function isValidCommission(value: string): boolean {
  if (!isPositiveNumeric(value)) return false;
  try {
    const n = new Decimal(value);
    return n.gt(0) && n.lte(100);
  } catch {
    return false;
  }
}

function toDisplayFixed(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  try {
    return new Decimal(value).toFixed(2);
  } catch {
    return value;
  }
}

function toDisplayCommission(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  try {
    // backend stores 4dp like 2.5000 — show as number without trailing zeros for UX
    const s = new Decimal(value).toFixed(4).replace(/\.?0+$/, '');
    return s;
  } catch {
    return value;
  }
}

export function ServiceFormModal({ open, onClose, service }: Props) {
  const isEdit = !!service;
  const createMut = useCreateServiceMutation();
  const updateMut = useUpdateServiceMutation();
  const { data: supplierContacts, isLoading: suppliersLoading } = useContactsForSupplierQuery();

  const [name, setName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [pricingType, setPricingType] = useState<PricingType>('FIXED');
  const [fixedProfit, setFixedProfit] = useState('');
  const [commissionRate, setCommissionRate] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    supplierId?: string;
    pricingType?: string;
    fixedProfit?: string;
    commissionRate?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (service) {
        setName(service.name);
        setSupplierId(service.supplierId);
        setPricingType(service.pricingType);
        setFixedProfit(toDisplayFixed(service.fixedProfit));
        const commRaw = (service.commissionPct ?? (service as unknown as { commissionRate?: string | null }).commissionRate) as string | null | undefined;
        setCommissionRate(toDisplayCommission(commRaw ?? null));
      } else {
        setName('');
        setSupplierId('');
        setPricingType('FIXED');
        setFixedProfit('');
        setCommissionRate('');
      }
      setFieldErrors({});
      setApiError(null);
    }
  }, [open, service]);

  if (!open) return null;

  const isSubmitting = createMut.isPending || updateMut.isPending;

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!name.trim()) errs.name = 'اسم الخدمة مطلوب';
    if (!isEdit && !supplierId) errs.supplierId = 'المورد مطلوب';
    if (!pricingType) errs.pricingType = 'نوع التسعير مطلوب';
    if (pricingType === 'FIXED') {
      if (!fixedProfit.trim()) errs.fixedProfit = 'الربح الثابت مطلوب';
      else if (!isPositiveNumeric(fixedProfit)) errs.fixedProfit = 'الربح الثابت يجب أن يكون رقمًا موجبًا';
    }
    if (pricingType === 'COMMISSION') {
      if (!commissionRate.trim()) errs.commissionRate = 'نسبة العمولة مطلوبة';
      else if (!isValidCommission(commissionRate)) {
        let outOfRange = false;
        try {
          outOfRange = new Decimal(commissionRate).gt(100);
        } catch {
          outOfRange = false;
        }
        if (outOfRange) errs.commissionRate = 'نسبة العمولة يجب ألا تتجاوز 100';
        else errs.commissionRate = 'نسبة العمولة يجب أن تكون رقمًا موجبًا وألا تتجاوز 100';
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;
    try {
      if (isEdit && service) {
        const payload: Record<string, string> = {};
        payload.name = name.trim();
        // pricingType and supplierId are immutable on edit per AD-18 — do not send
        if (pricingType === 'FIXED') {
          payload.fixedProfit = fixedProfit.trim();
          // backend will null commissionPct via service logic if pricingType changes,
          // but on edit pricingType is immutable, so we only send relevant field
        } else {
          // COMMISSION
          payload.commissionPct = commissionRate.trim();
        }
        await updateMut.mutateAsync({ id: service.id, payload: payload as never });
      } else {
        const payload: Record<string, string> = {
          name: name.trim(),
          supplierId: supplierId,
          pricingType: pricingType,
        };
        if (pricingType === 'FIXED') {
          payload.fixedProfit = fixedProfit.trim();
        } else {
          payload.commissionPct = commissionRate.trim();
        }
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

  const supplierNameForEdit = service?.supplier?.name ?? supplierContacts?.find((c) => c.id === supplierId)?.name ?? supplierId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'تعديل الخدمة' : 'إضافة خدمة'}
        className="relative z-10 w-full max-w-md rounded-2xl border border-navy-800/80 bg-navy-900/60 p-6 text-slate-100 shadow-xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            {isEdit ? 'تعديل الخدمة' : 'إضافة خدمة'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-slate-400 hover:bg-navy-800/60 hover:text-slate-100"
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
            <label htmlFor="service-name" className="mb-1 block text-sm font-medium text-slate-300">
              اسم الخدمة <span className="text-rose-400">*</span>
            </label>
            <input
              id="service-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-xl border bg-navy-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 transition-all ${
                fieldErrors.name ? 'border-rose-500/50' : 'border-navy-700/80'
              }`}
              placeholder="أدخل اسم الخدمة"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-rose-400">{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="service-supplier" className="mb-1 block text-sm font-medium text-slate-300">
              المورد <span className="text-rose-400">*</span>
            </label>
            {isEdit ? (
              <div
                id="service-supplier"
                className="w-full rounded-xl border border-navy-700/80 bg-navy-950/60 px-3.5 py-2.5 text-sm text-slate-300"
              >
                {supplierNameForEdit}
              </div>
            ) : (
              <select
                id="service-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={isSubmitting || suppliersLoading}
                className={`w-full rounded-xl border bg-navy-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 transition-all ${
                  fieldErrors.supplierId ? 'border-rose-500/50' : 'border-navy-700/80'
                }`}
              >
                <option value="">اختر المورد</option>
                {supplierContacts?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {fieldErrors.supplierId && <p className="mt-1 text-xs text-rose-400">{fieldErrors.supplierId}</p>}
            {!isEdit && suppliersLoading && <p className="mt-1 text-xs text-slate-500">جاري تحميل الموردين...</p>}
          </div>

          <div>
            <label htmlFor="service-pricing" className="mb-1 block text-sm font-medium text-slate-300">
              نوع التسعير <span className="text-rose-400">*</span>
            </label>
            {isEdit ? (
              <div
                id="service-pricing"
                className="w-full rounded-xl border border-navy-700/80 bg-navy-950/60 px-3.5 py-2.5 text-sm text-slate-300"
              >
                {pricingType === 'FIXED' ? 'ربح ثابت' : 'عمولة'}
              </div>
            ) : (
              <select
                id="service-pricing"
                value={pricingType}
                onChange={(e) => {
                  const v = e.target.value as PricingType;
                  setPricingType(v);
                  setFieldErrors((prev) => ({ ...prev, fixedProfit: undefined, commissionRate: undefined }));
                }}
                disabled={isSubmitting}
                className={`w-full rounded-xl border bg-navy-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 transition-all ${
                  fieldErrors.pricingType ? 'border-rose-500/50' : 'border-navy-700/80'
                }`}
              >
                <option value="FIXED">ربح ثابت</option>
                <option value="COMMISSION">عمولة</option>
              </select>
            )}
            {fieldErrors.pricingType && <p className="mt-1 text-xs text-rose-400">{fieldErrors.pricingType}</p>}
          </div>

          {pricingType === 'FIXED' && (
            <div>
              <label htmlFor="service-fixed" className="mb-1 block text-sm font-medium text-slate-300">
                الربح الثابت <span className="text-rose-400">*</span>
              </label>
              <input
                id="service-fixed"
                type="text"
                inputMode="decimal"
                value={fixedProfit}
                onChange={(e) => setFixedProfit(e.target.value)}
                disabled={isSubmitting}
                className={`w-full rounded-xl border bg-navy-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 transition-all ${
                  fieldErrors.fixedProfit ? 'border-rose-500/50' : 'border-navy-700/80'
                }`}
                placeholder="مثال: 150.50"
                dir="ltr"
              />
              {fieldErrors.fixedProfit && <p className="mt-1 text-xs text-rose-400">{fieldErrors.fixedProfit}</p>}
            </div>
          )}

          {pricingType === 'COMMISSION' && (
            <div>
              <label htmlFor="service-commission" className="mb-1 block text-sm font-medium text-slate-300">
                نسبة العمولة <span className="text-rose-400">*</span>
              </label>
              <input
                id="service-commission"
                type="text"
                inputMode="decimal"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                disabled={isSubmitting}
                className={`w-full rounded-xl border bg-navy-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 transition-all ${
                  fieldErrors.commissionRate ? 'border-rose-500/50' : 'border-navy-700/80'
                }`}
                placeholder="مثال: 2.5"
                dir="ltr"
              />
              {fieldErrors.commissionRate && <p className="mt-1 text-xs text-rose-400">{fieldErrors.commissionRate}</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-navy-800 bg-navy-950/60 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-navy-800/60 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التغييرات' : 'إضافة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
