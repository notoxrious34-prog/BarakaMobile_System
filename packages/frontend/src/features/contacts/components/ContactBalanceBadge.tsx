import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  balance: string;
  role: 'SUPPLIER' | 'CUSTOMER';
  label?: string;
};

export function ContactBalanceBadge({ balance, role, label }: Props) {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const numericValue = Number(balance);
  const absValue = Math.abs(numericValue);
  const isZero = absValue < 0.005;
  const isNegative = !isZero && numericValue < 0;

  const base = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium font-mono';

  let tone: string;
  let titleHint: string;
  if (isZero) {
    tone = 'border-slate-700 bg-slate-800/60 text-slate-400';
    titleHint = 'لا يوجد رصيد';
  } else if (isNegative) {
    tone = 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    titleHint = 'رصيد عكسي';
  } else if (role === 'CUSTOMER') {
    tone = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    titleHint = 'دين لنا على العميل';
  } else {
    tone = 'border-rose-500/30 bg-rose-500/10 text-rose-400';
    titleHint = 'دين علينا للمورد';
  }

  return (
    <span className={`${base} ${tone}`} dir="ltr" title={titleHint}>
      {label && <span className="ms-1 me-1 text-slate-400">{label}</span>}
      {Number(balance).toFixed(2)} {currencySymbol}
    </span>
  );
}
