import { Link } from 'react-router-dom';
import { Wrench, AlarmClock, ShieldCheck, ShieldX } from 'lucide-react';
import { useWatchdogSummary } from '@/features/watchdog/hooks/useWatchdog';

/**
 * Dashboard watchdog widget (TB-127) — 4 clickable SLA counters with
 * semantic accents, RTL, monotonic numerals in dir="ltr".
 */
export function WatchdogWidget() {
  const q = useWatchdogSummary();
  const s = q.data;

  const cards = [
    {
      label: 'صيانة متأخرة',
      value: s?.delayedCount ?? 0,
      to: '/alerts?tab=repairs&filter=delayed',
      icon: Wrench,
      ring: 'border-r-amber-400/60',
      chip: 'border-amber-400/20 bg-amber-950/60 text-amber-400',
    },
    {
      label: 'صيانة حرجة',
      value: s?.criticalCount ?? 0,
      to: '/alerts?tab=repairs&filter=critical',
      icon: AlarmClock,
      ring: 'border-r-rose-400/60',
      chip: 'border-rose-400/20 bg-rose-950/60 text-rose-400',
    },
    {
      label: 'ضمانات قريبة',
      value: s?.expiringWarrantiesCount ?? 0,
      to: '/alerts?tab=warranties&filter=expiring',
      icon: ShieldCheck,
      ring: 'border-r-cyan-400/60',
      chip: 'border-cyan-400/20 bg-cyan-950/60 text-cyan-400',
    },
    {
      label: 'ضمانات منتهية',
      value: s?.expiredWarrantiesCount ?? 0,
      to: '/alerts?tab=warranties&filter=expired',
      icon: ShieldX,
      ring: 'border-r-slate-400/60',
      chip: 'border-slate-400/20 bg-slate-800/60 text-slate-300',
    },
  ];

  return (
    <section aria-label="مراقبة الصيانة والضمان" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        // AD-71 calibrated (TB-134): zero = calm neutral, always legible —
        // slate card, slate-400 label, crisp slate-300 value, slate-500 icon.
        // >0 keeps full AD-63 semantic saturation.
        const muted = c.value === 0;
        return (
          <Link
            key={c.label}
            to={c.to}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-right shadow-sm transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 ${
              muted
                ? 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700/60'
                : `border-navy-border/30 bg-navy-800 border-r-2 ${c.ring} hover:border-navy-border/50`
            }`}
          >
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              muted ? 'border-slate-700/60 bg-slate-800/60 text-slate-500' : c.chip
            }`}>
              <c.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-semibold ${muted ? 'text-slate-400' : 'text-slate-200'}`}>{c.label}</span>
              <span dir="ltr" className={`block font-mono text-lg font-bold tabular-nums ${muted ? 'text-slate-300' : 'text-slate-100'}`}>
                {q.isLoading ? '…' : c.value}
              </span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
