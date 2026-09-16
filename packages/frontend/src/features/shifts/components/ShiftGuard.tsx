import { useState } from 'react';
import { LockKeyhole, Play } from 'lucide-react';
import { useActiveShiftQuery, useOpenShiftMutation } from '../api/shiftV3Hooks';
import { useShiftUiStore } from '../store/shiftUiStore';
import { summarizeV3SaleError } from '@/features/pos/utils/buildV3Sale';

/**
 * DIRECTIVE-021 Stage 10.2 — v3 shift gate for POS checkout.
 *
 * Renders children only while a shift is ACTIVE on the configured
 * register; otherwise shows the "Open Shift Required" panel with an
 * inline opening-float form. Register pointer persists in localStorage
 * (deployment seeds `CashRegister` rows — there is no provisioning API).
 */
export function ShiftGuard({ children }: { children: React.ReactNode }) {
  const registerId = useShiftUiStore((s) => s.registerId);
  const setRegisterId = useShiftUiStore((s) => s.setRegisterId);
  const active = useActiveShiftQuery(registerId);
  const openMut = useOpenShiftMutation(registerId);
  const [openingCash, setOpeningCash] = useState('200.00');
  const [notes, setNotes] = useState('');
  const [registerInput, setRegisterInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const shift = active.data?.shift ?? null;

  async function handleOpen(): Promise<void> {
    const reg = registerId ?? registerInput.trim();
    if (!reg) {
      setError('حدّد معرّف الصندوق أولاً');
      return;
    }
    if (!registerId) setRegisterId(reg);
    setError(null);
    try {
      await openMut.mutateAsync({ registerId: reg, openingCash: openingCash.trim() || '0.00', notes: notes.trim() || undefined });
    } catch (e) {
      setError(summarizeV3SaleError(e));
    }
  }

  if (active.isLoading) {
    return <div className="flex items-center justify-center p-8 text-slate-400">جارٍ التحقق من الوردية…</div>;
  }

  if (!shift) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center">
        <LockKeyhole className="h-8 w-8 text-amber-300" />
        <h2 className="text-lg font-bold text-amber-200">فتح الوردية مطلوب</h2>
        <p className="text-sm text-amber-200/80">لا يمكن إتمام البيع قبل فتح وردية على الصندوق — حدّد الصندوق ومبلغ الافتتاح.</p>
        {!registerId && (
          <input
            value={registerInput}
            onChange={(e) => setRegisterInput(e.target.value)}
            placeholder="معرّف الصندوق"
            className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm"
            dir="ltr"
          />
        )}
        <input
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          placeholder="مبلغ الافتتاح"
          inputMode="decimal"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm"
          dir="ltr"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ملاحظات (اختياري)"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          onClick={() => void handleOpen()}
          disabled={openMut.isPending}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {openMut.isPending ? 'جارٍ الفتح…' : 'فتح الوردية'}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
