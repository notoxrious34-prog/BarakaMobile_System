import Decimal from 'decimal.js';
import { StatCard } from './StatCard';
import type { ProfitResponse } from '../hooks/useReports';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  data: ProfitResponse;
};

function getNetProfitTone(value: string): 'positive' | 'negative' {
  try {
    return new Decimal(value || '0').gte(0) ? 'positive' : 'negative';
  } catch {
    return 'positive';
  }
}

export function ProfitCard({ data }: Props) {
  const netTone = getNetProfitTone(data.netProfit);
  const afterTone = getNetProfitTone(data.netProfitAfterExpenses);
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  let netAfterDisplay = '0.00';
  try {
    netAfterDisplay = new Decimal(data.netProfitAfterExpenses || '0').toFixed(2);
  } catch {
    netAfterDisplay = '0.00';
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="إجمالي الإيرادات" value={data.totalRevenue} suffix={currencySymbol} tone="positive" />
      <StatCard label="إجمالي التكاليف" value={data.totalCost} suffix={currencySymbol} tone="warning" />
      <StatCard label="ربح الخدمات" value={data.serviceProfit} suffix={currencySymbol} tone="positive" />
      <StatCard label="ربح المنتجات" value={data.itemProfit} suffix={currencySymbol} tone="positive" />
      {data.repairProfit && (
        <StatCard label="أرباح الصيانة" value={data.repairProfit} suffix={currencySymbol} tone="positive" />
      )}
      <StatCard label="إجمالي الربح" value={data.grossProfit} suffix={currencySymbol} tone="positive" />
      <StatCard label="صافي الربح" value={data.netProfit} suffix={currencySymbol} tone={netTone} />
      <StatCard label="إجمالي المصاريف" value={data.totalExpenses} suffix={currencySymbol} tone="warning" />
      <div className="rounded-2xl border-2 border-navy-700/80 bg-navy-900/90 p-5 shadow-xl shadow-navy-950/50 backdrop-blur-sm">
        <p className="text-xs font-bold text-slate-100">صافي الربح بعد المصاريف (الحقيقة النهائية)</p>
        <p className={`mt-1 text-xl font-extrabold font-mono ${afterTone === 'positive' ? 'text-emerald-400' : 'text-rose-400'}`} dir="ltr">
          {netAfterDisplay} {currencySymbol}
        </p>
      </div>
      <StatCard label="هامش الربح الإجمالي" value={data.grossMarginPct} suffix="%" tone={netTone} />
    </div>
  );
}
