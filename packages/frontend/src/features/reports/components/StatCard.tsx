import Decimal from 'decimal.js';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning';
};

const TONE_CLASSES: Record<string, string> = {
  neutral: 'border-navy-800 bg-navy-900/60 text-slate-100 hover:border-navy-700 transition-colors',
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  negative: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
};

export function StatCard({ label, value, suffix, tone = 'neutral' }: Props) {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const resolvedSuffix = suffix ?? currencySymbol;
  const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;
  const displayValue = (() => {
    try {
      return new Decimal(value).toFixed(2);
    } catch {
      return value;
    }
  })();

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold font-mono" dir="ltr">
        {displayValue} {resolvedSuffix}
      </p>
    </div>
  );
}
