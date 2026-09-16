import { useState } from 'react';
import { X } from 'lucide-react';
import { useV3RepairActions } from '../api/repairV3Hooks';
import { summarizeV3SaleError } from '@/features/pos/utils/buildV3Sale';

/**
 * DIRECTIVE-022 Stage 10.3 — spare-part consumption modal.
 *
 * Attaches an inventory spare part to the order (item, quantity, custom
 * unit price). The backend issues stock 12200 → 12300 Repair WIP
 * atomically; the workbench refreshes parts + WIP total on success.
 * Allowed from APPROVED / IN_REPAIR legs (server enforces the FSM).
 */
export function V3AddRepairPartModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const actions = useV3RepairActions(orderId);
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(): Promise<void> {
    setError(null);
    try {
      await actions.addPart.mutateAsync({ itemId: itemId.trim(), quantity: Number(quantity), unitPrice: unitPrice.trim() });
      onClose();
    } catch (e) {
      setError(summarizeV3SaleError(e));
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
      aria-label="إضافة قطعة غيار"
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-navy-border/40 bg-navy-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">استهلاك قطعة غيار (WIP)</h2>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          placeholder="معرّف الصنف (Item ID)"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm"
          dir="ltr"
        />
        <div className="flex gap-3" dir="ltr">
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="الكمية"
            inputMode="numeric"
            className="w-1/3 rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm"
          />
          <input
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="سعر البيع"
            inputMode="decimal"
            className="flex-1 rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm"
          />
        </div>
        <p className="text-xs text-slate-400">يُخصم المخزون من 12200 ويُقيّد في 12300 (WIP) فور التأكيد.</p>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button
          onClick={() => void handleAdd()}
          disabled={actions.addPart.isPending || !itemId.trim() || !unitPrice.trim()}
          className="rounded-xl bg-violet-600 px-5 py-2.5 font-bold text-white disabled:opacity-50"
        >
          {actions.addPart.isPending ? 'جارٍ الاستهلاك…' : 'تأكيد الاستهلاك'}
        </button>
      </div>
    </div>
  );
}
