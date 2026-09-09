import { useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { useBackupStatus } from '@/features/backup/hooks/useBackup';
import { backupHealth, backupAgo } from '@/types/backup';
import { BackupRecoveryModal } from '@/components/backup/BackupRecoveryModal';

/**
 * Bottom status bar (TB-129, AD-65/66) — fixed h-9 footer, RTL aware.
 * Health: healthy <24h (emerald+ping) · warning 24h–7d (amber) ·
 * critical >7d/FAILED (rose) · never (slate). Button opens the center.
 */
export function BottomStatusBar() {
  const statusQ = useBackupStatus();
  const [modalOpen, setModalOpen] = useState(false);

  const s = statusQ.data;
  const health = backupHealth(s);

  const dot =
    health === 'healthy' ? 'bg-emerald-500'
    : health === 'warning' ? 'bg-amber-500'
    : health === 'critical' ? 'bg-rose-500'
    : 'bg-slate-400';

  const label =
    health === 'healthy' ? `آخر نسخة احتياطية: ${backupAgo(s?.lastBackupAt ?? null)}`
    : health === 'warning' ? `النسخة متأخرة: ${backupAgo(s?.lastBackupAt ?? null)}`
    : health === 'critical' ? (s?.lastStatus === 'FAILED' ? 'فشلت آخر نسخة احتياطية' : `نسخة حرجة: ${backupAgo(s?.lastBackupAt ?? null)}`)
    : 'لا توجد نسخ احتياطية';

  return (
    <>
      <footer className="z-40 flex h-9 shrink-0 items-center justify-between gap-2 border-t border-cyan-500/10 bg-navy-900/95 px-3 text-xs" dir="rtl">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex min-w-0 items-center gap-2 text-slate-300 hover:text-slate-100"
          aria-label={`${label} — فتح النسخ الاحتياطي والاستعادة`}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {health === 'healthy' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" aria-hidden="true" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} aria-hidden="true" />
          </span>
          <span className="truncate font-bold">{statusQ.isLoading ? '…' : label}</span>
          <span className="hidden max-w-56 truncate font-mono text-[10px] text-slate-500 md:inline" dir="ltr" title={s?.destinationDir}>
            {s?.destinationDir ?? ''}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-600/90 px-2.5 py-1 font-extrabold text-navy-950 hover:bg-cyan-500"
        >
          <DatabaseBackup className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">النسخ الاحتياطي والاستعادة</span>
          <span className="sm:hidden">نسخ</span>
        </button>
      </footer>
      {modalOpen && <BackupRecoveryModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
