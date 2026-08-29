type Props = {
  balance: string;
  role: 'SUPPLIER' | 'CUSTOMER';
  label?: string;
};

export function ContactBalanceBadge({ balance, role, label }: Props) {
  const isSupplier = role === 'SUPPLIER';
  const base =
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';
  const tone = isSupplier
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-blue-200 bg-blue-50 text-blue-800';

  return (
    <span className={`${base} ${tone}`} dir="ltr" title={label ?? role}>
      {label && <span className="ms-1 me-1">{label}</span>}
      {balance} DZD
    </span>
  );
}
