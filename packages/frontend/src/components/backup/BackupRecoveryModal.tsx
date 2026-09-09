import { useEffect, useRef, useState } from 'react';
import { DatabaseBackup, Download, FolderOpen, Settings2, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import {
  useBackupStatus,
  useBackupHistory,
  useBackupSettings,
  useManualBackup,
  useRestoreBackup,
  useUploadRestore,
  useVerifyBackup,
  useDeleteBackup,
  useUpdateBackupSchedule,
  useSelectBackupFolder,
} from '@/features/backup/hooks/useBackup';
import { useAuth } from '@/features/auth/AuthContext';
import { formatBytes, type BakBackupItem, type BakVerifyResult } from '@/types/backup';
import { Skeleton } from '@/components/feedback/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';

type Tab = 'actions' | 'history' | 'schedule';

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-CA', { hour12: false });
};

const isSafety = (name: string) => name.startsWith('safety_pre_restore_');

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={`rounded-xl px-4 py-2 text-sm font-bold ${active ? 'bg-cyan-600 text-navy-950' : 'border border-navy-border/40 text-slate-300'}`}
    >
      {children}
    </button>
  );
}

/** Stage 2+3: verification summary + double-confirm destructive restore (AD-67). */
function RestoreFlow({
  sourceLabel,
  verify,
  onRestore,
  onClose,
  isAdmin,
}: {
  sourceLabel: string;
  verify: BakVerifyResult;
  onRestore: () => Promise<void>;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const m = verify.metadata;
  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-950/20 p-4" role="alert">
      <p className="text-sm font-extrabold text-amber-300">المرحلة 2 — تحقق سليم، راجع قبل الاستعادة</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
        <dt className="text-slate-400">الملف</dt>
        <dd dir="ltr" className="truncate font-mono">{sourceLabel}</dd>
        <dt className="text-slate-400">التوقيع</dt>
        <dd dir="ltr" className="font-mono">BMBAK1 ✓</dd>
        <dt className="text-slate-400">الحجم الأصلي</dt>
        <dd dir="ltr" className="font-mono tabular-nums">{formatBytes(m.dbSizeBytes)}</dd>
        <dt className="text-slate-400">الترحيل</dt>
        <dd dir="ltr" className="truncate font-mono">{m.schemaMigration ?? '—'}</dd>
        <dt className="text-slate-400">أُنشئت</dt>
        <dd dir="ltr" className="font-mono">{fmtDateTime(m.createdAt)}</dd>
        <dt className="text-slate-400">SHA-256</dt>
        <dd dir="ltr" className="break-all font-mono text-[10px] tabular-nums">{m.sha256}</dd>
        <dt className="text-slate-400">السلامة</dt>
        <dd className="font-bold text-emerald-300">integrity: ok ✓</dd>
      </dl>
      <p className="mt-3 rounded-xl border border-rose-400/40 bg-rose-950/30 p-2.5 text-xs font-bold text-rose-300">
        المرحلة 3 — تحذير: سيتم أخذ لقطة أمان تلقائية (safety_pre_restore) ثم استبدال قاعدة البيانات الحالية.
      </p>
      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-200">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 accent-cyan-500" />
        أؤكد أنني أريد استبدال البيانات الحالية بهذه النسخة
      </label>
      <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-slate-200">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-4 w-4 accent-cyan-500" />
        أفهم أن هذا الإجراء لا يمكن التراجع عنه إلا عبر لقطة الأمان
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!confirmed || !isAdmin || running}
          title={isAdmin ? 'تنفيذ الاستعادة' : 'الاستعادة للمدراء فقط'}
          onClick={() => { setRunning(true); void onRestore().finally(() => setRunning(false)); }}
          className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {running ? 'جاري الاستعادة…' : 'تأكيد الاستعادة النهائي'}
        </button>
        <button type="button" onClick={onClose} className="rounded-xl border border-navy-border/40 px-4 py-2 text-sm text-slate-300">
          إلغاء
        </button>
      </div>
    </div>
  );
}

function ActionsTab({ onMsg }: { onMsg: (m: { ok: boolean; text: string }) => void }) {
  const backupMut = useManualBackup();
  const verifyMut = useVerifyBackup();
  const uploadRestoreMut = useUploadRestore();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [verify, setVerify] = useState<BakVerifyResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function runBackup() {
    try {
      const r = await backupMut.mutateAsync();
      onMsg({ ok: true, text: `تم إنشاء ${r.filename} (${formatBytes(r.size)})` });
    } catch (e) {
      onMsg({ ok: false, text: e instanceof Error ? e.message : 'فشل إنشاء النسخة' });
    }
  }

  async function onFile(f: File) {
    setVerify(null);
    setPendingFile(f);
    setSourceLabel(f.name);
    try {
      const v = await verifyMut.mutateAsync(f);
      setVerify(v);
    } catch (e) {
      setPendingFile(null);
      onMsg({ ok: false, text: e instanceof Error ? e.message : 'ملف غير صالح' });
    }
  }

  async function restoreUploaded() {
    if (!pendingFile) return;
    try {
      const r = await uploadRestoreMut.mutateAsync(pendingFile);
      onMsg({ ok: r.integrity === 'ok', text: `تمت الاستعادة من ${pendingFile.name} — سلامة: ${r.integrity}` });
      setVerify(null);
      setPendingFile(null);
    } catch (e) {
      onMsg({ ok: false, text: e instanceof Error ? e.message : 'فشلت الاستعادة' });
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void runBackup()}
        disabled={backupMut.isPending}
        className="w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50"
      >
        {backupMut.isPending ? 'جاري إنشاء النسخة…' : 'إنشاء نسخة احتياطية فورية'}
      </button>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept=".bak"
          className="hidden"
          aria-label="رفع ملف نسخة احتياطية"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-navy-border/50 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-white/[0.04]"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          رفع ملف نسخة احتياطية (.bak)
        </button>
      </div>
      {verifyMut.isPending && <div className="space-y-2"><Skeleton className="h-16 w-full rounded-xl" /></div>}
      {verify && pendingFile && (
        <RestoreFlow
          sourceLabel={sourceLabel}
          verify={verify}
          isAdmin={isAdmin}
          onClose={() => { setVerify(null); setPendingFile(null); }}
          onRestore={restoreUploaded}
        />
      )}
    </div>
  );
}

function HistoryTab({ onMsg }: { onMsg: (m: { ok: boolean; text: string }) => void }) {
  const listQ = useBackupHistory();
  const verifyMut = useVerifyBackup();
  const deleteMut = useDeleteBackup();
  const restoreMut = useRestoreBackup();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [verify, setVerify] = useState<{ label: string; v: BakVerifyResult } | null>(null);
  const items = listQ.data ?? [];

  async function verifyStored(filename: string) {
    try {
      const v = await verifyMut.mutateAsync(filename);
      setVerify({ label: filename, v });
      onMsg({ ok: true, text: `تحقق سليم: ${filename}` });
    } catch (e) {
      onMsg({ ok: false, text: e instanceof Error ? e.message : 'فشل التحقق' });
    }
  }

  async function restoreStored(filename: string) {
    try {
      const r = await restoreMut.mutateAsync(filename);
      onMsg({ ok: r.integrity === 'ok', text: `تمت الاستعادة — سلامة: ${r.integrity}` });
      setVerify(null);
    } catch (e) {
      onMsg({ ok: false, text: e instanceof Error ? e.message : 'فشلت الاستعادة' });
    }
  }

  async function remove(filename: string) {
    try {
      await deleteMut.mutateAsync(filename);
      onMsg({ ok: true, text: `تم حذف ${filename}` });
    } catch (e) {
      onMsg({ ok: false, text: e instanceof Error ? e.message : 'فشل الحذف' });
    }
  }

  if (listQ.isLoading) return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>;
  if (items.length === 0) return <EmptyState title="لا توجد نسخ بعد" message="أنشئ أول نسخة احتياطية من تبويب الإجراءات" />;

  const badge = (name: string) =>
    isSafety(name) ? (
      <span className="shrink-0 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-300">لقطة أمان</span>
    ) : null;

  const actions = (b: (typeof items)[number]) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => void verifyStored(b.filename)}
        className="rounded-lg border border-navy-border/40 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/[0.06]">
        تحقق
      </button>
      <button type="button" onClick={() => void restoreStored(b.filename)} disabled={!isAdmin} title={isAdmin ? 'استعادة' : 'للمدراء فقط'}
        className="rounded-lg border border-navy-border/40 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/[0.06] disabled:opacity-40">
        استعادة
      </button>
      <a href={`/api/backup/download/${encodeURIComponent(b.filename)}`} download
        className="inline-flex items-center gap-1 rounded-lg border border-navy-border/40 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/[0.06]">
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        تنزيل
      </a>
      <button type="button" onClick={() => void remove(b.filename)} disabled={!isAdmin} title={isAdmin ? 'حذف' : 'للمدراء فقط'}
        className="inline-flex items-center gap-1 rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40">
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        حذف
      </button>
    </div>
  );

  const row = (b: (typeof items)[number]) => (
    <>
      <div className="flex items-center gap-2">
        <span dir="ltr" className="truncate font-mono text-xs font-bold text-slate-100">{b.filename}</span>
        {badge(b.filename)}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        <span dir="ltr" className="font-mono tabular-nums">{formatBytes(b.size)}</span> · <span dir="ltr" className="font-mono">{fmtDateTime(b.createdAt)}</span>
      </p>
      <div className="mt-2">{actions(b)}</div>
    </>
  );

  return (
    <div className="space-y-3">
      {verify && (
        <RestoreFlow
          sourceLabel={verify.label}
          verify={verify.v}
          isAdmin={isAdmin}
          onClose={() => setVerify(null)}
          onRestore={() => restoreStored(verify.label)}
        />
      )}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-navy-border/30 text-right text-xs text-slate-400">
            <th className="px-3 py-2 font-bold">اسم الملف</th>
            <th className="px-3 py-2 font-bold">التاريخ والوقت</th>
            <th className="px-3 py-2 font-bold">الحجم</th>
            <th className="px-3 py-2 font-bold">الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b) => (
            <tr key={b.filename} className="border-b border-navy-border/20 align-top text-slate-200">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="font-mono text-xs font-bold">{b.filename}</span>
                  {badge(b.filename)}
                </div>
              </td>
              <td dir="ltr" className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">{fmtDateTime(b.createdAt)}</td>
              <td dir="ltr" className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums">{formatBytes(b.size)}</td>
              <td className="px-3 py-2.5">{actions(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-2.5 md:hidden">
        {items.map((b) => (
          <div key={b.filename} className="rounded-2xl border border-navy-border/30 bg-navy-950/50 p-3.5">{row(b)}</div>
        ))}
      </div>
    </div>
  );
}

function ScheduleTab({ onMsg }: { onMsg: (m: { ok: boolean; text: string }) => void }) {
  const settingsQ = useBackupSettings();
  const updateMut = useUpdateBackupSchedule();
  const selectFolder = useSelectBackupFolder();
  const [enabled, setEnabled] = useState(true);
  const [hours, setHours] = useState('24');
  const [retention, setRetention] = useState('7');
  const [dir, setDir] = useState('');

  useEffect(() => {
    if (settingsQ.data) {
      setEnabled(settingsQ.data.autoEnabled);
      setHours(String(settingsQ.data.intervalHours));
      setRetention(String(settingsQ.data.retentionCount));
      setDir(settingsQ.data.destinationDir);
    }
  }, [settingsQ.data]);

  async function save() {
    const h = Number.parseInt(hours, 10);
    const r = Number.parseInt(retention, 10);
    if (!Number.isInteger(h) || h < 1 || h > 168 || !Number.isInteger(r) || r < 1 || r > 50) {
      onMsg({ ok: false, text: 'التكرار 1–168 ساعة، والاحتفاظ 1–50 نسخة' });
      return;
    }
    try {
      await updateMut.mutateAsync({ autoEnabled: enabled, intervalHours: h, retentionCount: r, destinationDir: dir.trim() });
      onMsg({ ok: true, text: 'تم حفظ جدول النسخ بنجاح' });
    } catch (e) {
      onMsg({ ok: false, text: e instanceof Error ? e.message : 'فشل الحفظ' });
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-cyan-500" />
        تفعيل النسخ التلقائي المجدول
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-300">تكرار النسخ (كل X ساعة)</span>
          <input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)} dir="ltr"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono tabular-nums text-slate-100 outline-none focus:border-cyan-500/50" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-300">عدد النسخ المحفوظة</span>
          <input type="number" min={1} max={50} value={retention} onChange={(e) => setRetention(e.target.value)} dir="ltr"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono tabular-nums text-slate-100 outline-none focus:border-cyan-500/50" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-300">مجلد النسخ</span>
        <div className="flex gap-2">
          <input type="text" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="افتراضي: مجلد التطبيق" dir="ltr"
            className="min-w-0 flex-1 rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500/50" />
          <button type="button"
            onClick={() => { void selectFolder().then((p) => { if (p) setDir(p); else onMsg({ ok: false, text: 'منتقي المجلدات غير متاح — أدخل المسار يدوياً' }); }); }}
            className="shrink-0 rounded-xl border border-navy-border/40 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/[0.06]">
            تغيير المجلد
          </button>
        </div>
      </label>
      <button type="button" onClick={() => void save()} disabled={updateMut.isPending}
        className="w-full rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50">
        {updateMut.isPending ? 'جاري الحفظ…' : 'حفظ الجدول'}
      </button>
    </div>
  );
}

export function BackupRecoveryModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('actions');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const statusQ = useBackupStatus();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/80 p-4" role="dialog" aria-modal="true" aria-label="النسخ الاحتياطي والاستعادة">
      <div className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900 p-5 scrollbar-premium">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-100">
            <DatabaseBackup className="h-4 w-4 text-cyan-400" aria-hidden="true" />
            النسخ الاحتياطي والاستعادة
          </h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-2" role="tablist" aria-label="أقسام النسخ">
          <TabBtn active={tab === 'actions'} onClick={() => setTab('actions')}>الإجراءات السريعة</TabBtn>
          <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>سجل النسخ الاحتياطية</TabBtn>
          {isAdmin && <TabBtn active={tab === 'schedule'} onClick={() => setTab('schedule')}>الجدولة التلقائية</TabBtn>}
        </div>

        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={`rounded-xl border p-3 text-xs font-bold ${msg.ok ? 'border-emerald-400/30 bg-emerald-950/30 text-emerald-300' : 'border-rose-400/30 bg-rose-950/30 text-rose-300'}`}>
            {msg.text}
          </p>
        )}

        {tab === 'actions' && <ActionsTab onMsg={setMsg} />}
        {tab === 'history' && <HistoryTab onMsg={setMsg} />}
        {tab === 'schedule' && (isAdmin ? <ScheduleTab onMsg={setMsg} /> : (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            إعدادات الجدولة للمدراء فقط
          </p>
        ))}

        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          <span dir="ltr" className="font-mono">{statusQ.data?.destinationDir ?? ''}</span>
        </p>
      </div>
    </div>
  );
}
