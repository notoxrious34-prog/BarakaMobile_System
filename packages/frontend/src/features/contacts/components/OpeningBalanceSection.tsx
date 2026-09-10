import { Lock } from 'lucide-react';
import type { OpeningDirection } from '../api/counterpartyApi';

export type OpeningFormState = {
  amount: string;
  direction: OpeningDirection;
  date: string;
  note: string;
};

export const EMPTY_OPENING: OpeningFormState = { amount: '', direction: 'DEBIT', date: '', note: '' };

const CUSTOMER_DIRECTIONS: { value: OpeningDirection; label: string; hint: string }[] = [
  { value: 'DEBIT', label: 'مدين', hint: 'دين على العميل لصالح المحل' },
  { value: 'CREDIT', label: 'دائن', hint: 'رصيد/عربون مسبق للعميل لدى المحل' },
];

const SUPPLIER_DIRECTIONS: { value: OpeningDirection; label: string; hint: string }[] = [
  { value: 'CREDIT', label: 'دائن', hint: 'مستحقات للمورد في ذمة المحل' },
  { value: 'DEBIT', label: 'مدين', hint: 'دفعات مقدمة / سلف للمورد' },
];

type Props = {
  kind: 'customer' | 'supplier';
  value: OpeningFormState;
  onChange: (next: OpeningFormState) => void;
  locked: boolean;
  disabled?: boolean;
};

function todayYmd(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * AD-76 opening balance card (TB-142). All monetary state stays string;
 * no arithmetic here — the server computes balances with decimal.js.
 * In locked mode the fields render read-only with a lock callout.
 */
export function OpeningBalanceSection({ kind, value, onChange, locked, disabled }: Props) {
  const options = kind === 'customer' ? CUSTOMER_DIRECTIONS : SUPPLIER_DIRECTIONS;
  const set = (patch: Partial<OpeningFormState>) => onChange({ ...value, ...patch });
  const inputCls =
    'w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 disabled:opacity-60';

  return (
    <section aria-label="الرصيد الافتتاحي" className="rounded-2xl border border-navy-border/40 bg-navy-950/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100">الرصيد الافتتاحي</h3>
        {locked && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-300">
            <Lock className="h-3 w-3" aria-hidden="true" />
            مقفل — غير قابل للتعديل
          </span>
        )}
      </div>

      {locked ? (
        <p className="text-xs leading-5 text-slate-400">
          تم تثبيت الرصيد الافتتاحي أو توجد حركات لاحقة على الحساب — لا يمكن تعديله حفاظًا على سلامة الكشف.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label htmlFor={`ob-amount-${kind}`} className="mb-1 block text-sm font-medium text-slate-300">
              المبلغ (د.ج)
            </label>
            <input
              id={`ob-amount-${kind}`}
              type="text"
              inputMode="decimal"
              value={value.amount}
              onChange={(e) => set({ amount: e.target.value })}
              disabled={disabled}
              dir="ltr"
              className={`${inputCls} font-mono tabular-nums`}
              placeholder="مثال: 15000.00"
            />
          </div>

          <div>
            <label htmlFor={`ob-direction-${kind}`} className="mb-1 block text-sm font-medium text-slate-300">
              الاتجاه
            </label>
            <select
              id={`ob-direction-${kind}`}
              value={value.direction}
              onChange={(e) => set({ direction: e.target.value as OpeningDirection })}
              disabled={disabled}
              className={inputCls}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} — {o.hint}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`ob-date-${kind}`} className="mb-1 block text-sm font-medium text-slate-300">
              التاريخ (اختياري — افتراضيًا اليوم)
            </label>
            <input
              id={`ob-date-${kind}`}
              type="date"
              value={value.date}
              min="2010-01-01"
              max={todayYmd()}
              onChange={(e) => set({ date: e.target.value })}
              disabled={disabled}
              dir="ltr"
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>

          <div>
            <label htmlFor={`ob-note-${kind}`} className="mb-1 block text-sm font-medium text-slate-300">
              ملاحظة (اختياري)
            </label>
            <input
              id={`ob-note-${kind}`}
              type="text"
              value={value.note}
              onChange={(e) => set({ note: e.target.value })}
              disabled={disabled}
              className={inputCls}
              placeholder="مثال: رصيد مرحل من الدفاتر القديمة"
            />
          </div>
        </div>
      )}
    </section>
  );
}
