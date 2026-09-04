import Decimal from 'decimal.js';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { fmtMoney, isZeroBalance } from '../utils/contactLabels';

type Props = {
  balance: string;
  role: 'SUPPLIER' | 'CUSTOMER';
  label?: string;
};

/**
 * TB-074 — balance pill, Decimal-only (Rule ②). Zero Number()/Math.abs().
 * Tones: zero slate · negative (contra) amber · CUSTOMER+ emerald ·
 * SUPPLIER+ rose (AD-61: rose marks amounts owed).
 */
export function ContactBalanceBadge({ balance, role, label }: Props) {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  let numeric: Decimal;
  try {
    numeric = new Decimal(balance);
  } catch {
    numeric = new Decimal(0);
  }
  const isZero = isZeroBalance(balance);
  const isNegative = !isZero && numeric.isNegative();

  const base =
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium font-mono';

  let tone: string;
  let titleHint: string;
  if (isZero) {
    tone = 'border-navy-border/40 bg-white/[0.04] text-slate-400';
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
      {label && <span className="ms-1 me-1 font-sans text-slate-400">{label}</span>}
      {fmtMoney(balance)} {currencySymbol}
    </span>
  );
}
