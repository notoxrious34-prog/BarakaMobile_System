import { useState } from 'react';
import { useV3RepairActions, useV3RepairOrder } from '../api/repairV3Hooks';
import { allowedV3Transitions, isV3Terminal } from '../utils/v3RepairFsm';
import { statusLabel } from '../utils/repairLabels';
import { summarizeV3SaleError } from '@/features/pos/utils/buildV3Sale';
import { V3AddRepairPartModal } from './V3AddRepairPartModal';
import { V3DeliverRepairModal } from './V3DeliverRepairModal';

/**
 * DIRECTIVE-022 Stage 10.3 — v3 repair workbench.
 *
 * Order header + FSM-gated action buttons (only legal edges enabled;
 * terminal orders show no actions), consumed-parts list with live WIP
 * total, and financial balance. Part consumption and delivery open
 * their dedicated modals; illegal transitions never reach the server.
 */
export function V3RepairWorkbench({ orderId }: { orderId: string }) {
  const query = useV3RepairOrder(orderId);
  const actions = useV3RepairActions(orderId);
  const [partModal, setPartModal] = useState(false);
  const [deliverModal, setDeliverModal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (query.isLoading) return <div className="p-6 text-slate-400">جارٍ تحميل أمر الإصلاح…</div>;
  if (query.isError || !query.data) {
    return <div className="p-6 text-rose-300">تعذّر تحميل أمر الإصلاح: {summarizeV3SaleError(query.error)}</div>;
  }
  const order = query.data;
  const terminal = isV3Terminal(order.status);
  const edges = allowedV3Transitions(order.status).filter((s) => s !== 'DELIVERED');

  async function advance(to: string): Promise<void> {
    setActionError(null);
    try {
      if (to === 'CANCELLED') {
        await actions.status.mutateAsync({ status: 'CANCELLED', notes: 'إلغاء من منصة العمل' });
      } else if (to === 'DIAGNOSING') {
        await actions.status.mutateAsync({ status: 'DIAGNOSING', diagnosisNotes: 'تشخيص من منصة العمل' });
      } else if (to === 'QUOTED') {
        await actions.status.mutateAsync({ status: 'QUOTED', laborPrice: order.laborPrice, estimatedCost: order.laborPrice });
      } else {
        await actions.status.mutateAsync({ status: to as 'APPROVED' | 'IN_REPAIR' | 'READY' });
      }
    } catch (e) {
      setActionError(summarizeV3SaleError(e));
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-navy-border/40 bg-navy-900/60 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-mono font-bold" dir="ltr">{order.orderNumber}</h2>
        <span className="rounded-full border border-navy-border/40 px-3 py-0.5 text-xs font-bold">{statusLabel(order.status)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 font-mono text-sm" dir="ltr">
        <div className="flex justify-between"><span className="font-sans text-slate-400">WIP قطع</span><span>{order.partsPriceTotal}</span></div>
        <div className="flex justify-between"><span className="font-sans text-slate-400">الأجور</span><span>{order.laborPrice}</span></div>
        <div className="flex justify-between"><span className="font-sans text-slate-400">الإجمالي</span><span>{order.totalAmount}</span></div>
        <div className="flex justify-between"><span className="font-sans text-slate-400">المتبقي</span><span>{order.outstandingAmount}</span></div>
      </div>
      {!terminal && (
        <div className="flex flex-wrap gap-2">
          {edges.map((to) => (
            <button
              key={to}
              onClick={() => void advance(to)}
              disabled={actions.status.isPending}
              className="rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
            >
              تقديم إلى {statusLabel(to)}
            </button>
          ))}
          {(order.status === 'APPROVED' || order.status === 'IN_REPAIR') && (
            <button onClick={() => setPartModal(true)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-bold text-white">
              + قطعة غيار
            </button>
          )}
          {order.status === 'READY' && (
            <button onClick={() => setDeliverModal(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white">
              تسليم وتسوية
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-slate-300">القطع المستهلكة ({order.parts.length})</h3>
        {order.parts.map((p) => (
          <div key={p.id} className="flex justify-between font-mono text-xs text-slate-400" dir="ltr">
            <span>{p.itemId} × {p.quantity}</span>
            <span>{p.totalPrice}</span>
          </div>
        ))}
      </div>
      {actionError && <p className="text-sm text-rose-300">{actionError}</p>}
      {partModal && <V3AddRepairPartModal orderId={order.id} onClose={() => setPartModal(false)} />}
      {deliverModal && <V3DeliverRepairModal order={order} onClose={() => setDeliverModal(false)} />}
    </div>
  );
}
