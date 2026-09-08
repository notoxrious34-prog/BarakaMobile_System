import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useItemsQuery } from '@/features/inventory/hooks/useInventory';
import {
  useAddPartMutation,
  useRemovePartMutation,
  useUpdateFinancialsMutation,
  type RepairTicket,
} from '../hooks/useRepairs';
import { to2dp } from '@/features/pos/hooks/usePosTicket';

function D2(v: string | undefined | null): string {
  try {
    return new Decimal(v ?? '0.00').toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

type Props = {
  ticket: RepairTicket;
  onChanged: () => void;
};

export function RepairPartsSection({ ticket, onChanged }: Props) {
  const itemsQ = useItemsQuery();
  const addMut = useAddPartMutation(ticket.id);
  const removeMut = useRemovePartMutation(ticket.id);
  const finMut = useUpdateFinancialsMutation(ticket.id);

  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const [labor, setLabor] = useState(ticket.laborCost ?? '0.00');
  const [discount, setDiscount] = useState(ticket.discountAmount ?? '0.00');
  const [error, setError] = useState<string | null>(null);

  const editable = ticket.status !== 'DELIVERED' && ticket.status !== 'CANCELLED';
  const parts = ticket.parts ?? [];

  const selected = useMemo(() => (itemsQ.data ?? []).find((i) => i.id === itemId), [itemsQ.data, itemId]);
  const maxQty = selected?.currentStock ?? 0;

  const totals = useMemo(() => {
    try {
      const partsCost = parts.reduce((a, p) => a.plus(new Decimal(p.totalCost)), new Decimal(0));
      const partsTotal = parts.reduce((a, p) => a.plus(new Decimal(p.totalPrice)), new Decimal(0));
      const laborD = new Decimal(ticket.laborCost ?? '0.00');
      const discountD = new Decimal(ticket.discountAmount ?? '0.00');
      const total = partsTotal.plus(laborD).minus(discountD);
      const paid = new Decimal(ticket.depositAmount ?? '0.00').plus(new Decimal(ticket.paidAmount ?? '0.00'));
      const remaining = total.minus(paid);
      const profit = total.minus(partsCost);
      const f = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
      return { partsCost: f(partsCost), partsTotal: f(partsTotal), total: f(total), paid: f(paid), remaining: f(remaining.gt(0) ? remaining : new Decimal(0)), profit: f(profit) };
    } catch {
      return null;
    }
  }, [parts, ticket.laborCost, ticket.discountAmount, ticket.depositAmount, ticket.paidAmount]);

  async function add(): Promise<void> {
    setError(null);
    if (!itemId) { setError('اختر قطعة الغيار'); return; }
    if (!Number.isInteger(qty) || qty < 1) { setError('الكمية يجب أن تكون ≥ 1'); return; }
    if (qty > maxQty) { setError(`الكمية تتجاوز المتاح (${maxQty})`); return; }
    try {
      await addMut.mutateAsync({
        inventoryItemId: itemId,
        quantity: qty,
        unitPrice: price.trim() !== '' ? to2dp(price.trim()) : undefined,
      });
      setItemId(''); setQty(1); setPrice('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشلت الإضافة');
    }
  }

  async function saveFinancials(): Promise<void> {
    setError(null);
    try {
      await finMut.mutateAsync({
        laborCost: labor.trim() !== '' ? to2dp(labor.trim()) : undefined,
        discountAmount: discount.trim() !== '' ? to2dp(discount.trim()) : undefined,
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل الحفظ');
    }
  }

  const inputCls = 'rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50';

  return (
    <div className="space-y-2 rounded-xl border border-navy-border/30 bg-navy-950/60 p-3">
      <h4 className="text-xs font-extrabold text-slate-100">قطع الغيار المستهلكة</h4>

      {parts.length === 0 ? (
        <p className="py-1 text-center text-xs text-slate-500">لم تُستهلك أي قطعة بعد</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-navy-border/30 text-slate-500">
              <th className="py-1 text-right font-bold">القطعة</th>
              <th className="py-1 text-right font-bold">كمية</th>
              <th className="py-1 text-right font-bold">سعر الزبون</th>
              <th className="py-1 text-left font-bold">الإجمالي</th>
              {editable && <th className="py-1" />}
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id} className="border-b border-navy-border/20 last:border-0">
                <td className="py-1.5 font-bold text-slate-200">{p.inventoryItem?.name ?? p.inventoryItemId.slice(0, 8)}</td>
                <td dir="ltr" className="py-1.5 font-mono text-slate-300">×{p.quantity}</td>
                <td dir="ltr" className="py-1.5 font-mono text-slate-300">{D2(p.unitPrice)}</td>
                <td dir="ltr" className="py-1.5 text-left font-mono font-bold text-slate-100">{D2(p.totalPrice)}</td>
                {editable && (
                  <td className="py-1.5 text-center">
                    <button
                      type="button"
                      disabled={removeMut.isPending}
                      onClick={() => { if (window.confirm('إرجاع القطعة للمخزون وحذف البند؟')) removeMut.mutateAsync(p.id).then(onChanged).catch((e: unknown) => setError(e instanceof Error ? e.message : 'فشل الحذف')); }}
                      className="rounded-md p-1 text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
                      aria-label="إرجاع القطعة"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editable && (
        <div className="space-y-1.5 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-2">
          <select value={itemId} onChange={(e) => {
            const id = e.target.value;
            setItemId(id);
            const it = (itemsQ.data ?? []).find((i) => i.id === id);
            setPrice(it ? D2(it.sellingPrice) : '');
            setQty(1);
          }} aria-label="قطعة الغيار" className={`${inputCls} w-full`}>
            <option value="">اختر قطعة من المخزون…</option>
            {(itemsQ.data ?? []).map((i) => (
              <option key={i.id} value={i.id} disabled={(i.currentStock ?? 0) <= 0}>
                {i.name} — متاح {(i.currentStock ?? 0)}{(i.currentStock ?? 0) <= 0 ? ' (نفذ)' : ''}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5" dir="ltr">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="rounded-md border border-navy-border/40 p-1 text-slate-300" aria-label="إنقاص"><Minus className="h-3 w-3" /></button>
              <input type="text" inputMode="numeric" value={String(qty)} onChange={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 1) setQty(Math.min(v, Math.max(maxQty, 1))); }} className={`${inputCls} w-12 text-center font-mono`} aria-label="الكمية" />
              <button type="button" onClick={() => setQty((q) => Math.min(q + 1, Math.max(maxQty, 1)))} className="rounded-md border border-navy-border/40 p-1 text-slate-300" aria-label="زيادة"><Plus className="h-3 w-3" /></button>
            </div>
            <input type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="سعر الزبون" aria-label="سعر الزبون" className={`${inputCls} w-24 font-mono`} />
            <button type="button" onClick={() => void add()} disabled={addMut.isPending || !itemId} className="flex-1 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-40">
              {addMut.isPending ? '…' : 'استهلاك +'}
            </button>
          </div>
          {selected && <p className="text-[11px] text-slate-500">التكلفة: <span dir="ltr" className="font-mono">{D2(selected.costPrice)}</span> د.ج · المتاح: <span dir="ltr" className="font-mono">{maxQty}</span></p>}
        </div>
      )}

      <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 p-2 text-xs">
        <div className="flex justify-between py-0.5"><span className="text-slate-500">تكلفة قطع الغيار</span><span dir="ltr" className="font-mono text-slate-200">{totals?.partsCost ?? '—'} د.ج</span></div>
        <div className="flex justify-between py-0.5"><span className="text-slate-500">سعر القطع للزبون</span><span dir="ltr" className="font-mono text-slate-200">{totals?.partsTotal ?? '—'} د.ج</span></div>
        <div className="flex items-center justify-between gap-2 py-0.5">
          <span className="text-slate-500">أتعاب اليد العاملة</span>
          {editable ? (
            <input type="text" inputMode="decimal" value={labor} onChange={(e) => setLabor(e.target.value)} dir="ltr" aria-label="أتعاب اليد العاملة" className={`${inputCls} w-24 py-1 font-mono`} />
          ) : (
            <span dir="ltr" className="font-mono text-slate-200">{D2(ticket.laborCost)} د.ج</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 py-0.5">
          <span className="text-slate-500">الخصم</span>
          {editable ? (
            <input type="text" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} dir="ltr" aria-label="الخصم" className={`${inputCls} w-24 py-1 font-mono`} />
          ) : (
            <span dir="ltr" className="font-mono text-slate-200">{D2(ticket.discountAmount)} د.ج</span>
          )}
        </div>
        {editable && (
          <button type="button" onClick={() => void saveFinancials()} disabled={finMut.isPending} className="mt-1 w-full rounded-lg border border-navy-border/40 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-cyan-500/40 disabled:opacity-40">
            {finMut.isPending ? 'جاري الحفظ…' : 'حفظ الأتعاب والخصم'}
          </button>
        )}
        <div className="mt-1 flex justify-between border-t border-navy-border/30 py-1"><span className="font-bold text-slate-200">الإجمالي المستحق</span><span dir="ltr" className="font-mono font-extrabold text-amber-400">{totals?.total ?? '—'} د.ج</span></div>
        <div className="flex justify-between py-0.5"><span className="text-slate-500">المدفوع (عربون + تحصيل)</span><span dir="ltr" className="font-mono text-emerald-400">{totals?.paid ?? '—'} د.ج</span></div>
        <div className="flex justify-between py-0.5"><span className="text-slate-500">المتبقي</span><span dir="ltr" className="font-mono font-bold text-rose-400">{totals?.remaining ?? '—'} د.ج</span></div>
        <div className="flex justify-between py-0.5"><span className="font-bold text-slate-200">صافي ربح التذكرة</span><span dir="ltr" className="font-mono font-extrabold text-cyan-300">{totals?.profit ?? '—'} د.ج</span></div>
      </div>

      {error && <p className="text-xs font-bold text-rose-400" role="alert">{error}</p>}
    </div>
  );
}
