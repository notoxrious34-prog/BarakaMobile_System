import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { CheckCircle2, Printer, X } from 'lucide-react';
import {
  useRepairOneQuery,
  useUpdateStatusMutation,
  useRecordExternalCostMutation,
} from '../hooks/useRepairs';
import { useContactsQuery } from '@/features/contacts/hooks/useContacts';
import { RepairTicketSlip } from './RepairTicketSlip';
import { RepairDeliverySlip } from './RepairDeliverySlip';
import { RepairPartsSection } from './RepairPartsSection';
import {
  STEPPER_STAGES,
  statusBox,
  statusLabel,
  deviceLabel,
  repairTypeLabel,
} from '../utils/repairLabels';
import { to2dp } from '@/features/pos/hooks/usePosTicket';

type Props = {
  ticketId: string;
  onClose: () => void;
};

function D2(d: Decimal): string {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * TB-072 Golden Standard ticket detail — lifecycle stepper, guarded advance
 * (DELIVERED needs actualCost; CANCELLED warns deposit refund), external-cost
 * tab for EXTERNAL tickets, integrated claim-slip printing.
 */
export function RepairDetailModal({ ticketId, onClose }: Props) {
  const { data: ticket, isLoading, isError, refetch } = useRepairOneQuery(ticketId);
  const updateMut = useUpdateStatusMutation();
  const externalMut = useRecordExternalCostMutation();
  const contactsQ = useContactsQuery();

  const [tab, setTab] = useState<'advance' | 'parts' | 'external'>('advance');
  const [actualCost, setActualCost] = useState('');
  const [notes, setNotes] = useState('');
  const [externalCost, setExternalCost] = useState('');
  const [externalNote, setExternalNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [cancelArm, setCancelArm] = useState(false);

  const phone = useMemo(
    () =>
      (contactsQ.data ?? []).find((c) => c.id === ticket?.contactId)?.phone ?? null,
    [contactsQ.data, ticket?.contactId],
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4" dir="rtl">
        <p className="text-sm text-slate-400">جاري تحميل التذكرة…</p>
      </div>
    );
  }
  if (isError || !ticket) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4" dir="rtl" role="dialog" aria-modal="true" aria-label="خطأ">
        <div className="w-full max-w-sm rounded-2xl border border-navy-border/40 bg-navy-900 p-4 text-center">
          <p className="text-sm text-rose-300">تعذر تحميل التذكرة</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void refetch()} className="flex-1 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500">إعادة المحاولة</button>
            <button type="button" onClick={onClose} className="rounded-xl border border-navy-border/40 px-4 py-2 text-sm text-slate-300">إغلاق</button>
          </div>
        </div>
      </div>
    );
  }

  const isTerminal = ticket.status === 'DELIVERED' || ticket.status === 'CANCELLED';
  const stageIdx = STEPPER_STAGES.indexOf(ticket.status as (typeof STEPPER_STAGES)[number]);
  const nextStage = stageIdx >= 0 && stageIdx < STEPPER_STAGES.length - 1 ? STEPPER_STAGES[stageIdx + 1] : null;

  let remainder: string | null = null;
  let computedTotal: string | null = null;
  try {
    const partsTotal = new Decimal(ticket.partsTotal ?? '0.00');
    const labor = new Decimal(ticket.laborCost ?? '0.00');
    const discount = new Decimal(ticket.discountAmount ?? '0.00');
    computedTotal = D2(partsTotal.plus(labor).minus(discount));
    if (actualCost.trim() !== '') {
      const rem = new Decimal(actualCost.trim()).minus(new Decimal(ticket.depositAmount ?? '0.00'));
      remainder = D2(rem.greaterThan(new Decimal(0)) ? rem : new Decimal(0));
    } else if (computedTotal !== '0.00') {
      const paid = new Decimal(ticket.depositAmount ?? '0.00').plus(new Decimal(ticket.paidAmount ?? '0.00'));
      const rem = new Decimal(computedTotal).minus(paid);
      remainder = D2(rem.greaterThan(new Decimal(0)) ? rem : new Decimal(0));
    }
  } catch {
    remainder = null;
  }
  const needsLegacyCost = computedTotal === '0.00';

  async function advance(to: string): Promise<void> {
    setError(null);
    try {
      if (to === 'DELIVERED') {
        if (needsLegacyCost && actualCost.trim() === '') {
          setError('التكلفة الفعلية مطلوبة عند التسليم');
          return;
        }
        await updateMut.mutateAsync({
          id: ticketId,
          status: to,
          ...(needsLegacyCost ? { actualCost: to2dp(actualCost.trim()) } : {}),
          notes: notes.trim() || undefined,
        });
        setDeliveryOpen(true);
      } else {
        await updateMut.mutateAsync({ id: ticketId, status: to, notes: notes.trim() || undefined });
      }
      setActualCost('');
      setNotes('');
      setCancelArm(false);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشلت العملية');
    }
  }

  async function recordExternal(): Promise<void> {
    setError(null);
    try {
      await externalMut.mutateAsync({
        id: ticketId,
        externalCost: to2dp(externalCost.trim()),
        note: externalNote.trim() || undefined,
      });
      setExternalCost('');
      setExternalNote('');
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشلت العملية');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="تفاصيل التذكرة"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex shrink-0 items-center justify-between border-b border-navy-border/30 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 dir="ltr" className="truncate font-mono text-sm font-bold text-slate-100">{ticket.ticketNumber}</h3>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusBox(ticket.status)}`}>
              {statusLabel(ticket.status)}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="scrollbar-premium min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {/* Stepper */}
          <div className="flex items-center gap-1" aria-label="مراحل التذكرة">
            {STEPPER_STAGES.map((s, i) => {
              const done = stageIdx >= 0 && i <= stageIdx;
              const cur = s === ticket.status;
              return (
                <div key={s} className="flex flex-1 items-center gap-1 last:flex-none">
                  <div className="flex flex-1 flex-col items-center gap-1">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${done ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-navy-border/40 text-slate-500'}`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <span dir="ltr">{i + 1}</span>}
                    </span>
                    <span className={`text-[9px] font-bold ${cur ? 'text-slate-100' : 'text-slate-500'}`}>{statusLabel(s)}</span>
                  </div>
                  {i < STEPPER_STAGES.length - 1 && <span className={`mb-5 h-px flex-1 ${i < stageIdx ? 'bg-emerald-500/50' : 'bg-navy-border/40'}`} />}
                </div>
              );
            })}
          </div>

          {/* Facts */}
          <div className="rounded-xl border border-navy-border/30 bg-navy-950/60 p-3 text-xs">
            <div className="flex justify-between py-0.5"><span className="text-slate-500">العميل</span><span className="font-bold text-slate-100">{ticket.contact?.name ?? '—'}{phone ? <span dir="ltr" className="font-mono text-slate-400"> · {phone}</span> : null}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-slate-500">الجهاز</span><span className="text-slate-100">{deviceLabel(ticket.deviceType)} — {ticket.deviceBrand} {ticket.deviceModel}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-slate-500">العطل</span><span className="max-w-[60%] text-left text-slate-100">{ticket.problemDescription}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-slate-500">النوع</span><span className="text-slate-100">{repairTypeLabel(ticket.repairType)}</span></div>
            {ticket.technicianName && <div className="flex justify-between py-0.5"><span className="text-slate-500">الفني</span><span className="text-slate-100">{ticket.technicianName}</span></div>}
            <div className="flex justify-between py-0.5"><span className="text-slate-500">التقديرية / العربون</span><span dir="ltr" className="font-mono text-slate-100">{ticket.estimatedCost} / {ticket.depositAmount} د.ج</span></div>
            {ticket.actualCost !== '0.00' && <div className="flex justify-between py-0.5"><span className="text-slate-500">الفعلية</span><span dir="ltr" className="font-mono font-bold text-amber-400">{ticket.actualCost} د.ج</span></div>}
            {ticket.externalCost !== '0.00' && <div className="flex justify-between py-0.5"><span className="text-slate-500">تكلفة خارجية</span><span dir="ltr" className="font-mono text-slate-100">{ticket.externalCost} د.ج</span></div>}
          </div>

          {/* Tabs */}
          <div className="flex overflow-hidden rounded-xl border border-navy-border/40 text-xs font-bold">
            <button type="button" onClick={() => setTab('advance')} className={`flex-1 px-3 py-2 ${tab === 'advance' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'}`}>تقديم الحالة</button>
            <button type="button" onClick={() => setTab('parts')} className={`flex-1 px-3 py-2 ${tab === 'parts' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'}`}>قطع الغيار والمالية</button>
            {ticket.repairType === 'EXTERNAL' && (
              <button type="button" onClick={() => setTab('external')} className={`flex-1 px-3 py-2 ${tab === 'external' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'}`}>تكلفة خارجية</button>
            )}
          </div>

          {tab === 'parts' && (
            <RepairPartsSection ticket={ticket} onChanged={() => void refetch()} />
          )}

          {tab === 'advance' && !isTerminal && (
            <div className="space-y-2">
              {nextStage === 'DELIVERED' ? (
                <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                  <p className="text-xs font-bold text-amber-300">
                    التسوية بالإجمالي المحسوب: <span dir="ltr" className="font-mono">{computedTotal} د.ج</span> (قطع + يد عاملة − خصم)
                  </p>
                  {needsLegacyCost ? (
                    <>
                      <p className="text-xs text-slate-400">لا توجد قطع/أتعاب — التسليم يتطلب التكلفة الفعلية</p>
                      <input type="text" inputMode="decimal" value={actualCost} onChange={(e) => setActualCost(e.target.value)} placeholder="التكلفة الفعلية (د.ج)" aria-label="التكلفة الفعلية" className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50" dir="ltr" />
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">التحصيل تلقائي بالفرق المتبقي — يُسجَّل في الصندوق كتحصيل صيانة.</p>
                  )}
                  {remainder !== null && (
                    <p className="text-xs text-slate-300">المتبقي للتحصيل عند التسليم: <span dir="ltr" className="font-mono font-bold text-emerald-400">{remainder} د.ج</span> <span className="text-slate-500">(الإجمالي − العربون − المدفوع)</span></p>
                  )}
                  <button type="button" onClick={() => void advance('DELIVERED')} disabled={updateMut.isPending} className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-emerald-500 disabled:opacity-50">تسليم الجهاز وتحصيل المتبقي</button>
                </div>
              ) : nextStage ? (
                <button type="button" onClick={() => void advance(nextStage)} disabled={updateMut.isPending} className="w-full rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50">
                  تقديم إلى: {statusLabel(nextStage)}
                </button>
              ) : null}
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50" />
              {!cancelArm ? (
                <button type="button" onClick={() => setCancelArm(true)} className="w-full rounded-xl border border-rose-500/30 px-4 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10">إلغاء التذكرة</button>
              ) : (
                <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                  <p className="text-xs font-bold text-rose-300">سيتم إرجاع {(ticket.parts ?? []).length} قطعة مستهلكة للمخزون تلقائياً + رد العربون ({ticket.depositAmount} د.ج) من الصندوق. تأكيد الإلغاء؟</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void advance('CANCELLED')} disabled={updateMut.isPending} className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-rose-500 disabled:opacity-50">تأكيد الإلغاء</button>
                    <button type="button" onClick={() => setCancelArm(false)} className="rounded-xl border border-navy-border/40 px-4 py-2 text-sm text-slate-300">تراجع</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'external' && ticket.repairType === 'EXTERNAL' && !isTerminal && (
            <div className="space-y-2">
              <input type="text" inputMode="decimal" value={externalCost} onChange={(e) => setExternalCost(e.target.value)} placeholder="التكلفة الخارجية (د.ج)" aria-label="التكلفة الخارجية" className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50" dir="ltr" />
              <input type="text" value={externalNote} onChange={(e) => setExternalNote(e.target.value)} placeholder="بيان (اختياري)" aria-label="بيان التكلفة" className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50" />
              <button type="button" onClick={() => void recordExternal()} disabled={externalMut.isPending} className="w-full rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50">تسجيل التكلفة</button>
            </div>
          )}

          {error && <p className="text-xs font-bold text-rose-400" role="alert">{error}</p>}

          <button
            type="button"
            onClick={() => setSlipOpen(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/20"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة تذكرة الاستلام
          </button>
          {ticket.status === 'DELIVERED' && (
            <button
              type="button"
              onClick={() => setDeliveryOpen(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              طباعة فاتورة التسليم والضمان
            </button>
          )}
        </div>
      </div>
      {slipOpen && <RepairTicketSlip ticket={ticket} customerPhone={phone} onClose={() => setSlipOpen(false)} />}
      {deliveryOpen && <RepairDeliverySlip ticket={ticket} customerPhone={phone} onClose={() => setDeliveryOpen(false)} />}
    </div>
  );
}
