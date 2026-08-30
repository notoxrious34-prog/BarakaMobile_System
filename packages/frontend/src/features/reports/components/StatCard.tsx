import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  label: string;
  value: string;
  suffix?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'warning';
};

const TONE_CLASSES: Record<string, string> = {
  neutral: 'border-zinc-200 bg-white text-zinc-900',
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  negative: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

export function StatCard({ label, value, suffix, tone = 'neutral' }: Props) {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const resolvedSuffix = suffix ?? currencySymbol;
  const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;
  const displayValue = (() => {
    const n = Number(value);
    if (Number.isNaN(n)) return value;
    return n.toFixed(2);
  })();

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 text-lg font-bold" dir="ltr">
        {displayValue} {resolvedSuffix}
      </p>
    </div>
  );
}
