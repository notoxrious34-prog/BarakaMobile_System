import { StatCard } from './StatCard';
import type { ProfitResponse } from '../hooks/useReports';

type Props = {
  data: ProfitResponse;
};

function getNetProfitTone(value: string): 'positive' | 'negative' {
  const n = Number(value);
  return n >= 0 ? 'positive' : 'negative';
}

export function ProfitCard({ data }: Props) {
  const netTone = getNetProfitTone(data.netProfit);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="إجمالي الإيرادات" value={data.totalRevenue} suffix="DZD" tone="positive" />
      <StatCard label="إجمالي التكاليف" value={data.totalCost} suffix="DZD" tone="warning" />
      <StatCard label="ربح الخدمات" value={data.serviceProfit} suffix="DZD" tone="positive" />
      <StatCard label="ربح المنتجات" value={data.itemProfit} suffix="DZD" tone="positive" />
      <StatCard label="إجمالي الربح" value={data.grossProfit} suffix="DZD" tone="positive" />
      <StatCard label="صافي الربح" value={data.netProfit} suffix="DZD" tone={netTone} />
    </div>
  );
}
