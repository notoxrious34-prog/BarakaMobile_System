import { useEffect, useState, useCallback } from 'react';
import { useSettings, useUpdateSettings } from '@/features/settings/hooks/useSettings';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Skeleton } from '@/components/feedback/Skeleton';
import { ReceiptPreview } from '@/features/settings/components/ReceiptPreview';
import { BrandMark } from '@/components/layout/BrandMark';
import { useWalletsQuery } from '@/features/wallets/hooks/useWallets';
import { WalletServicesPanel } from '@/features/wallets/components/WalletServicesPanel';
import { api } from '@/lib/api';

type FormState = {
  business_name: string;
  business_phone: string;
  business_address: string;
  business_rc: string;
  business_nif: string;
  business_nis: string;
  business_art: string;
  currency_symbol: string;
  low_stock_threshold: string;
  invoice_footer_note: string;
};

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

const INPUT_CLS =
  'w-full rounded-xl border border-navy-700/80 bg-navy-950/80 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/80 transition-all';
const LABEL_CLS = 'text-sm font-semibold text-slate-300';
const CARD_CLS =
  'rounded-2xl border border-navy-800/80 bg-navy-900/60 p-6 backdrop-blur-md shadow-lg shadow-navy-950/30';

function WalletSettingsSection() {
  const { data: wallets } = useWalletsQuery(true);
  const active = (wallets ?? []).filter((w) => w.isActive);
  const [walletId, setWalletId] = useState('');
  const selected = walletId || active.find((w) => w.type === 'FLEXY')?.id || active[0]?.id || null;
  return (
    <section className={CARD_CLS} aria-label="المحافظ والخدمات الرقمية">
      <h2 className="mb-1 text-sm font-bold text-slate-100">المحافظ والخدمات الرقمية</h2>
      <p className="mb-4 text-xs text-slate-400">عمولات الشبكات، الخدمات المفعّلة، وحد تنبيه الرصيد</p>
      <div className="mb-3 max-w-xs space-y-1.5">
        <label htmlFor="settings-wallet" className={LABEL_CLS}>
          المحفظة
        </label>
        <select
          id="settings-wallet"
          value={selected ?? ''}
          onChange={(e) => setWalletId(e.target.value)}
          className="w-full rounded-xl border border-navy-700/80 bg-navy-950/80 px-3 py-2 text-sm text-slate-100"
        >
          {active.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <WalletServicesPanel walletId={selected} />
    </section>
  );
}

type BackupRecord = {
  id: string;
  createdAt: string;
  sizeBytes: number;
  sha256: string;
  appVersion: string;
  schemaLatestMigration: string | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-DZ', { hour12: false });
  } catch {
    return iso;
  }
}

function BackupRecoverySection() {
  const [items, setItems] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restorePath, setRestorePath] = useState<string>('');
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [preflightInfo, setPreflightInfo] = useState<any>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<BackupRecord[]>('/system/backup');
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // keep empty on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(id);
  }, [msg]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.post<BackupRecord>('/system/backup/now', { note: 'manual' });
      setMsg({ type: 'success', text: 'تم إنشاء النسخة الاحتياطية بنجاح' });
      await fetchList();
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message ?? 'فشل إنشاء النسخة الاحتياطية' });
    } finally {
      setCreating(false);
    }
  };

  const handlePickFile = async () => {
    // Electron dialog if available
    const w = window as unknown as { electronAPI?: { pickBackupFile: () => Promise<{ canceled: boolean; filePath: string | null }> } };
    if (w.electronAPI?.pickBackupFile) {
      try {
        const res = await w.electronAPI.pickBackupFile();
        if (!res.canceled && res.filePath) setRestorePath(res.filePath);
      } catch {}
      return;
    }
    // fallback: file input will be used
  };

  const handlePreflight = async () => {
    if (!restorePath.trim()) {
      setMsg({ type: 'error', text: 'يرجى تحديد مسار ملف النسخ الاحتياطي' });
      return;
    }
    try {
      const info = await api.post<any>('/system/backup/preflight', { path: restorePath.trim() });
      setPreflightInfo(info);
      setMsg({ type: 'success', text: 'تم التحقق من الملف — جاهز للاستعادة' });
    } catch (e: any) {
      const body = e?.body as any;
      const text = body?.message ?? e?.message ?? 'فشل التحقق من الملف';
      setMsg({ type: 'error', text: typeof text === 'string' ? text : JSON.stringify(text) });
      setPreflightInfo(null);
    }
  };

  const handleRestore = async () => {
    if (confirmText.trim() !== 'استعادة') {
      setMsg({ type: 'error', text: 'يرجى كتابة كلمة "استعادة" للتأكيد' });
      return;
    }
    if (!restorePath.trim()) return;
    setRestoring(true);
    try {
      const res = await api.post<any>('/system/backup/restore', { path: restorePath.trim() });
      setMsg({ type: 'success', text: `تمت الاستعادة بنجاح — التحقق: ${res?.integrity ?? 'ok'} — يلزم إعادة التشغيل` });
      setPreflightInfo(null);
      await fetchList();
    } catch (e: any) {
      const body = e?.body as any;
      const text = body?.message ?? e?.message ?? 'فشل الاستعادة';
      setMsg({ type: 'error', text: typeof text === 'string' ? text : JSON.stringify(text) });
    } finally {
      setRestoring(false);
    }
  };

  const handleUploadRestore = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('http://localhost:3001/api/system/backup/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data as any)?.message ?? 'فشل الرفع');
      // upload handler already did preflight; keep temp path if returned
      if ((data as any)?.path) {
        setRestorePath((data as any).path);
        setPreflightInfo(data);
        setMsg({ type: 'success', text: 'تم رفع الملف والتحقق منه' });
      } else {
        setPreflightInfo(data);
        setMsg({ type: 'success', text: 'تم التحقق من الملف' });
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message ?? 'فشل رفع الملف' });
    }
  };

  return (
    <section className={CARD_CLS} aria-label="النسخ الاحتياطي والاستعادة">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100">النسخ الاحتياطي والاستعادة</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">
            يتم حفظ النسخ تلقائياً في <code className="rounded bg-navy-950 px-1 py-0.5 text-amber-300">backups/automated</code> مع الاحتفاظ بآخر 10 نسخ. الامتداد <code className="text-amber-300">.akb</code> هو أرشيف Gzip يحتوي على قاعدة البيانات والـ manifest (الإصدار، عدد الترحيلات، التاريخ، sha256).
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-navy-700 to-navy-600 px-5 py-2.5 text-sm font-bold text-slate-100 shadow-lg shadow-navy-950/40 ring-1 ring-navy-600/60 transition hover:from-navy-600 hover:to-navy-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" aria-hidden="true" />}
          {creating ? 'جاري الإنشاء...' : 'إنشاء نسخة احتياطية يدوية'}
        </button>
      </div>

      {msg && (
        <div
          role="status"
          className={`mb-3 rounded-xl border px-3 py-2 text-xs font-bold ${msg.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300' : 'border-rose-500/30 bg-rose-950/40 text-rose-300'}`}
        >
          {msg.text}
        </div>
      )}

      <div className="mb-4 overflow-hidden rounded-xl border border-navy-700/60">
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 bg-navy-950/90 text-slate-400 backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-semibold">الملف</th>
                <th className="px-3 py-2 font-semibold">التاريخ</th>
                <th className="px-3 py-2 font-semibold">الحجم</th>
                <th className="px-3 py-2 font-semibold">الإصدار</th>
                <th className="px-3 py-2 font-semibold">sha256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    جاري التحميل...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    لا توجد نسخ احتياطية بعد
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className="hover:bg-navy-800/30">
                    <td className="px-3 py-2 font-mono text-slate-200" dir="ltr">
                      {r.id}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{formatDate(r.createdAt)}</td>
                    <td className="px-3 py-2 text-slate-300">{formatBytes(r.sizeBytes)}</td>
                    <td className="px-3 py-2 text-slate-300">{r.appVersion}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-slate-400" dir="ltr" title={r.sha256}>
                      {r.sha256.slice(0, 12)}…
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-navy-950/60 p-4">
        <h3 className="text-sm font-bold text-amber-200">الاستعادة من ملف</h3>
        <p className="mt-1 text-xs text-slate-400">اختر ملف <code className="text-amber-300">.akb</code> ثم قم بالتحقق المسبق قبل الاستعادة. الاستعادة تنشئ نسخة تراجع تلقائياً وتعيد تشغيل قاعدة البيانات.</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={restorePath}
            onChange={(e) => setRestorePath(e.target.value)}
            placeholder="مسار الملف أو اختر من الجهاز"
            className="min-w-[220px] flex-1 rounded-xl border border-navy-700/80 bg-navy-950/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500/80 focus:outline-none focus:ring-1 focus:ring-amber-500/80"
            dir="ltr"
          />
          <button type="button" onClick={handlePickFile} className="rounded-xl border border-navy-600 bg-navy-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-navy-700">
            اختيار ملف
          </button>
          <label className="cursor-pointer rounded-xl border border-navy-600 bg-navy-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-navy-700">
            رفع ملف
            <input
              type="file"
              accept=".akb"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadRestore(f);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" onClick={handlePreflight} className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-bold text-white hover:bg-slate-600">
            تحقق مسبق
          </button>
        </div>

        {preflightInfo && (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
            <div>التوافق: {preflightInfo.compatible ? 'متوافق' : 'غير متوافق'} — المرشح: {preflightInfo.candidateMigrations} ترحيل — الحالي: {preflightInfo.liveMigrations}</div>
            <div className="mt-1 font-mono text-[10px] text-emerald-300/80" dir="ltr">
              الإصدار: {preflightInfo.manifest?.appVersion} — الترحيل الأخير: {preflightInfo.manifest?.schemaLatestMigration ?? '—'}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='اكتب "استعادة" للتأكيد'
            className="w-40 rounded-xl border border-rose-500/30 bg-navy-950/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-rose-500/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleRestore}
            disabled={restoring || confirmText.trim() !== 'استعادة' || !restorePath.trim()}
            className="rounded-xl bg-gradient-to-r from-rose-700 to-rose-600 px-5 py-2 text-xs font-bold text-white shadow hover:from-rose-600 hover:to-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {restoring ? 'جاري الاستعادة...' : 'استعادة الآن'}
          </button>
          <span className="text-[11px] text-slate-500">سيُطلب إعادة تشغيل التطبيق بعد الاستعادة</span>
        </div>
      </div>
    </section>
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
          <div className="rounded-2xl border border-navy-800/80 bg-navy-900/60 p-6">
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
          <div className="rounded-2xl border border-navy-800/80 bg-navy-900/60 p-6">
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
              <p className="mt-0.5 text-xs text-slate-400">تخصيص الهوية التجارية، بيانات الفواتير، ونسب التنبيه الذكية</p>
            </div>
          </div>
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
        </header>

        {/* Two-region layout: form + live preview */}
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
          {/* Form column */}
          <div className="space-y-6">
            {/* Section 1 — بيانات المتجر والهوية */}
            <section className={CARD_CLS} aria-label="بيانات المتجر والهوية">
              <h2 className="mb-1 text-sm font-bold text-slate-100">بيانات المتجر والهوية</h2>
              <p className="mb-4 text-xs text-slate-400">تظهر هذه البيانات في ترويسة كل فاتورة وإيصال</p>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="business_name" className={LABEL_CLS}>
                    اسم المحل <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="business_name"
                    type="text"
                    required
                    value={form.business_name}
                    onChange={(e) => handleChange('business_name', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="مثال: BarakaMobile"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="business_phone" className={LABEL_CLS}>
                    رقم الهاتف
                  </label>
                  <input
                    id="business_phone"
                    type="text"
                    value={form.business_phone}
                    onChange={(e) => handleChange('business_phone', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="مثال: 0555123456"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="business_address" className={LABEL_CLS}>
                    العنوان
                  </label>
                  <textarea
                    id="business_address"
                    rows={3}
                    value={form.business_address}
                    onChange={(e) => handleChange('business_address', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="مثال: الجزائر العاصمة"
                  />
                </div>
              </div>
            </section>

            {/* Section 1B — البيانات القانونية والجبائية (للفواتير الرسمية) */}
            <section className={CARD_CLS} aria-label="البيانات القانونية والجبائية">
              <h2 className="mb-1 text-sm font-bold text-slate-100">البيانات القانونية والجبائية (للفواتير الرسمية)</h2>
              <p className="mb-4 text-xs text-slate-400">السجل التجاري، رقم التعريف الجبائي، المادة الجبائية ورقم التعريف الإحصائي (تظهر في الفاتورة الرسمية)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="business_rc" className={LABEL_CLS}>
                    رقم السجل التجاري (RC)
                  </label>
                  <input
                    id="business_rc"
                    type="text"
                    value={form.business_rc}
                    onChange={(e) => handleChange('business_rc', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="مثال: 16/00-1234567A26"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="business_nif" className={LABEL_CLS}>
                    رقم التعريف الجبائي (NIF)
                  </label>
                  <input
                    id="business_nif"
                    type="text"
                    value={form.business_nif}
                    onChange={(e) => handleChange('business_nif', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="مثال: 123456789012345"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="business_nis" className={LABEL_CLS}>
                    رقم التعريف الإحصائي (NIS)
                  </label>
                  <input
                    id="business_nis"
                    type="text"
                    value={form.business_nis}
                    onChange={(e) => handleChange('business_nis', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="مثال: 123456789012345"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="business_art" className={LABEL_CLS}>
                    رقم المادة الجبائية (Article d'imposition)
                  </label>
                  <input
                    id="business_art"
                    type="text"
                    value={form.business_art}
                    onChange={(e) => handleChange('business_art', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="مثال: 12345678"
                    dir="ltr"
                  />
                </div>
              </div>
            </section>

            {/* Section 2 — إعدادات النظام والعملة والحدود */}
            <section className={CARD_CLS} aria-label="إعدادات النظام والعملة والحدود">
              <h2 className="mb-1 text-sm font-bold text-slate-100">إعدادات النظام والعملة والحدود</h2>
              <p className="mb-4 text-xs text-slate-400">رمز العملة يظهر في كل الشاشات والتقارير</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="currency_symbol" className={LABEL_CLS}>
                    رمز العملة <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="currency_symbol"
                    type="text"
                    required
                    value={form.currency_symbol}
                    onChange={(e) => handleChange('currency_symbol', e.target.value)}
                    className={INPUT_CLS}
                    placeholder="د.ج"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="low_stock_threshold" className={LABEL_CLS}>
                    حد تنبيه المخزون المنخفض
                  </label>
                  <input
                    id="low_stock_threshold"
                    type="number"
                    min={1}
                    step={1}
                    value={form.low_stock_threshold}
                    onChange={(e) => handleChange('low_stock_threshold', e.target.value)}
                    className={INPUT_CLS}
                  />
                  <p className="text-xs text-slate-400">يؤثر على تنبيهات التقارير فقط — لا يغيّر حد الصنف الفعلي</p>
                </div>
              </div>
            </section>

            {/* Section 3 — تذييل الفواتير والملاحظات */}
            <section className={CARD_CLS} aria-label="تذييل الفواتير والملاحظات">
              <h2 className="mb-1 text-sm font-bold text-slate-100">تذييل الفواتير والملاحظات</h2>
              <p className="mb-4 text-xs text-slate-400">تظهر أسفل كل إيصال مطبوع — جرّبها فوراً في المعاينة</p>
              <div className="space-y-1.5">
                <label htmlFor="invoice_footer_note" className={LABEL_CLS}>
                  ملاحظة أسفل الفاتورة
                </label>
                <textarea
                  id="invoice_footer_note"
                  rows={3}
                  value={form.invoice_footer_note}
                  onChange={(e) => handleChange('invoice_footer_note', e.target.value)}
                  className={INPUT_CLS}
                  placeholder="مثال: شكراً لزيارتكم"
                />
              </div>
            </section>

            <WalletSettingsSection />
            <BackupRecoverySection />
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
