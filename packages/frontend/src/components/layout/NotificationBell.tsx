import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Wrench, ShieldCheck } from 'lucide-react';
import { useWatchdogSummary, useRepairAlerts, useWarrantyAlerts } from '@/features/watchdog/hooks/useWatchdog';

/**
 * TopBar notification bell (TB-127) — rose when critical, amber when
 * delayed/expiring, hidden badge when clear. Click-outside dismisses.
 */
export function NotificationBell() {
  const summaryQ = useWatchdogSummary();
  const repairsQ = useRepairAlerts('all');
  const warrantiesQ = useWarrantyAlerts('all');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const s = summaryQ.data;
  const critical = s?.criticalCount ?? 0;
  const delayed = s?.delayedCount ?? 0;
  const expiring = s?.expiringWarrantiesCount ?? 0;
  const expired = s?.expiredWarrantiesCount ?? 0;
  const total = critical + delayed + expiring + expired;

  const level: 'rose' | 'amber' | 'none' =
    critical > 0 ? 'rose' : delayed > 0 || expiring > 0 ? 'amber' : 'none';

  const badgeCls =
    level === 'rose'
      ? 'bg-rose-500 text-rose-50'
      : 'bg-amber-500 text-amber-50';
  const iconCls =
    level === 'rose' ? 'text-rose-300' : level === 'amber' ? 'text-amber-300' : 'text-slate-400';

  const topRepairs = (repairsQ.data?.items ?? [])
    .slice()
    .sort((a, b) => (a.severity === b.severity ? b.daysOverdue - a.daysOverdue : a.severity === 'CRITICAL' ? -1 : 1))
    .slice(0, 3);
  const topWarranties = (warrantiesQ.data?.items ?? []).slice(0, 2);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={total > 0 ? `التنبيهات (${total})` : 'التنبيهات — لا جديد'}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center rounded-xl p-2 text-slate-300 hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 min-h-11 min-w-11"
      >
        <Bell className={`h-5 w-5 ${iconCls}`} aria-hidden="true" />
        {level !== 'none' && (
          <span
            dir="ltr"
            className={`absolute -top-0.5 -left-0.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[11px] font-bold tabular-nums ${badgeCls}`}
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900 shadow-2xl"
          role="dialog"
          aria-label="أحدث التنبيهات"
        >
          <p className="border-b border-navy-border/30 px-4 py-2.5 text-sm font-extrabold text-slate-100">
            أحدث التنبيهات
          </p>
          <div className="max-h-80 overflow-y-auto scrollbar-premium">
            {topRepairs.length === 0 && topWarranties.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">لا توجد تنبيهات — كل شيء تحت السيطرة</p>
            )}
            {topRepairs.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 border-b border-navy-border/20 px-4 py-2.5">
                <Wrench className={`h-4 w-4 shrink-0 ${r.severity === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-slate-100">
                    <span dir="ltr" className="font-mono">{r.ticketNumber}</span> — {r.deviceName}
                  </p>
                  <p className="text-xs text-slate-400">تأخير {r.daysOverdue} يوم</p>
                </div>
              </div>
            ))}
            {topWarranties.map((w) => (
              <div key={w.id} className="flex items-center gap-2.5 border-b border-navy-border/20 px-4 py-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-slate-100">
                    <span dir="ltr" className="font-mono">{w.imei}</span> — {w.productName}
                  </p>
                  <p className="text-xs text-slate-400">{w.status === 'EXPIRED' ? 'انتهى الضمان' : `متبقٍ ${w.daysRemaining} يوم`}</p>
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/alerts"
            onClick={() => setOpen(false)}
            className="block bg-navy-950/60 px-4 py-2.5 text-center text-sm font-bold text-cyan-300 hover:text-cyan-200"
          >
            عرض جميع التنبيهات
          </Link>
        </div>
      )}
    </div>
  );
}
