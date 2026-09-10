import { useEffect, useState } from 'react';
import { Store, Smartphone, ShieldCheck } from 'lucide-react';
import { useSettings, useUpdateSettings } from '@/features/settings/hooks/useSettings';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Skeleton } from '@/components/feedback/Skeleton';
import { BrandMark } from '@/components/layout/BrandMark';
import { StoreIdentityTab } from '@/components/settings/StoreIdentityTab';
import { DigitalWalletsTab } from '@/components/settings/DigitalWalletsTab';
import { BackupAndUpdatesTab } from '@/components/settings/BackupAndUpdatesTab';
import type { FormState } from '@/components/settings/settingsUi';

const DEFAULT_FORM: FormState = {
  business_name: '',
  business_phone: '',
  business_address: '',
  business_rc: '',
  business_nif: '',
  business_nis: '',
  business_art: '',
  currency_symbol: '',
  low_stock_threshold: '5',
  invoice_footer_note: '',
};

function isDirty(a: FormState, b: FormState): boolean {
  return (
    a.business_name !== b.business_name ||
    a.business_phone !== b.business_phone ||
    a.business_address !== b.business_address ||
    a.business_rc !== b.business_rc ||
    a.business_nif !== b.business_nif ||
    a.business_nis !== b.business_nis ||
    a.business_art !== b.business_art ||
    a.currency_symbol !== b.currency_symbol ||
    a.low_stock_threshold !== b.low_stock_threshold ||
    a.invoice_footer_note !== b.invoice_footer_note
  );
}

type TabId = 'identity' | 'wallets' | 'system';

const TABS: { id: TabId; label: string; Icon: typeof Store }[] = [
  { id: 'identity', label: 'بيانات المتجر والهوية', Icon: Store },
  { id: 'wallets', label: 'المحافظ والخدمات الرقمية', Icon: Smartphone },
  { id: 'system', label: 'النسخ الاحتياطي والتحديثات', Icon: ShieldCheck },
];

/**
 * Settings — standalone 3-tab container (TB-139). Rendered at /settings
 * directly inside AppShell (never under AdminLayout). Tab 1 owns the
 * identity form state; tabs 2-3 are self-contained sections.
 */
export function SettingsPage() {
  const { data, isLoading, isError, refetch } = useSettings();
  const updateMutation = useUpdateSettings();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saved, setSaved] = useState<FormState>(DEFAULT_FORM);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [tab, setTab] = useState<TabId>('identity');

  useEffect(() => {
    if (data) {
      const next: FormState = {
        business_name: data.business_name ?? '',
        business_phone: data.business_phone ?? '',
        business_address: data.business_address ?? '',
        business_rc: data.business_rc ?? '',
        business_nif: data.business_nif ?? '',
        business_nis: data.business_nis ?? '',
        business_art: data.business_art ?? '',
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
      business_rc: form.business_rc,
      business_nif: form.business_nif,
      business_nis: form.business_nis,
      business_art: form.business_art,
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
          <div className="rounded-2xl border border-navy-800/80 bg-navy-900/60 p-6">
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
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="font-sans" dir="rtl">
        <div className="mx-auto max-w-6xl space-y-6">
          <header className="flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <h1 className="text-2xl font-bold text-slate-100">إعدادات المتجر والنظام</h1>
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
            className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border px-4 py-2 text-sm font-bold shadow-2xl backdrop-blur-md ${
              toast.type === 'success'
                ? 'border-emerald-500/40 bg-navy-950/90 text-emerald-300 shadow-emerald-950/40'
                : 'border-rose-500/40 bg-navy-950/90 text-rose-300 shadow-rose-950/40'
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark className="h-11 w-11" />
            <div>
              <h1 className="text-xl font-bold text-slate-100">إعدادات المتجر والنظام</h1>
              <p className="mt-0.5 text-xs text-slate-400">تخصيص الهوية التجارية، المحافظ الرقمية، النسخ الاحتياطي، وتحديثات النظام</p>
            </div>
          </div>
          {tab === 'identity' && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
              className={`bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-950/30 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-navy-950 disabled:cursor-not-allowed disabled:opacity-50 ${
                dirty && !updateMutation.isPending ? 'ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-navy-950 animate-pulse' : ''
              }`}
            >
              {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          )}
        </header>

        {/* Tab pills */}
        <nav aria-label="أقسام الإعدادات" className="flex flex-wrap items-center gap-2">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/60 ${
                  active
                    ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-navy-950 shadow-lg shadow-cyan-950/40'
                    : 'border border-navy-700/60 bg-navy-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Tab panels */}
        {tab === 'identity' && <StoreIdentityTab form={form} onChange={handleChange} />}
        {tab === 'wallets' && <DigitalWalletsTab />}
        {tab === 'system' && <BackupAndUpdatesTab />}
      </div>
    </div>
  );
}
