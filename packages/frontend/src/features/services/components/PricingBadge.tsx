type Props = {
  pricingType: 'FIXED' | 'COMMISSION';
  value: string;
};

export function PricingBadge({ pricingType, value }: Props) {
  const normalized = (() => {
    const n = Number(value);
    if (Number.isNaN(n)) return value;
    // Keep original formatting but ensure display consistency
    return pricingType === 'FIXED' ? n.toFixed(2) : `${n}`;
  })();

  if (pricingType === 'FIXED') {
    return (
      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800">
        {normalized} DZD
      </span>
    );
  }

  // COMMISSION
  return (
    <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-800">
      {normalized}%
    </span>
  );
}
