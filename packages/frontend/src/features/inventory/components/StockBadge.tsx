type Props = {
  currentStock: number;
  minStock: number;
};

export function StockBadge({ currentStock, minStock }: Props) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium';
  let tone = '';
  let label = '';

  if (currentStock <= 0) {
    tone = 'border-rose-500/30 bg-rose-500/10 text-rose-400';
    label = 'نفذ من المخزون';
  } else if (minStock > 0 && currentStock <= minStock) {
    tone = 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    label = 'مخزون منخفض';
  } else {
    tone = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    label = 'متوفر';
  }

  return (
    <span className={`${base} ${tone}`}>
      <span>{label}</span>
      <span className="font-mono" dir="ltr">
        {currentStock}
      </span>
    </span>
  );
}
