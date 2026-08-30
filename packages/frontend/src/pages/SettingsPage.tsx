import { useEffect, useState } from 'react';
import { useSettings, useUpdateSettings } from '@/features/settings/hooks/useSettings';
import { ErrorState } from '@/components/feedback/ErrorState';

type FormState = {
  business_name: string;
  business_phone: string;
  business_address: string;
  currency_symbol: string;
  low_stock_threshold: string;
  invoice_footer_note: string;
};

const DEFAULT_FORM: FormState = {
  business_name: '',
  business_phone: '',
  business_address: '',
  currency_symbol: '',
  low_stock_threshold: '5',
  invoice_footer_note: '',
};

function isDirty(a: FormState, b: FormState): boolean {
  return (
    a.business_name !== b.business_name ||
    a.business_phone !== b.business_phone ||
    a.business_address !== b.business_address ||
    a.currency_symbol !== b.currency_symbol ||
    a.low_stock_threshold !== b.low_stock_threshold ||
    a.invoice_footer_note !== b.invoice_footer_note
  );
}

function SkeletonField({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" aria-hidden="true" />
      <div className="h-10 w-full animate-pulse rounded-md bg-zinc-200" aria-hidden="true" />
      <p className="sr-only">{label} جاري التحميل</p>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 animate-pulse rounded bg-zinc-200" />
        <div className="h-9 w-20 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-5 w-32 animate-pulse rounded bg-zinc-200" />
        <div className="grid gap-4">
          <SkeletonField label="اسم المحل" />
          <SkeletonField label="رقم الهاتف" />
          <SkeletonField label="العنوان" />
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-5 w-32 animate-pulse rounded bg-zinc-200" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonField label="رمز العملة" />
          <SkeletonField label="حد المخزون" />
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-5 w-32 animate-pulse rounded bg-zinc-200" />
        <SkeletonField label="ملاحظة الفاتورة" />
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { data, isLoading, isError, refetch } = useSettings();
  const updateMutation = useUpdateSettings();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saved, setSaved] = useState<FormState>(DEFAULT_FORM);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (data) {
      const next: FormState = {
        business_name: data.business_name ?? '',
        business_phone: data.business_phone ?? '',
        business_address: data.business_address ?? '',
        currency_symbol: data.currency_symbol ?? '',
        low_stock_threshold: data.low_stock_threshold ?? '5',
        invoice_footer_note: data.invoice_footer_note ?? '',
      };
      setForm(next);
      setSaved(next);
    }
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const dirty = isDirty(form, saved);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    // Validation: required fields
    if (!form.business_name.trim() || !form.currency_symbol.trim()) {
      setToast({ type: 'error', message: 'فشل حفظ الإعدادات' });
      return;
    }
    const thresholdNum = Number(form.low_stock_threshold);
    if (!Number.isInteger(thresholdNum) || thresholdNum < 1) {
      setToast({ type: 'error', message: 'فشل حفظ الإعدادات' });
      return;
    }

    const payload: Record<string, string> = {
      business_name: form.business_name,
      business_phone: form.business_phone,
      business_address: form.business_address,
      currency_symbol: form.currency_symbol,
      low_stock_threshold: String(thresholdNum),
      invoice_footer_note: form.invoice_footer_note,
    };

    try {
      await updateMutation.mutateAsync(payload);
      setSaved({ ...form, low_stock_threshold: String(thresholdNum) });
      setForm((prev) => ({ ...prev, low_stock_threshold: String(thresholdNum) }));
      setToast({ type: 'success', message: 'تم حفظ الإعدادات' });
    } catch {
      setToast({ type: 'error', message: 'فشل حفظ الإعدادات' });
    }
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900">الإعدادات</h1>
        </header>
        <ErrorState
          title="تعذر تحميل الإعدادات"
          message="حدث خطأ أثناء جلب الإعدادات. حاول مرة أخرى."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900">الإعدادات</h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || updateMutation.isPending}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </header>

      {/* Section 1 — معلومات المحل */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm" aria-label="معلومات المحل">
        <h2 className="mb-4 text-sm font-semibold text-zinc-800">معلومات المحل</h2>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <label htmlFor="business_name" className="text-sm font-medium text-zinc-700">
              اسم المحل <span className="text-red-600">*</span>
            </label>
            <input
              id="business_name"
              type="text"
              required
              value={form.business_name}
              onChange={(e) => handleChange('business_name', e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="مثال: BarakaMobile"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="business_phone" className="text-sm font-medium text-zinc-700">
              رقم الهاتف
            </label>
            <input
              id="business_phone"
              type="text"
              value={form.business_phone}
              onChange={(e) => handleChange('business_phone', e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="مثال: 0555123456"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="business_address" className="text-sm font-medium text-zinc-700">
              العنوان
            </label>
            <textarea
              id="business_address"
              rows={3}
              value={form.business_address}
              onChange={(e) => handleChange('business_address', e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="مثال: الجزائر العاصمة"
            />
          </div>
        </div>
      </section>

      {/* Section 2 — إعدادات العرض */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm" aria-label="إعدادات العرض">
        <h2 className="mb-4 text-sm font-semibold text-zinc-800">إعدادات العرض</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="currency_symbol" className="text-sm font-medium text-zinc-700">
              رمز العملة <span className="text-red-600">*</span>
            </label>
            <input
              id="currency_symbol"
              type="text"
              required
              value={form.currency_symbol}
              onChange={(e) => handleChange('currency_symbol', e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="د.ج"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="low_stock_threshold" className="text-sm font-medium text-zinc-700">
              حد تنبيه المخزون المنخفض
            </label>
            <input
              id="low_stock_threshold"
              type="number"
              min={1}
              step={1}
              value={form.low_stock_threshold}
              onChange={(e) => handleChange('low_stock_threshold', e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>
      </section>

      {/* Section 3 — إعدادات الفاتورة */}
      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm" aria-label="إعدادات الفاتورة">
        <h2 className="mb-4 text-sm font-semibold text-zinc-800">إعدادات الفاتورة</h2>
        <div className="space-y-1.5">
          <label htmlFor="invoice_footer_note" className="text-sm font-medium text-zinc-700">
            ملاحظة أسفل الفاتورة
          </label>
          <textarea
            id="invoice_footer_note"
            rows={3}
            value={form.invoice_footer_note}
            onChange={(e) => handleChange('invoice_footer_note', e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            placeholder="مثال: شكراً لزيارتكم"
          />
        </div>
      </section>
    </div>
  );
}
