import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { TrendDay } from '@/features/reports/hooks/useSalesTrend';
import { formatGroupedMoney } from '@/features/reports/hooks/useSalesTrend';

const W = 500;
const H = 160;
const PAD_X = 8;
const PAD_TOP = 12;
const LABEL_H = 28;
const PLOT_H = H - PAD_TOP - LABEL_H; // 120
const BASE_Y = PAD_TOP + PLOT_H; // 132

type Pt = { x: number; y: number };

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Catmull-Rom → cubic bezier smoothing through all points. */
function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = r2(p1.x + (p2.x - p0.x) / 6);
    const c1y = r2(p1.y + (p2.y - p0.y) / 6);
    const c2x = r2(p2.x - (p3.x - p1.x) / 6);
    const c2y = r2(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function SalesTrendWidget({
  days,
  total,
  trendPct,
  isUp,
}: {
  /** 7 buckets oldest-first; null while loading (skeleton). */
  days: TrendDay[] | null;
  /** Current 7-day total, Decimal 2dp string. */
  total: string;
  /** Signed 1dp percent string, or null when there is no baseline. */
  trendPct: string | null;
  /** false only for a negative trend (rose pill). */
  isUp: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Display-space magnitudes only (pixel scaling — never monetary math).
  const vals = useMemo(() => {
    if (!days) return [];
    return days.map((d) => {
      const n = Number(d.total);
      return Number.isFinite(n) && n > 0 ? n : 0;
    });
  }, [days]);
  const max = useMemo(() => vals.reduce((a, b) => Math.max(a, b), 0), [vals]);

  if (!days) {
    return (
      <section
        aria-label="اتجاه المبيعات"
        className="rounded-2xl border border-navy-border/40 bg-navy-800/40 animate-pulse p-6"
      >
        <div className="h-5 w-44 rounded-lg bg-navy-800" />
        <div className="mt-3 h-8 w-40 rounded-lg bg-navy-800" />
        <div className="mt-4 h-40 w-full rounded-xl bg-navy-800" />
      </section>
    );
  }

  const pts: Pt[] = vals.map((v, i) => ({
    x: r2(PAD_X + (i * (W - PAD_X * 2)) / 6),
    y: max === 0 ? BASE_Y : r2(PAD_TOP + PLOT_H * (1 - v / max)),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${BASE_Y} L ${pts[0].x} ${BASE_Y} Z`;
  const isZero = max === 0;

  const pill = isUp
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
    : 'border-rose-500/20 bg-rose-500/10 text-rose-400';

  return (
    <section
      aria-label="اتجاه المبيعات - آخر 7 أيام"
      className="rounded-2xl border border-navy-border bg-navy-900/60 backdrop-blur-md p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-cyan-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-100">اتجاه المبيعات - آخر 7 أيام</h2>
        </div>
        <div className="flex items-center gap-3">
          <span dir="ltr" className="font-mono text-2xl font-bold text-white">
            {formatGroupedMoney(total)}{' '}
            <span className="font-sans text-sm font-medium text-slate-400">د.ج</span>
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${pill}`}
          >
            {isUp ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {trendPct === null ? (
              'جديد'
            ) : (
              <span dir="ltr">
                {isUp ? '+' : ''}
                {trendPct}%
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="relative mt-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-40 w-full overflow-visible"
          role="img"
          aria-label="منحنى مبيعات آخر 7 أيام"
        >
          <defs>
            <linearGradient id="salesTrendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={r2(PAD_TOP + PLOT_H * f)}
              y2={r2(PAD_TOP + PLOT_H * f)}
              stroke="rgba(30, 58, 95, 0.35)"
              strokeDasharray="4 4"
            />
          ))}

          {!isZero && <path d={area} fill="url(#salesTrendGradient)" />}
          <path d={line} fill="none" stroke="#22D3EE" strokeWidth="2.5" strokeLinecap="round" />

          {pts.map((p, i) => (
            <g key={days[i].key}>
              {hovered === i && (
                <circle cx={p.x} cy={p.y} r="8" fill="none" stroke="#22D3EE" strokeOpacity="0.4" />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={hovered === i ? 5.5 : 3.5}
                fill="#080D1A"
                stroke="#22D3EE"
                strokeWidth="2"
                style={{ transition: 'r 150ms ease' }}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r="14"
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${days[i].weekday} ${days[i].fullDate}: ${formatGroupedMoney(days[i].total)} د.ج`}
                className="cursor-pointer focus:outline-none"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
              />
              <text
                x={p.x}
                y={H - 8}
                textAnchor="middle"
                fontSize="12"
                fontWeight="500"
                className="fill-slate-400"
              >
                {days[i].weekday}
              </text>
            </g>
          ))}
        </svg>

        {hovered !== null && days[hovered] && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 -translate-y-full rounded-xl border border-navy-border/40 bg-navy-950/95 px-3 py-2 text-center shadow-xl"
            style={{
              right: `${r2((1 - pts[hovered].x / W) * 100)}%`,
              top: `${r2((pts[hovered].y / H) * 100)}%`,
              transform: 'translate(50%, -100%)',
            }}
          >
            <p className="text-xs font-semibold text-slate-200">
              {days[hovered].weekday} · {days[hovered].fullDate}
            </p>
            <p dir="ltr" className="mt-0.5 font-mono text-sm font-bold text-cyan-300">
              {formatGroupedMoney(days[hovered].total)} د.ج
            </p>
          </div>
        )}

        {isZero && (
          <p className="mt-2 text-center text-xs text-slate-500">
            لا توجد مبيعات مسجلة في آخر 7 أيام
          </p>
        )}
      </div>
    </section>
  );
}
