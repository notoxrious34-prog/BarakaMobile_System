import { useMemo } from 'react';
import Decimal from 'decimal.js';
import { Wallet, ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import type { CashMovement } from '../types';
import { formatCashAmount, parseCashAmount } from '../utils/cashLabels';

type Props = {
  balance: string;
  movements: CashMovement[];
  currencySymbol?: string;
};

function isToday(iso: string): boolean {
  try {
    return new Date(iso).toDateString() === new Date().toDateString();
  } catch {
    return false;
  }
}

const EPS = new Decimal(0.005);

/**
 * TB-079 — Treasury metric strip (Pillar 5, Phase 1).
 * All sums and deltas computed with Decimal (Rule ②). Zero float math.
 * Deep Navy cards with gold hover accent (AD-57); AD-61 semantic tones.
 */
export function CashMetricCards({ balance, movements, currencySymbol = 'د.ج' }: Props) {
  const stats = useMemo(() => {
    const today = movements.filter((m) => isToday(m.createdAt));
    let inflow = new Decimal(0);
    let outflow = new Decimal(0);
    for (const m of today) {
      const amt = parseCashAmount(m.amount);
      if (!amt.isFinite() || amt.abs().lessThan(EPS)) continue;
      if (m.type === 'IN') inflow = inflow.plus(amt);
      else outflow = outflow.plus(amt);
    }
    const net = inflow.minus(outflow);
    const netIsZero = net.abs().lessThan(EPS);
    return {
      inflow: inflow.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      outflow: outflow.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      net: net.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      netTone: netIsZero
        ? 'text-cyan-300'
        : net.greaterThan(new Decimal(0))
          ? 'text-emerald-400'
          : 'text-rose-400',
    };
  }, [movements]);

  const cards = [
    {
      key: 'balance',
      label: 'الرصيد النقدي المتوفر',
      value: formatCashAmount(balance, currencySymbol),
      tone: 'text-emerald-400',
      Icon: Wallet,
      badge: 'صندوق نشط',
      badgeCls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    },
    {
      key: 'inflow',
      label: 'إجمالي الوارد اليوم',
      value: formatCashAmount(stats.inflow, currencySymbol),
      tone: 'text-emerald-400',
      Icon: ArrowDownLeft,
      badge: null as string | null,
      badgeCls: '',
    },
    {
      key: 'outflow',
      label: 'إجمالي المنصرف اليوم',
      value: formatCashAmount(stats.outflow, currencySymbol),
      tone: 'text-rose-400',
      Icon: ArrowUpRight,
      badge: null as string | null,
      badgeCls: '',
    },
    {
      key: 'net',
      label: 'صافي حركة اليوم',
      value: formatCashAmount(stats.net, currencySymbol),
      tone: stats.netTone,
      Icon: Scale,
      badge: null as string | null,
      badgeCls: '',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" dir="rtl">
      {cards.map(({ key, label, value, tone, Icon, badge, badgeCls }) => (
        <div
          key={key}
          className="rounded-xl border border-navy-700/50 bg-navy-900/60 px-3 py-2 backdrop-blur-sm transition-all hover:border-amber-500/30"
        >
          <div className="flex items-center justify-between gap-1">
            <p className="truncate text-[11px] text-slate-500">{label}</p>
            <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          </div>
          <p dir="ltr" className={`mt-0.5 text-left font-mono text-base font-bold ${tone}`}>
            {value}
          </p>
          {badge && (
            <span
              className={`mt-1 inline-flex rounded-full border px-2 py-px text-[10px] font-bold ${badgeCls}`}
            >
              {badge}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
