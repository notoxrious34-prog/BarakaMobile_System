import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useCapability } from '@/features/auth/AuthContext';
import { useUpdaterStore, isUpdaterAvailable } from '@/store/updater.store';
import { useDesktopVersion } from '@/components/layout/WindowControls';
import { UpdateModal } from '@/components/updater/UpdateModal';
import { BackupRecoveryModal } from '@/components/backup/BackupRecoveryModal';
import { CARD_CLS } from './settingsUi';

/**
 * Tab 3 - Backups and System Updates (TB-139). Verbatim migration of
 * UpdateSystemSection + BackupRecoverySection, plus a launcher card for
 * the atomic Backup and Recovery Center (TB-129 modal). No logic changes.
 */

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


function BackupCenterLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <section className={CARD_CLS} aria-label="مركز النسخ الذري والاستعادة الآمنة">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            مركز النسخ الذري والاستعادة الآمنة
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">
            النسخ الذرية الفورية، سجل النسخ، التحقق من السلامة، والجدولة التلقائية — كلها من مكان واحد.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/30 hover:from-emerald-500 hover:to-emerald-400"
        >
          فتح مركز النسخ والاستعادة
        </button>
      </div>
      {open && <BackupRecoveryModal onClose={() => setOpen(false)} />}
    </section>
  );
}

export function BackupAndUpdatesTab() {
  const canAccessBackups = useCapability('canAccessBackups');
  return (
    <div className="space-y-6">
      <UpdateSystemSection />
      {canAccessBackups ? (
        <>
          <BackupCenterLauncher />
          <BackupRecoverySection />
        </>
      ) : (
        <p className="rounded-xl border border-navy-border/30 bg-navy-900/40 px-3 py-2 text-xs text-slate-500">
          النسخ الاحتياطي والاستعادة للمدراء فقط.
        </p>
      )}
    </div>
  );
}


function UpdateSystemSection() {
  const status = useUpdaterStore((s) => s.status);
  const version = useUpdaterStore((s) => s.version);
  const error = useUpdaterStore((s) => s.error);
  const modalOpen = useUpdaterStore((s) => s.modalOpen);
  const setModalOpen = useUpdaterStore((s) => s.setModalOpen);
  const check = useUpdaterStore((s) => s.check);
  const subscribe = useUpdaterStore((s) => s.subscribe);
  const current = useDesktopVersion();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    subscribe();
  }, [subscribe]);

  if (!isUpdaterAvailable()) {
    return (
      <section className={CARD_CLS} aria-label="إصدار وتحديثات النظام">
        <h2 className="mb-1 text-sm font-bold text-slate-100">إصدار وتحديثات النظام</h2>
        <p className="text-xs text-slate-400">
          الإصدار الحالي: <span dir="ltr" className="font-mono tabular-nums">v2.8.1</span>
        </p>
        <p className="mt-2 text-xs text-slate-500">التحديث التلقائي متاح في نسخة سطح المكتب فقط.</p>
      </section>
    );
  }

  const statusLine =
    status === 'checking' ? 'جارٍ التحقق…'
    : status === 'available' || status === 'downloaded' || status === 'downloading' ? 'يوجد تحديث متوفر'
    : status === 'error' ? 'فشل الاتصال بالخادم'
    : status === 'not-available' ? 'أنت تستخدم أحدث إصدار'
    : 'لم يتم التحقق بعد';

  async function onCheck() {
    setChecking(true);
    try {
      await check();
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className={CARD_CLS} aria-label="إصدار وتحديثات النظام">
      <h2 className="mb-1 text-sm font-bold text-slate-100">إصدار وتحديثات النظام</h2>
      <p className="mb-3 text-xs text-slate-400">
        الإصدار الحالي: <span dir="ltr" className="font-mono tabular-nums">v{current ?? '2.8.1'}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onCheck()}
          disabled={checking || status === 'checking'}
          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50"
        >
          {checking || status === 'checking' ? 'جارٍ التحقق…' : 'التحقق من وجود تحديثات الآن'}
        </button>
        {(status === 'available' || status === 'downloaded' || status === 'downloading') && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            عرض التحديث {version ? <span dir="ltr" className="font-mono tabular-nums">v{version}</span> : ''}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs font-bold text-slate-300" aria-live="polite">{statusLine}</p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-bold text-rose-400">{error}</p>
      )}
      {modalOpen && <UpdateModal onClose={() => setModalOpen(false)} />}
    </section>
  );
}
