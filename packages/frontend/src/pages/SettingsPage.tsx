import { useEffect, useState } from 'react';
import { useSettings, useUpdateSettings } from '@/features/settings/hooks/useSettings';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Skeleton } from '@/components/feedback/Skeleton';
import { ReceiptPreview } from '@/features/settings/components/ReceiptPreview';

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
    return (
      <div className="font-sans" dir="rtl">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="grid gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="font-sans" dir="rtl">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-100">الإعدادات</h1>
          </header>
          <ErrorState
            title="تعذر تحميل الإعدادات"
            message="حدث خطأ أثناء جلب الإعدادات. حاول مرة أخرى."
            onRetry={() => refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Toast */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium shadow-lg ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100">الإعدادات</h1>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || updateMutation.isPending}
            className="rounded-md bg-cyan-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </header>

        {/* Two-region layout: form + live preview */}
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
          {/* Form column */}
          <div className="space-y-6">
            {/* Section 1 — معلومات المحل */}
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-6" aria-label="معلومات المحل">
              <h2 className="mb-4 text-sm font-semibold text-slate-100">معلومات المحل</h2>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="business_name" className="text-sm font-medium text-slate-300">
                    اسم المحل <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="business_name"
                    type="text"
                    required
                    value={form.business_name}
                    onChange={(e) => handleChange('business_name', e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                    placeholder="مثال: BarakaMobile"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="business_phone" className="text-sm font-medium text-slate-300">
                    رقم الهاتف
                  </label>
                  <input
                    id="business_phone"
                    type="text"
                    value={form.business_phone}
                    onChange={(e) => handleChange('business_phone', e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                    placeholder="مثال: 0555123456"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="business_address" className="text-sm font-medium text-slate-300">
                    العنوان
                  </label>
                  <textarea
                    id="business_address"
                    rows={3}
                    value={form.business_address}
                    onChange={(e) => handleChange('business_address', e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                    placeholder="مثال: الجزائر العاصمة"
                  />
                </div>
              </div>
            </section>

            {/* Section 2 — إعدادات العرض */}
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-6" aria-label="إعدادات العرض">
              <h2 className="mb-4 text-sm font-semibold text-slate-100">إعدادات العرض</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="currency_symbol" className="text-sm font-medium text-slate-300">
                    رمز العملة <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="currency_symbol"
                    type="text"
                    required
                    value={form.currency_symbol}
                    onChange={(e) => handleChange('currency_symbol', e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                    placeholder="د.ج"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="low_stock_threshold" className="text-sm font-medium text-slate-300">
                    حد تنبيه المخزون المنخفض
                  </label>
                  <input
                    id="low_stock_threshold"
                    type="number"
                    min={1}
                    step={1}
                    value={form.low_stock_threshold}
                    onChange={(e) => handleChange('low_stock_threshold', e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                  />
                  <p className="text-xs text-slate-400">يؤثر على تنبيهات التقارير فقط — لا يغيّر حد الصنف الفعلي</p>
                </div>
              </div>
            </section>

            {/* Section 3 — إعدادات الفاتورة */}
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-6" aria-label="إعدادات الفاتورة">
              <h2 className="mb-4 text-sm font-semibold text-slate-100">إعدادات الفاتورة</h2>
              <div className="space-y-1.5">
                <label htmlFor="invoice_footer_note" className="text-sm font-medium text-slate-300">
                  ملاحظة أسفل الفاتورة
                </label>
                <textarea
                  id="invoice_footer_note"
                  rows={3}
                  value={form.invoice_footer_note}
                  onChange={(e) => handleChange('invoice_footer_note', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600"
                  placeholder="مثال: شكراً لزيارتكم"
                />
              </div>
            </section>
          </div>

          {/* Preview column — sticky on desktop, stacked on mobile */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <ReceiptPreview
              businessName={form.business_name}
              businessPhone={form.business_phone}
              businessAddress={form.business_address}
              currencySymbol={form.currency_symbol || 'د.ج'}
              footerNote={form.invoice_footer_note}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
