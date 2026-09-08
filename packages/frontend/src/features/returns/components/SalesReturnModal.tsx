import { useState, useMemo } from 'react';
import { X, Search, RotateCcw, Printer, Loader2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { api } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type TxItem = {
  id: string;
  itemId: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  item?: { id: string; name: string; sku?: string | null };
};

type TxDetail = {
  id: string;
  invoiceNumber?: string | null;
  amount: string;
  itemLines: TxItem[];
  account?: { contactId?: string };
};

type ReturnLine = {
  transactionItemId: string;
  inventoryItemId: string;
  name: string;
  unitPrice: string;
  maxQty: number;
  quantity: number;
  condition: 'RESTOCKED_INVENTORY' | 'DEFECTIVE_QUARANTINE';
  serialNumber?: string;
};

const CONDITION_LABEL: Record<string, string> = {
  RESTOCKED_INVENTORY: 'إعادة للمخزون',
  DEFECTIVE_QUARANTINE: 'تالف / حجر',
};

const REFUND_LABEL: Record<string, string> = {
  CASH: 'نقداً (صندوق)',
  CUSTOMER_CREDIT_REDUCTION: 'خصم من دين الزبون',
  STORE_CREDIT: 'رصيد متجر',
};

function to2dp(v: string | number): string {
  try { return new Decimal(String(v)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2); } catch { return '0.00'; }
}

export function SalesReturnModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [invoiceInput, setInvoiceInput] = useState('');
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CUSTOMER_CREDIT_REDUCTION' | 'STORE_CREDIT'>('CASH');
  const [reason, setReason] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [createdReturn, setCreatedReturn] = useState<any | null>(null);

  const refundTotal = useMemo(() => {
    let sum = new Decimal(0);
    for (const l of lines) {
      if (l.quantity > 0) sum = sum.plus(new Decimal(l.unitPrice).times(l.quantity));
    }
    return sum.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }, [lines]);

  async function handleLookup() {
    const q = invoiceInput.trim();
    if (!q) return;
    setLookupLoading(true);
    setLookupError(null);
    setCreatedReturn(null);
    try {
      // Try by invoice number via sales/returns/by-invoice/:invoiceNumber, else by id
      let data: TxDetail;
      try {
        data = await api.get<TxDetail>(`/sales/returns/by-invoice/${encodeURIComponent(q)}`);
      } catch {
        // fallback: direct transaction lookup
        data = await api.get<TxDetail>(`/transactions/${encodeURIComponent(q)}`);
      }
      // If response is actually a Transaction without itemLines alias, normalize
      const itemLines = (data as any).itemLines ?? (data as any).items ?? [];
      if (!itemLines || itemLines.length === 0) {
        setLookupError('الفاتورة بدون أصناف — لا يمكن الإرجاع');
        setTx(null);
        return;
      }
      setTx({ ...data, itemLines });
      setLines(
        itemLines.map((it: TxItem) => ({
          transactionItemId: it.id,
          inventoryItemId: it.itemId,
          name: it.item?.name ?? it.itemId.slice(0, 8),
          unitPrice: to2dp(it.unitPrice),
          maxQty: it.quantity,
          quantity: 0,
          condition: 'RESTOCKED_INVENTORY' as const,
          serialNumber: '',
        })),
      );
      setReason('');
    } catch (e: any) {
      setLookupError(e instanceof Error ? e.message : 'تعذر جلب الفاتورة — تأكد من رقم الفاتورة/الباركود');
      setTx(null);
    } finally {
      setLookupLoading(false);
    }
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((l) => l.quantity > 0)
        .map((l) => ({
          transactionItemId: l.transactionItemId,
          quantity: l.quantity,
          condition: l.condition,
          serialNumber: l.serialNumber?.trim() ? l.serialNumber.trim() : undefined,
        }));
      if (items.length === 0) throw new Error('اختر كمية للإرجاع');
      if (!reason.trim()) throw new Error('سبب الإرجاع مطلوب');
      if (!tx) throw new Error('لا توجد فاتورة محملة');
      const body: any = {
        originalTransactionId: tx.id,
        refundMethod,
        reason: reason.trim(),
        items,
      };
      // customerId optional — backend infers from account if omitted
      return api.post<any>('/sales/returns', body);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      setCreatedReturn(data);
    },
  });

  function handlePrint() {
    window.print();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-950/70 p-4 backdrop-blur-sm" dir="rtl">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900 shadow-2xl">
        {/* Header — deep navy */}
        <div className="flex items-center justify-between border-b border-navy-border/30 bg-navy-950 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-500/15 p-1.5">
              <RotateCcw className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-100">إرجاع مبيعات / RMA</h2>
              <p className="text-[11px] text-slate-500">بحث بالفاتورة أو الباركود — تحديد الكميات وحالة الاسترجاع</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-800 hover:text-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {/* Lookup */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={invoiceInput}
                onChange={(e) => setInvoiceInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
                placeholder="رقم الفاتورة / الباركود (مثال INV-000001 أو معرف العملية)"
                className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-2.5 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50"
              />
            </div>
            <button
              onClick={handleLookup}
              disabled={lookupLoading || !invoiceInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              بحث
            </button>
          </div>
          {lookupError && <p className="mt-2 text-xs font-bold text-rose-400">{lookupError}</p>}
          {tx && (
            <p className="mt-2 text-[11px] text-slate-500">
              الفاتورة: <span className="font-mono text-slate-300">{(tx as any).invoiceNumber ?? tx.id.slice(0, 8)}</span> — الإجمالي {to2dp(tx.amount)} د.ج — الحالة {(tx as any).returnStatus ?? 'NONE'}
            </p>
          )}

          {/* Items table */}
          {tx && lines.length > 0 && !createdReturn && (
            <div className="mt-4 overflow-hidden rounded-xl border border-navy-border/30">
              <div className="max-h-[42vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-navy-950 text-[11px] text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-right font-bold">الصنف</th>
                      <th className="px-2 py-2 text-center font-bold">سعر الوحدة</th>
                      <th className="px-2 py-2 text-center font-bold">الكمية الأصلية</th>
                      <th className="px-2 py-2 text-center font-bold">كمية الإرجاع</th>
                      <th className="px-2 py-2 text-center font-bold">الحالة</th>
                      <th className="px-2 py-2 text-center font-bold">سيريال</th>
                      <th className="px-2 py-2 text-center font-bold">المجموع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-border/20">
                    {lines.map((l, idx) => {
                      const lineSubtotal = new Decimal(l.unitPrice).times(l.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
                      return (
                        <tr key={l.transactionItemId} className="bg-navy-900/40">
                          <td className="px-3 py-2 text-right font-medium text-slate-100">{l.name}</td>
                          <td className="px-2 py-2 text-center font-mono text-slate-300" dir="ltr">{l.unitPrice}</td>
                          <td className="px-2 py-2 text-center font-mono text-slate-400">{l.maxQty}</td>
                          <td className="px-2 py-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={l.maxQty}
                              value={l.quantity}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(l.maxQty, parseInt(e.target.value || '0', 10) || 0));
                                setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: v } : x)));
                              }}
                              className="w-16 rounded-lg border border-navy-border/40 bg-navy-950 px-2 py-1 text-center font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                            />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <select
                              value={l.condition}
                              onChange={(e) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, condition: e.target.value as any } : x)))}
                              className="rounded-lg border border-navy-border/40 bg-navy-950 px-2 py-1 text-xs text-slate-100 outline-none"
                            >
                              <option value="RESTOCKED_INVENTORY">{CONDITION_LABEL.RESTOCKED_INVENTORY}</option>
                              <option value="DEFECTIVE_QUARANTINE">{CONDITION_LABEL.DEFECTIVE_QUARANTINE}</option>
                            </select>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <input
                              value={l.serialNumber}
                              onChange={(e) => setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, serialNumber: e.target.value } : x)))}
                              placeholder="اختياري"
                              className="w-20 rounded-lg border border-navy-border/40 bg-navy-950 px-2 py-1 text-center text-xs text-slate-100 outline-none"
                            />
                          </td>
                          <td className="px-2 py-2 text-center font-mono text-emerald-300" dir="ltr">{lineSubtotal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Refund summary */}
          {tx && !createdReturn && (
            <div className="mt-4 grid gap-3 rounded-xl border border-navy-border/30 bg-navy-950/60 p-4">
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-400">طريقة الاسترداد</span>
                  <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as any)} className="rounded-xl border border-navy-border/40 bg-navy-900 px-3 py-2 text-sm text-slate-100 outline-none">
                    <option value="CASH">{REFUND_LABEL.CASH}</option>
                    <option value="CUSTOMER_CREDIT_REDUCTION">{REFUND_LABEL.CUSTOMER_CREDIT_REDUCTION}</option>
                    <option value="STORE_CREDIT">{REFUND_LABEL.STORE_CREDIT}</option>
                  </select>
                </label>
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-400">إجمالي الاسترداد (Decimal)</span>
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono text-base font-bold text-emerald-300" dir="ltr">{refundTotal} د.ج</div>
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-400">سبب الإرجاع</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="مثال: عيب مصنعي / خطأ في الطلب" className="rounded-xl border border-navy-border/40 bg-navy-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500/50" />
              </label>
              {refundMethod === 'CASH' && <p className="text-[11px] text-amber-300/80">تنبيه: سيتم تسجيل حركة صندوق OUT/REFUND. لا يوجد جدول PosShift — الحركة عبر CashMovement فقط.</p>}
              {refundMethod === 'CUSTOMER_CREDIT_REDUCTION' && <p className="text-[11px] text-cyan-300/80">سيتم خصم المبلغ من حساب الزبون وتسجيل قيد RETURN_CREDIT في دفتر الديون.</p>}
              {refundMethod === 'STORE_CREDIT' && <p className="text-[11px] text-slate-400">رصيد متجر — بدون حركة نقدية فورية، محفوظ في سجل الإرجاع.</p>}
            </div>
          )}

          {/* Success + thermal receipt */}
          {createdReturn && (
            <div className="mt-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center">
                <p className="text-sm font-extrabold text-emerald-300">تم إنشاء الإرجاع بنجاح</p>
                <p className="mt-1 font-mono text-xs text-slate-300" dir="ltr">{createdReturn.returnNumber} — {to2dp(createdReturn.refundAmount)} د.ج</p>
              </div>
              <div id="sales-return-receipt" className="mt-4 rounded-xl border border-dashed border-navy-border/40 bg-white p-4 font-mono text-[11px] leading-relaxed text-black">
                <div className="text-center font-bold">BarakaMobile — إيصال إرجاع</div>
                <div className="mt-1 text-center text-[10px]">RET #{createdReturn.returnNumber}</div>
                <div className="mt-2 border-t border-dashed border-black/20 pt-2">
                  <div>الفاتورة الأصلية: {(createdReturn.originalTransaction?.invoiceNumber ?? createdReturn.originalTransactionId ?? '').toString().slice(0, 16)}</div>
                  <div>التاريخ: {new Date(createdReturn.createdAt).toLocaleString('ar-DZ')}</div>
                  <div>طريقة الاسترداد: {REFUND_LABEL[createdReturn.refundMethod] ?? createdReturn.refundMethod}</div>
                  <div>السبب: {createdReturn.reason}</div>
                </div>
                <table className="mt-2 w-full border-collapse text-[10px]">
                  <thead><tr className="border-b border-black/20"><th className="py-1 text-right">الصنف</th><th className="py-1 text-center">الكمية</th><th className="py-1 text-center">السعر</th><th className="py-1 text-left">المجموع</th></tr></thead>
                  <tbody>
                    {(createdReturn.items ?? []).map((it: any) => (
                      <tr key={it.id} className="border-b border-black/10">
                        <td className="py-1 text-right">{it.inventoryItem?.name ?? it.inventoryItemId.slice(0, 8)} <span className="text-[9px] text-black/60">({it.condition === 'RESTOCKED_INVENTORY' ? 'مخزون' : 'حجر'})</span></td>
                        <td className="py-1 text-center">{it.quantity}</td>
                        <td className="py-1 text-center" dir="ltr">{to2dp(it.unitPrice)}</td>
                        <td className="py-1 text-left" dir="ltr">{to2dp(it.refundSubtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex justify-between border-t border-black/20 pt-2 font-bold">
                  <span>الإجمالي</span><span dir="ltr">{to2dp(createdReturn.refundAmount)} د.ج</span>
                </div>
                <div className="mt-2 text-center text-[9px] text-black/60">شكراً لزيارتكم — BarakaMobile</div>
              </div>
              <div className="mt-3 flex justify-center gap-2 print:hidden">
                <button onClick={handlePrint} className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2 text-xs font-bold text-white hover:bg-navy-700">
                  <Printer className="h-4 w-4" /> طباعة الإيصال
                </button>
              </div>
              <style>{`@media print { body * { visibility: hidden; } #sales-return-receipt, #sales-return-receipt * { visibility: visible; } #sales-return-receipt { position: absolute; left: 0; top: 0; width: 72mm; padding: 2mm; background: white; color: black; } }`}</style>
            </div>
          )}

          {createMutation.isError && <p className="mt-3 text-xs font-bold text-rose-400">{(createMutation.error as Error)?.message ?? 'خطأ في الإنشاء'}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-navy-border/30 bg-navy-950 px-5 py-3">
          <button onClick={onClose} className="rounded-xl border border-navy-border/40 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-navy-800">إغلاق</button>
          {!createdReturn && tx && (
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || lines.every((l) => l.quantity === 0) || !reason.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-extrabold text-navy-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              تأكيد الإرجاع — {refundTotal} د.ج
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
