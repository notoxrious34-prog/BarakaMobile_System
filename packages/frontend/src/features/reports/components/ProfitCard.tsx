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
      <StatCard label="هامش الربح الإجمالي" value={data.grossMarginPct} suffix="%" tone={netTone} />
    </div>
  );
}
