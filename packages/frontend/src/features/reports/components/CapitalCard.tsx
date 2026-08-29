import { StatCard } from './StatCard';
import type { CapitalResponse } from '../hooks/useReports';

type Props = {
  data: CapitalResponse;
};

function getNetCapitalTone(value: string): 'positive' | 'negative' | 'neutral' {
  const n = Number(value);
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'neutral';
}

export function CapitalCard({ data }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="إجمالي الذمم المدينة" value={data.totalReceivables} suffix="DZD" tone="positive" />
      <StatCard label="إجمالي الذمم الدائنة" value={data.totalPayables} suffix="DZD" tone="warning" />
      <StatCard label="قيمة المخزون" value={data.inventoryValue} suffix="DZD" tone="neutral" />
      <StatCard
        label="رأس المال الصافي"
        value={data.netCapital}
        suffix="DZD"
        tone={getNetCapitalTone(data.netCapital)}
      />
    </div>
  );
}
