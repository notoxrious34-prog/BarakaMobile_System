import { X, Download, Rocket, Loader2, ShieldCheck } from 'lucide-react';
import { useUpdaterStore } from '@/store/updater.store';
import { useDesktopVersion } from '@/components/layout/WindowControls';

/**
 * Changelog & install modal (TB-138) — luxury dark, safety shield notice,
 * state-driven actions (download → install with mandatory backup first).
 */
export function UpdateModal({ onClose }: { onClose: () => void }) {
  const status = useUpdaterStore((s) => s.status);
  const progress = useUpdaterStore((s) => s.progress);
  const version = useUpdaterStore((s) => s.version);
  const releaseNotes = useUpdaterStore((s) => s.releaseNotes);
  const error = useUpdaterStore((s) => s.error);
  const backingUp = useUpdaterStore((s) => s.backingUp);
  const check = useUpdaterStore((s) => s.check);
  const startDownload = useUpdaterStore((s) => s.startDownload);
  const install = useUpdaterStore((s) => s.install);
  const current = useDesktopVersion();

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="تحديث النظام"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-navy-border/30 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-100">
            تحديث النظام الجديد
            {version && (
              <span dir="ltr" className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-xs tabular-nums text-cyan-300">
                v{version}
              </span>
            )}
          </h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto px-5 py-4 scrollbar-premium">
          {releaseNotes ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{releaseNotes}</p>
          ) : (
            <p className="text-sm text-slate-400">
              يتوفر إصدار جديد من بركة موبايل{current ? ` (الإصدار الحالي v${current})` : ''}. يُنصح بالتحديث للحصول على أحدث الإصلاحات والميزات.
            </p>
          )}
        </div>

        <div className="flex items-start gap-2 border-t border-navy-border/20 bg-navy-950/50 px-5 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-slate-400">
            سيتم أخذ نسخة احتياطية آمنة لقاعدة البيانات تلقائياً قبل بدء التثبيت.
          </p>
        </div>

        {status === 'downloading' && (
          <div className="px-5 py-3">
            <div className="h-2 overflow-hidden rounded-full bg-navy-950">
              <div
                className="h-full rounded-full bg-gradient-to-l from-cyan-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p dir="ltr" className="mt-1 text-center font-mono text-xs tabular-nums text-slate-400">
              {progress}%
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="px-5 pb-2 text-xs font-bold text-rose-400">
            {error}
          </p>
        )}

        <div className="flex gap-2 px-5 py-4">
          {status === 'downloaded' && (
            <>
              <button
                type="button"
                disabled={backingUp}
                onClick={() => void install()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {backingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Rocket className="h-4 w-4" aria-hidden="true" />
                )}
                {backingUp ? 'جاري أخذ نسخة الأمان…' : 'تثبيت التحديث وإعادة التشغيل الآن'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-navy-border/40 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/[0.06]"
              >
                تذكيري لاحقاً
              </button>
            </>
          )}
          {(status === 'available' || status === 'error') && (
            <button
              type="button"
              onClick={() => void (status === 'available' ? startDownload() : check())}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {status === 'available' ? 'بدء تنزيل التحديث في الخلفية' : 'إعادة المحاولة'}
            </button>
          )}
          {status === 'downloading' && (
            <p className="flex-1 py-2.5 text-center text-xs text-slate-400">التنزيل جارٍ في الخلفية — يمكنك متابعة العمل…</p>
          )}
        </div>
      </div>
    </div>
  );
}
