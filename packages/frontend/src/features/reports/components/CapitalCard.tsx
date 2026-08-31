import { StatCard } from './StatCard';
import type { CapitalResponse } from '../hooks/useReports';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

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
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard label="إجمالي الذمم المدينة" value={data.totalReceivables} suffix={currencySymbol} tone="positive" />
      <StatCard label="إجمالي الذمم الدائنة" value={data.totalPayables} suffix={currencySymbol} tone="warning" />
      <StatCard label="قيمة المخزون" value={data.inventoryValue} suffix={currencySymbol} tone="neutral" />
      <StatCard label="السيولة في الصندوق" value={data.cashInHand} suffix={currencySymbol} tone="neutral" />
      <StatCard
        label="رأس المال الصافي"
        value={data.netCapital}
        suffix={currencySymbol}
        tone={getNetCapitalTone(data.netCapital)}
      />
    </div>
  );
}
