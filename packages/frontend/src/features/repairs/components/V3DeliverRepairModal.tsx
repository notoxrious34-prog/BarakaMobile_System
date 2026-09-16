import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useV3RepairActions } from '../api/repairV3Hooks';
import { buildDeliverRepairPayload, type SettlementPaymentInput } from '../utils/v3RepairSettlement';
import { summarizeV3SaleError } from '@/features/pos/utils/buildV3Sale';
import type { RepairDetails } from '@/api/v3/types';
import type { UiPaymentMethod } from '@/features/pos/utils/buildV3Sale';

/**
 * DIRECTIVE-022 Stage 10.3 — delivery & settlement modal.
 *
 * Reviews parts total + labor, applies the Discount Waterfall, splits
 * payment across CASH / BANK / WALLET / ON_ACCOUNT, and delivers via
 * `POST /v3/repairs/:id/deliver`. On success the backend clears WIP →
 * 50100, books 40200 labor revenue, and records the balance — the modal
 * surfaces that GL feedback before closing.
 */
const METHOD_LABEL: Record<UiPaymentMethod, string> = {
  CASH: 'نقدي',
  BANK: 'بنكي',
  WALLET: 'محفظة',
  ON_ACCOUNT: 'آجل',
};

export function V3DeliverRepairModal({ order, onClose }: { order: RepairDetails; onClose: (delivered: boolean) => void }) {
  const actions = useV3RepairActions(order.id);
  const [discount, setDiscount] = useState(order.discountAmount ?? '0.00');
  const [rows, setRows] = useState<SettlementPaymentInput[]>([{ method: 'CASH', amount: order.totalAmount ?? '0.00' }]);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const summary = useMemo(() => {
    try {
      return {
        ok: true as const,
        value: buildDeliverRepairPayload({
          laborPrice: order.laborPrice,
          partsTotal: order.partsPriceTotal,
          discountAmount: discount,
          payments: rows,
          hasRegisteredCustomer: true,
        }),
      };
    } catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : 'خطأ في التسوية' };
    }
  }, [order.laborPrice, order.partsPriceTotal, discount, rows]);

  function setRow(index: number, patch: Partial<SettlementPaymentInput>): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function handleDeliver(): Promise<void> {
    if (!summary.ok) {
      setError(summary.message);
      return;
    }
    setError(null);
    try {
      const result = await actions.deliver.mutateAsync(summary.value.payload);
      setReceipt(`تم التسليم — مستند ${result.document.documentNumber} (WIP → 50100، أجور → 40200)`);
    } catch (e) {
      setError(summarizeV3SaleError(e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="تسليم الإصلاح"
    >
      <div className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">تسوية وتسليم {order.orderNumber}</h2>
          <button onClick={() => onClose(false)} aria-label="إغلاق" className="rounded-lg p-1 text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-1 font-mono text-sm" dir="ltr">
          <div className="flex justify-between"><span className="font-sans text-slate-300">قطع الغيار (WIP)</span><span>{order.partsPriceTotal}</span></div>
          <div className="flex justify-between"><span className="font-sans text-slate-300">أجور العمل</span><span>{order.laborPrice}</span></div>
        </div>
        <input
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          placeholder="الخصم"
          inputMode="decimal"
          className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm"
          dir="ltr"
        />
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2" dir="ltr">
            <select
              value={row.method}
              onChange={(e) => setRow(i, { method: e.target.value as UiPaymentMethod })}
              className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-2 text-sm"
            >
              {(Object.keys(METHOD_LABEL) as UiPaymentMethod[]).map((m) => (
                <option key={m} value={m}>{METHOD_LABEL[m]}</option>
              ))}
            </select>
            <input
              value={row.amount}
              onChange={(e) => setRow(i, { amount: e.target.value })}
              inputMode="decimal"
              className="flex-1 rounded-lg border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm"
            />
          </div>
        ))}
        <button
          onClick={() => setRows((prev) => [...prev, { method: 'CASH', amount: '0.00' }])}
          className="self-start rounded-lg border border-navy-border/40 px-3 py-1.5 text-sm text-slate-300"
        >
          + دفعة أخرى
        </button>
        {summary.ok && (
          <div className="flex justify-between font-mono text-sm font-bold" dir="ltr">
            <span className="font-sans font-normal text-slate-300">الإجمالي / المتبقي</span>
            <span>{summary.value.total} / {summary.value.outstanding}</span>
          </div>
        )}
        {!summary.ok && <p className="text-sm text-amber-300">{summary.message}</p>}
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {receipt && <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{receipt}</p>}
        <button
          onClick={() => (receipt ? onClose(true) : void handleDeliver())}
          disabled={actions.deliver.isPending}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white disabled:opacity-50"
        >
          {receipt ? 'إغلاق' : actions.deliver.isPending ? 'جارٍ التسليم…' : 'تأكيد التسليم'}
        </button>
      </div>
    </div>
  );
}
