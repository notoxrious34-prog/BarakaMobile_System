type Props = {
  type: 'SALE' | 'PURCHASE' | 'PAYMENT_IN' | 'PAYMENT_OUT' | 'OFFSET';
};

const MAP: Record<string, { label: string; className: string }> = {
  SALE: { label: 'بيع', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' },
  PURCHASE: { label: 'شراء', className: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' },
  PAYMENT_IN: { label: 'تحصيل', className: 'bg-teal-500/10 text-teal-400 border border-teal-500/30' },
  PAYMENT_OUT: { label: 'دفع', className: 'bg-orange-500/10 text-orange-400 border border-orange-500/30' },
  OFFSET: { label: 'مقاصة', className: 'bg-purple-500/10 text-purple-400 border border-purple-500/30' },
};

export function TransactionTypeBadge({ type }: Props) {
  const cfg = MAP[type] ?? { label: type, className: 'bg-slate-700/40 text-slate-300 border border-slate-700' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
