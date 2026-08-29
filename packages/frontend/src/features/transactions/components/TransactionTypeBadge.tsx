type Props = {
  type: 'SALE' | 'PURCHASE' | 'PAYMENT_IN' | 'PAYMENT_OUT' | 'OFFSET';
};

const MAP: Record<string, { label: string; className: string }> = {
  SALE: { label: 'بيع', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  PURCHASE: { label: 'شراء', className: 'border-blue-200 bg-blue-50 text-blue-800' },
  PAYMENT_IN: { label: 'تحصيل', className: 'border-teal-200 bg-teal-50 text-teal-800' },
  PAYMENT_OUT: { label: 'دفع', className: 'border-orange-200 bg-orange-50 text-orange-800' },
  OFFSET: { label: 'مقاصة', className: 'border-purple-200 bg-purple-50 text-purple-800' },
};

export function TransactionTypeBadge({ type }: Props) {
  const cfg = MAP[type] ?? { label: type, className: 'border-zinc-200 bg-zinc-50 text-zinc-700' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
