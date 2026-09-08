import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { Plus, Search, ShieldCheck } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useItemsQuery } from '@/features/inventory/hooks/useInventory';
import { useContactsQuery } from '@/features/contacts/hooks/useContacts';
import {
  listSerials,
  registerSerial,
  createClaim,
  fetchSerialsMetrics,
  type DeviceStatus,
} from '@/features/serials/serialsApi';
import { ImeiLookupModal } from '@/features/serials/ImeiLookupModal';
import { WarrantyClaimModal } from '@/features/serials/WarrantyClaimModal';

const STATUS_TABS: { value: '' | DeviceStatus; label: string }[] = [
  { value: '', label: 'الكل' },
  { value: 'IN_STOCK', label: 'بالمخزن' },
  { value: 'SOLD', label: 'مباع' },
  { value: 'UNDER_REPAIR', label: 'قيد الصيانة' },
  { value: 'WARRANTY_CLAIMED', label: 'مطالبات' },
  { value: 'RETURNED', label: 'مُرجع' },
  { value: 'DEFECTIVE', label: 'معيب' },
];

function to2dp(v: string): string {
  try {
    return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

export function SerialsPage(props: { onRepairTicket: (prefill: { contactId?: string; imei: string }) => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'' | DeviceStatus>('');
  const [search, setSearch] = useState('');
  const [lookupOpen, setLookupOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [claimDeviceId, setClaimDeviceId] = useState<string | null>(null);

  const metricsQ = useQuery({ queryKey: ['serials', 'metrics'], queryFn: fetchSerialsMetrics });
  const listQ = useQuery({
    queryKey: ['serials', 'list', status, search],
    queryFn: () => listSerials({ status: status || undefined, search: search.trim() || undefined }),
  });

  const m = metricsQ.data;
  const cards: { label: string; value: string; tone: string }[] = [
    { label: 'هواتف في المخزن', value: m ? String(m.inStock) : '…', tone: 'text-cyan-300' },
    { label: 'مباع تحت الضمان', value: m ? String(m.underWarranty) : '…', tone: 'text-emerald-300' },
    { label: 'مطالبات نشطة', value: m ? String(m.activeClaims) : '…', tone: 'text-violet-300' },
    { label: 'قيد الصيانة', value: m ? String(m.underRepair) : '…', tone: 'text-amber-300' },
  ];

  return (
    <div dir="rtl" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-extrabold text-slate-100">الأجهزة والـ IMEI</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setLookupOpen(true)} className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20">
            استعلام IMEI [F9]
          </button>
          <button type="button" onClick={() => setRegisterOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-extrabold text-navy-950 hover:bg-cyan-500">
            <Plus className="h-4 w-4" /> تسجيل جهاز
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-navy-border/40 bg-navy-900/60 p-3">
            <p className="text-[11px] text-slate-500">{c.label}</p>
            <p dir="ltr" className={`mt-0.5 font-mono text-base font-extrabold ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value || 'all'}
            type="button"
            onClick={() => setStatus(t.value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${status === t.value ? 'bg-cyan-600 text-white' : 'border border-navy-border/40 text-slate-400 hover:border-cyan-500/40'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="relative ms-auto min-w-52 flex-1">
          <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث: IMEI / زبون / فاتورة…"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-1.5 pe-8 ps-3 text-xs text-slate-100 outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60">
        <div className="scrollbar-premium overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-navy-border/30 text-xs text-slate-400">
                <th className="px-3 py-2 text-right">IMEI</th>
                <th className="px-3 py-2 text-right">الصنف</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">الزبون</th>
                <th className="px-3 py-2 text-right">انتهاء الضمان</th>
                <th className="px-3 py-2 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {(listQ.data?.items ?? []).map((d) => (
                <tr key={d.id} className="border-b border-navy-border/20 last:border-0 hover:bg-white/[0.02]">
                  <td dir="ltr" className="px-3 py-2 font-mono text-xs text-slate-200">{d.imei1}</td>
                  <td className="px-3 py-2 text-xs font-bold text-slate-200">{d.item?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{d.status}</td>
                  <td className="px-3 py-2 text-xs text-slate-300">{d.customerName ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{d.warrantyExpiresAt ? new Date(d.warrantyExpiresAt).toLocaleDateString('ar-DZ') : '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setClaimDeviceId(d.id)}
                      title="مطالبة ضمان"
                      className="rounded-md p-1.5 text-violet-400 hover:bg-violet-500/10"
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(listQ.data?.items ?? []).length === 0 && !listQ.isLoading && (
            <p className="py-6 text-center text-xs text-slate-500">لا أجهزة مطابقة</p>
          )}
        </div>
      </div>

      {lookupOpen && (
        <ImeiLookupModal
          open={lookupOpen}
          onClose={() => setLookupOpen(false)}
          onRepairTicket={(p) => { setLookupOpen(false); props.onRepairTicket(p); }}
          onWarrantyClaim={(id) => { setLookupOpen(false); setClaimDeviceId(id); }}
        />
      )}
      {registerOpen && <RegisterSerialModal onClose={() => { setRegisterOpen(false); qc.invalidateQueries({ queryKey: ['serials'] }); }} />}
      {claimDeviceId && <WarrantyClaimModal deviceId={claimDeviceId} onClose={() => { setClaimDeviceId(null); qc.invalidateQueries({ queryKey: ['serials'] }); }} />}
    </div>
  );
}

function RegisterSerialModal({ onClose }: { onClose: () => void }) {
  const itemsQ = useItemsQuery();
  const contactsQ = useContactsQuery();
  const [imei1, setImei1] = useState('');
  const [imei2, setImei2] = useState('');
  const [itemId, setItemId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [cost, setCost] = useState('');
  const [months, setMonths] = useState('12');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => registerSerial({
      imei1: imei1.trim(),
      imei2: imei2.trim() || undefined,
      itemId,
      supplierContactId: supplierId || undefined,
      purchaseInvoiceRef: invoiceRef.trim() || undefined,
      purchaseCost: cost.trim() !== '' ? to2dp(cost.trim()) : undefined,
      warrantyMonths: Number(months) || 12,
    }),
    onSuccess: () => onClose(),
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذر التسجيل'),
  });

  const inputCls = 'rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4" role="dialog" aria-modal="true" aria-label="تسجيل جهاز">
      <div className="w-full max-w-md space-y-2 rounded-2xl border border-navy-border/40 bg-navy-900 p-4">
        <h3 className="text-sm font-extrabold text-slate-100">تسجيل جهاز جديد</h3>
        <input type="text" dir="ltr" value={imei1} onChange={(e) => setImei1(e.target.value)} placeholder="IMEI 1 (15 رقم)…" className={`${inputCls} w-full font-mono`} />
        <input type="text" dir="ltr" value={imei2} onChange={(e) => setImei2(e.target.value)} placeholder="IMEI 2 (اختياري)…" className={`${inputCls} w-full font-mono`} />
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={`${inputCls} w-full`} aria-label="الصنف">
          <option value="">اختر الصنف…</option>
          {(itemsQ.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${inputCls} w-full`} aria-label="المورّد">
          <option value="">المورّد (اختياري)…</option>
          {(contactsQ.data ?? []).filter((c) => c.role === 'SUPPLIER' || c.role === 'BOTH').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <input type="text" dir="ltr" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="فاتورة الشراء…" className={`${inputCls} font-mono`} />
          <input type="text" dir="ltr" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="التكلفة…" className={`${inputCls} font-mono`} />
          <input type="text" dir="ltr" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="أشهر الضمان" className={`${inputCls} font-mono`} aria-label="أشهر الضمان" />
        </div>
        {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={mut.isPending || !imei1.trim() || !itemId} onClick={() => mut.mutate()} className="flex-1 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-40">
            {mut.isPending ? '…' : 'تسجيل'}
          </button>
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-navy-border/40 px-3 py-2 text-xs text-slate-300">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
