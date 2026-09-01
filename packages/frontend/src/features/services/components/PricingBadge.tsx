import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  pricingType: 'FIXED' | 'COMMISSION';
  value: string;
};

export function PricingBadge({ pricingType, value }: Props) {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const normalized = (() => {
    const n = Number(value);
    if (Number.isNaN(n)) return value;
    return pricingType === 'FIXED' ? n.toFixed(2) : `${n}`;
  })();

  if (pricingType === 'FIXED') {
    return (
      <span className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-medium text-cyan-400">
        <span className="font-mono" dir="ltr">
          {normalized} {currencySymbol}
        </span>
      </span>
    );
  }

  // COMMISSION
  return (
    <span className="inline-flex rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-400">
      <span className="font-mono" dir="ltr">
        {normalized}%
      </span>
    </span>
  );
}
