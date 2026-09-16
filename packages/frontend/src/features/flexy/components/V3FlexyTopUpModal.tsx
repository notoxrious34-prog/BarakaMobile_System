import { useState } from 'react';
import { X } from 'lucide-react';
import { useV3FlexyActions } from '../api/flexyV3Hooks';
import { buildTopUpPayload, previewTopUpMargin, summarizeFlexyError } from '../utils/v3FlexyPayload';
import type { WalletDetails } from '@/api/v3/types';

/**
 * DIRECTIVE-023 Stage 10.4 — quick flexy top-up modal.
 *
 * Phone + face/cost/fee with a live margin preview (→ 40300), CASH or
 * ON_ACCOUNT (registered customer required). Double-submit guarded by
 * `isPending` + the SDK idempotency key.
 */
export function V3FlexyTopUpModal({ wallet, onClose }: { wallet: WalletDetails; onClose: () => void }) {
  const actions = useV3FlexyActions();
  const [phone, setPhone] = useState('');
  const [face, setFace] = useState('');
  const [cost, setCost] = useState('');
  const [fee, setFee] = useState('');
  const [method, setMethod] = useState<'CASH' | 'ON_ACCOUNT'>('CASH');
  const [partyId, setPartyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const preview = previewTopUpMargin(face, cost, fee);

  async function handleTopUp(): Promise<void> {
    setError(null);
    try {
      const result = await actions.topUp.mutateAsync(
        buildTopUpPayload({
          walletId: wallet.id,
          targetPhoneNumber: phone,
          faceAmount: face,
          costAmount: cost.trim() ? cost : undefined,
          feeAmount: fee.trim() ? fee : undefined,
          paymentMethod: method,
          partyId: partyId.trim() || undefined,
        }),
      );
      setReceipt(`تمت التعبئة ${result.transaction.transactionNumber} — الهامش ${result.transaction.marginAmount} د.ج (40300)`);
    } catch (e) {
      setError(summarizeFlexyError(e));
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
      aria-label="تعبئة فليكسي"
    >
      <div className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">تعبئة من {wallet.name}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex justify-between font-mono text-sm" dir="ltr">
          <span className="font-sans text-slate-400">الرصيد العائم</span>
          <span>{wallet.balance} د.ج</span>
        </div>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم هاتف المستفيد" inputMode="tel"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm" dir="ltr" />
        <div className="flex gap-2" dir="ltr">
          <input value={face} onChange={(e) => setFace(e.target.value)} placeholder="القيمة الاسمية" inputMode="decimal"
            className="flex-1 rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm" />
          <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="التكلفة" inputMode="decimal"
            className="flex-1 rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm" />
          <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="رسوم" inputMode="decimal"
            className="flex-1 rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm" />
        </div>
        {face.trim() !== '' && (
          <div className={`rounded-lg border px-3 py-2 font-mono text-sm ${preview.valid ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`} dir="ltr">
            المحصّل {preview.collected} / الهامش {preview.margin} (40300)
          </div>
        )}
        <div className="flex gap-2">
          {(['CASH', 'ON_ACCOUNT'] as const).map((m) => (
            <button key={m} onClick={() => setMethod(m)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold ${method === m ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200' : 'border-navy-border/40 text-slate-400'}`}>
              {m === 'CASH' ? 'نقدي' : 'آجل (دين)'}
            </button>
          ))}
        </div>
        {method === 'ON_ACCOUNT' && (
          <input value={partyId} onChange={(e) => setPartyId(e.target.value)} placeholder="معرّف الزبون (Party ID)"
            className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm" dir="ltr" />
        )}
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {receipt && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{receipt}</p>}
        <button onClick={() => (receipt ? onClose() : void handleTopUp())} disabled={actions.topUp.isPending || !preview.valid}
          className="rounded-xl bg-cyan-700 px-5 py-2.5 font-bold text-white disabled:opacity-50">
          {receipt ? 'إغلاق' : actions.topUp.isPending ? 'جارٍ التعبئة…' : 'تأكيد التعبئة'}
        </button>
      </div>
    </div>
  );
}
