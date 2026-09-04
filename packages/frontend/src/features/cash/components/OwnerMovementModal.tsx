import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { OwnerMovementMode } from '../types';
import { formatCashAmount, parseCashAmount, validateCashInput } from '../utils/cashLabels';

type Props = {
  mode: OwnerMovementMode;
  open: boolean;
  onClose: () => void;
  currentBalance: string;
  currencySymbol?: string;
  isSubmitting?: boolean;
  onSubmit: (data: { amount: string; note?: string }) => void | Promise<void>;
};

const QUICK_CHIPS = ['500', '1000', '5000', '10000'];

/**
 * TB-079 — Owner deposit/draw modal (Pillar 5, Phase 1).
 * Deposit → emerald CTA; Draw → rose CTA with balance-cap warning (AD-61).
 * Amount math via Decimal only (Rule ②). ESC + backdrop dismiss.
 */
export function OwnerMovementModal({
  mode,
  open,
  onClose,
  currentBalance,
  currencySymbol = 'د.ج',
  isSubmitting = false,
  onSubmit,
}: Props) {
  const isDeposit = mode === 'deposit';
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setNote('');
      setTouched(false);
    }
  }, [open, mode ]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const validation = validateCashInput(
    amount,
    isDeposit ? undefined : parseCashAmount(currentBalance).toFixed(2),
  );
  const showError = touched && !validation.isValid;
  const canSubmit = validation.isValid && !isSubmitting;

  function addChip(chip: string): void {
    try {
      const base = amount.trim() === '' ? new Decimal(0) : new Decimal(amount.trim());
      if (!base.isFinite() || base.lessThan(new Decimal(0))) {
        setAmount(chip);
      } else {
        setAmount(
          base.plus(new Decimal(chip)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
        );
      }
    } catch {
      setAmount(chip);
    }
    setTouched(true);
  }

  const title = isDeposit ? 'إيداع في الصندوق (Owner Deposit)' : 'سحب من الصندوق (Owner Withdrawal)';
  const Icon = isDeposit ? ArrowDownLeft : ArrowUpRight;
  const accent = isDeposit ? 'text-emerald-400' : 'text-rose-400';
  const submitCls = isDeposit
    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
    : 'bg-rose-600 hover:bg-rose-500 text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-2xl border border-navy-border/40 bg-navy-900 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-100">
            <Icon className={`h-5 w-5 ${accent}`} aria-hidden="true" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mb-3 text-xs text-slate-500">
          الرصيد الحالي:{' '}
          <span dir="ltr" className="font-mono font-bold text-slate-200">
            {formatCashAmount(currentBalance, currencySymbol)}
          </span>
        </p>

        <label htmlFor="owner-movement-amount" className="mb-1 block text-sm font-bold text-slate-300">
          المبلغ <span className="text-rose-400">*</span>
        </label>
        <input
          id="owner-movement-amount"
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setTouched(true);
          }}
          disabled={isSubmitting}
          placeholder="0.00"
          dir="ltr"
          aria-label="المبلغ"
          className={`w-full rounded-xl border bg-navy-950/60 px-3 py-2.5 font-mono text-lg font-bold text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 ${
            showError ? 'border-rose-500/50' : 'border-navy-border/40'
          }`}
        />

        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="مبالغ سريعة">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => addChip(chip)}
              disabled={isSubmitting}
              className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2.5 py-1 font-mono text-xs font-bold text-slate-300 hover:border-amber-500/30 hover:text-slate-100 disabled:opacity-50"
            >
              <span dir="ltr">+{chip}</span> {currencySymbol}
            </button>
          ))}
        </div>

        {showError && validation.error && (
          <p className="mt-2 text-xs font-bold text-rose-400" role="alert">
            {validation.error}
          </p>
        )}

        <label htmlFor="owner-movement-note" className="mb-1 mt-3 block text-sm font-bold text-slate-300">
          ملاحظة
        </label>
        <input
          id="owner-movement-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isSubmitting}
          placeholder="بيان الحركة (اختياري)"
          aria-label="ملاحظة"
          className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              if (!validation.isValid || !validation.decimalValue) return;
              void onSubmit({
                amount: validation.decimalValue.toFixed(2),
                note: note.trim() || undefined,
              });
            }}
            disabled={!canSubmit}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-extrabold disabled:opacity-50 ${submitCls}`}
          >
            {isSubmitting ? 'جاري الحفظ…' : isDeposit ? 'تأكيد الإيداع' : 'تأكيد السحب'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-navy-border/40 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/[0.06]"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
