import { transactionTypeBox, transactionTypeLabel } from '../utils/transactionLabels';

type Props = {
  type: 'SALE' | 'PURCHASE' | 'PAYMENT_IN' | 'PAYMENT_OUT' | 'OFFSET';
};

/**
 * TB-076 — type pill consuming the shared DRY map (AD-61 tones).
 * PAYMENT_OUT is rose (cash outflow); OFFSET is violet.
 */
export function TransactionTypeBadge({ type }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${transactionTypeBox(type)}`}
    >
      {transactionTypeLabel(type)}
    </span>
  );
}
