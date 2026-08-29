type Props = {
  stock: number;
};

export function StockBadge({ stock }: Props) {
  const base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';
  let tone = '';
  if (stock > 0) tone = 'border-emerald-200 bg-emerald-50 text-emerald-800';
  else if (stock === 0) tone = 'border-amber-200 bg-amber-50 text-amber-800';
  else tone = 'border-red-200 bg-red-50 text-red-800';

  return (
    <span className={`${base} ${tone}`} dir="ltr">
      {stock}
    </span>
  );
}
