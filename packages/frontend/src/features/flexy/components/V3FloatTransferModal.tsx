import { useState } from 'react';
import { X } from 'lucide-react';
import { useV3FlexyActions } from '../api/flexyV3Hooks';
import { buildFloatTransferPayload, summarizeFlexyError, type FloatLeg } from '../utils/v3FlexyPayload';
import type { WalletDetails } from '@/api/v3/types';

/**
 * DIRECTIVE-023 Stage 10.4 — inter-account float transfer modal.
 *
 * Moves liquidity between CASH (10000), BANK (10200) and WALLET (10100).
 * Wallet pickers appear exactly when the matching leg is WALLET. The
 * backend posts Dr target / Cr source and syncs wallet balances.
 */
const LEG_LABEL: Record<FloatLeg, string> = {
  CASH: 'الصندوق (10000)',
  BANK: 'البنك (10200)',
  WALLET: 'محفظة (10100)',
};

function LegSelect({ label, value, onChange }: { label: string; value: FloatLeg; onChange: (v: FloatLeg) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-1 text-sm">
      <span className="text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as FloatLeg)}
        className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-2">
        {(Object.keys(LEG_LABEL) as FloatLeg[]).map((leg) => (
          <option key={leg} value={leg}>{LEG_LABEL[leg]}</option>
        ))}
      </select>
    </label>
  );
}

export function V3FloatTransferModal({ wallets, onClose }: { wallets: WalletDetails[]; onClose: () => void }) {
  const actions = useV3FlexyActions();
  const [source, setSource] = useState<FloatLeg>('CASH');
  const [sourceWalletId, setSourceWalletId] = useState('');
  const [target, setTarget] = useState<FloatLeg>('WALLET');
  const [targetWalletId, setTargetWalletId] = useState(wallets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  async function handleTransfer(): Promise<void> {
    setError(null);
    try {
      const result = await actions.transferFloat.mutateAsync(
        buildFloatTransferPayload({
          sourceAccountType: source,
          sourceWalletId: sourceWalletId || undefined,
          targetAccountType: target,
          targetWalletId: targetWalletId || undefined,
          amount,
          reason,
        }),
      );
      setReceipt(`تم التحويل ${result.record.transferNumber} — ${result.record.amount} د.ج`);
    } catch (e) {
      setError(e instanceof Error && !(e as { code?: unknown }).code ? e.message : summarizeFlexyError(e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="تحويل عائم"
    >
      <div className="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-navy-border/40 bg-navy-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">تحويل السيولة العائمة</h2>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-2">
          <LegSelect label="من" value={source} onChange={setSource} />
          <LegSelect label="إلى" value={target} onChange={setTarget} />
        </div>
        {source === 'WALLET' && (
          <select value={sourceWalletId} onChange={(e) => setSourceWalletId(e.target.value)}
            className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm">
            <option value="">— محفظة المصدر —</option>
            {wallets.map((w) => (<option key={w.id} value={w.id}>{w.name} ({w.balance})</option>))}
          </select>
        )}
        {target === 'WALLET' && (
          <select value={targetWalletId} onChange={(e) => setTargetWalletId(e.target.value)}
            className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm">
            <option value="">— محفظة الوجهة —</option>
            {wallets.map((w) => (<option key={w.id} value={w.id}>{w.name} ({w.balance})</option>))}
          </select>
        )}
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ" inputMode="decimal"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm" dir="ltr" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب التحويل"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm" />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {receipt && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{receipt}</p>}
        <button onClick={() => (receipt ? onClose() : void handleTransfer())} disabled={actions.transferFloat.isPending}
          className="rounded-xl bg-cyan-700 px-5 py-2.5 font-bold text-white disabled:opacity-50">
          {receipt ? 'إغلاق' : actions.transferFloat.isPending ? 'جارٍ التحويل…' : 'تأكيد التحويل'}
        </button>
      </div>
    </div>
  );
}
