import { Link } from 'react-router-dom';
import Decimal from 'decimal.js';
import { Zap } from 'lucide-react';
import { useWalletStatsQuery } from '@/features/wallets/hooks/useWallets';

function to2dp(raw: string): string {
  try {
    return new Decimal(raw).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

/** Live digital-services panel: today's Flexy volume/profit + wallet liquidity. */
export function FlexyExpressWidget() {
  const { data, isLoading } = useWalletStatsQuery();
  const nominal = data?.sales.nominalVolume ?? '0.00';
  const profit = data?.sales.commissionProfit ?? '0.00';
  const liquidity = data?.liquidity.total ?? '0.00';
  const count = data?.sales.count ?? 0;

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-navy-900 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400">
          <Zap className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-extrabold text-slate-100">الأداء الرقمي (فليكسي)</h2>
        <Link
          to="/flexy"
          className="mr-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
        >
          فتح قمرة القيادة [F3] ↗
        </Link>
      </div>
      {isLoading ? (
        <p className="mt-3 text-xs text-slate-500" role="status">جارٍ تحميل بيانات المحافظ…</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-navy-border/30 bg-navy-950/50 p-2">
            <p className="text-[10px] text-slate-400">مبيعات اليوم ({count})</p>
            <p dir="ltr" className="mt-0.5 font-mono text-sm font-bold text-slate-100">{to2dp(nominal)}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2">
            <p className="text-[10px] text-slate-400">صافي الأرباح</p>
            <p dir="ltr" className="mt-0.5 font-mono text-sm font-bold text-emerald-300">{to2dp(profit)}</p>
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2">
            <p className="text-[10px] text-slate-400">سيولة المحافظ</p>
            <p dir="ltr" className="mt-0.5 font-mono text-sm font-bold text-cyan-300">{to2dp(liquidity)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
