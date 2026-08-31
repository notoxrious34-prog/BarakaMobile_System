import { StatCard } from './StatCard';
import type { ProfitResponse } from '../hooks/useReports';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  data: ProfitResponse;
};

function getNetProfitTone(value: string): 'positive' | 'negative' {
  const n = Number(value);
  return n >= 0 ? 'positive' : 'negative';
}

export function ProfitCard({ data }: Props) {
  const netTone = getNetProfitTone(data.netProfit);
  const afterTone = getNetProfitTone(data.netProfitAfterExpenses);
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="إجمالي الإيرادات" value={data.totalRevenue} suffix={currencySymbol} tone="positive" />
      <StatCard label="إجمالي التكاليف" value={data.totalCost} suffix={currencySymbol} tone="warning" />
      <StatCard label="ربح الخدمات" value={data.serviceProfit} suffix={currencySymbol} tone="positive" />
      <StatCard label="ربح المنتجات" value={data.itemProfit} suffix={currencySymbol} tone="positive" />
      <StatCard label="إجمالي الربح" value={data.grossProfit} suffix={currencySymbol} tone="positive" />
      <StatCard label="صافي الربح" value={data.netProfit} suffix={currencySymbol} tone={netTone} />
      <StatCard label="إجمالي المصاريف" value={data.totalExpenses} suffix={currencySymbol} tone="warning" />
      <div className="rounded-lg border-2 border-zinc-900 bg-white p-4 shadow-md">
        <p className="text-xs font-bold text-zinc-900">صافي الربح بعد المصاريف (الحقيقة النهائية)</p>
        <p className={`mt-1 text-xl font-extrabold ${afterTone === 'positive' ? 'text-emerald-700' : 'text-red-600'}`} dir="ltr">{Number(data.netProfitAfterExpenses).toFixed(2)} {currencySymbol}</p>
      </div>
      <StatCard label="هامش الربح الإجمالي" value={data.grossMarginPct} suffix="%" tone={netTone} />
    </div>
  );
}
