import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScanLine, Printer, Wrench, ShieldCheck, Phone } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { BarcodeSvg } from '@/features/inventory/components/barcode/BarcodeSvg';
import { lookupImei, type LookupResult } from './serialsApi';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  IN_STOCK: { label: 'متاح بالمخزن', cls: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' },
  SOLD: { label: 'مباع', cls: 'border-slate-500/40 bg-slate-500/10 text-slate-300' },
  UNDER_REPAIR: { label: 'قيد الصيانة', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  WARRANTY_CLAIMED: { label: 'مطالبة ضمان', cls: 'border-violet-500/40 bg-violet-500/10 text-violet-300' },
  RETURNED: { label: 'مُرجع', cls: 'border-slate-500/40 bg-slate-500/10 text-slate-400' },
  DEFECTIVE: { label: 'معيب', cls: 'border-rose-500/40 bg-rose-500/10 text-rose-300' },
};

const EVENT_LABEL: Record<string, string> = {
  PURCHASE_RECEIPT: 'استلام شراء',
  SALE_DELIVERY: 'تسليم بيع',
  REPAIR_INTAKE: 'دخول صيانة',
  REPAIR_DELIVERY: 'تسليم صيانة',
  WARRANTY_CLAIM: 'مطالبة ضمان',
  RETURN_RESTOCK: 'إرجاع للمخزن',
  STATUS_CHANGE: 'تغيير حالة',
};

type Props = {
  open: boolean;
  onClose: () => void;
  initialCode?: string;
  onRepairTicket: (prefill: { contactId?: string; imei: string }) => void;
  onWarrantyClaim: (deviceId: string) => void;
};

export function ImeiLookupModal({ open, onClose, initialCode, onRepairTicket, onWarrantyClaim }: Props) {
  const [code, setCode] = useState(initialCode ?? '');
  const [submitted, setSubmitted] = useState<string | null>(initialCode?.trim() ? initialCode.trim() : null);
  const { data: settings } = useInvoiceSettings();

  useEffect(() => {
    if (open) {
      setCode(initialCode ?? '');
      setSubmitted(initialCode?.trim() ? initialCode.trim() : null);
    }
  }, [open, initialCode]);

  const lookupQ = useQuery({
    queryKey: ['serials', 'lookup', submitted],
    queryFn: () => lookupImei(submitted!),
    enabled: open && !!submitted,
    retry: false,
  });

  function submit(raw: string) {
    const c = raw.trim().replace(/[\s-]+/g, '');
    if (!c) return;
    setSubmitted(c);
  }

  if (!open) return null;
  const r: LookupResult | undefined = lookupQ.data;
  const st = r ? STATUS_LABEL[r.device.status] ?? STATUS_LABEL.SOLD : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="استعلام IMEI">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex items-center justify-between border-b border-navy-border/30 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-100">
            <ScanLine className="h-4 w-4 text-cyan-300" /> جواز الجهاز — استعلام IMEI
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06]" aria-label="إغلاق">✕</button>
        </div>

        <div className="scrollbar-premium flex-1 space-y-3 overflow-y-auto p-4">
          <div className="flex gap-2">
            <input
              type="text"
              dir="ltr"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(code); }}
              placeholder="امسح أو الصق IMEI…"
              className="flex-1 rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            />
            <button type="button" onClick={() => submit(code)} className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-extrabold text-navy-950 hover:bg-cyan-500">بحث</button>
          </div>

          {lookupQ.isPending && submitted && <p className="text-center text-xs text-slate-500">جاري البحث…</p>}
          {lookupQ.isError && (
            <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {lookupQ.error instanceof ApiError ? lookupQ.error.message : 'تعذر الاستعلام'}
            </p>
          )}

          {r && (
            <>
              <div className="rounded-2xl border border-navy-border/30 bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-extrabold text-slate-100">{r.device.item?.name ?? 'جهاز'}</span>
                  {st && <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>}
                  {r.isUnderWarranty ? (
                    <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-300">
                      تحت الضمان (متبقي {r.remainingDays} يوماً)
                    </span>
                  ) : r.device.warrantyExpiresAt ? (
                    <span className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-300">
                      الضمان منتهي منذ {Math.max(0, -r.remainingDays)} يوماً
                    </span>
                  ) : (
                    <span className="rounded-lg border border-navy-border/40 px-2 py-0.5 text-xs text-slate-400">بدون ضمان مفعّل</span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-slate-500">IMEI 1</span><span dir="ltr" className="font-mono text-slate-200">{r.device.imei1}</span>
                  {r.device.imei2 && <><span className="text-slate-500">IMEI 2</span><span dir="ltr" className="font-mono text-slate-200">{r.device.imei2}</span></>}
                  {r.device.item?.sku && <><span className="text-slate-500">SKU</span><span dir="ltr" className="font-mono text-slate-200">{r.device.item.sku}</span></>}
                  {r.device.saleInvoiceId && <><span className="text-slate-500">فاتورة البيع</span><span dir="ltr" className="font-mono text-cyan-300">{r.device.saleInvoiceId}</span></>}
                  {r.device.saleDate && <><span className="text-slate-500">تاريخ البيع</span><span className="text-slate-200">{new Date(r.device.saleDate).toLocaleDateString('ar-DZ')}</span></>}
                  {r.device.warrantyExpiresAt && <><span className="text-slate-500">انتهاء الضمان</span><span className="text-slate-200">{new Date(r.device.warrantyExpiresAt).toLocaleDateString('ar-DZ')}</span></>}
                  {(r.customer ?? r.device.customerName) && (
                    <>
                      <span className="text-slate-500">الزبون</span>
                      <span className="text-slate-200">
                        {r.customer?.name ?? r.device.customerName}
                        {(r.customer?.phone ?? r.device.customerPhone) && (
                          <a
                            href={`https://wa.me/${(r.customer?.phone ?? r.device.customerPhone ?? '').replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ms-1 inline-flex items-center gap-0.5 text-emerald-400 hover:underline"
                            title="واتساب"
                          >
                            <Phone className="h-3 w-3" /> <span dir="ltr" className="font-mono">{r.customer?.phone ?? r.device.customerPhone}</span>
                          </a>
                        )}
                      </span>
                    </>
                  )}
                  {r.supplier && <><span className="text-slate-500">المورّد</span><span className="text-slate-200">{r.supplier.name}</span></>}
                </div>
              </div>

              <div>
                <h4 className="mb-1 text-xs font-extrabold text-slate-200">شريط الأحداث التاريخي</h4>
                <ol className="space-y-1.5 border-s-2 border-navy-border/40 ps-3">
                  {r.timeline.map((e) => (
                    <li key={e.id} className="text-xs">
                      <span className="font-bold text-cyan-300">{EVENT_LABEL[e.eventType] ?? e.eventType}</span>
                      <span className="text-slate-400"> — {e.description}</span>
                      <span className="block text-[10px] text-slate-500">{new Date(e.createdAt).toLocaleString('ar-DZ')}</span>
                    </li>
                  ))}
                  {r.timeline.length === 0 && <li className="text-xs text-slate-500">لا أحداث بعد</li>}
                </ol>
              </div>

              {r.relatedRepairs.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-extrabold text-slate-200">تذاكر صيانة مرتبطة ({r.relatedRepairs.length})</h4>
                  {r.relatedRepairs.map((t) => (
                    <div key={t.id} className="mb-1 flex items-center justify-between rounded-lg border border-navy-border/30 px-2.5 py-1.5 text-xs">
                      <span dir="ltr" className="font-mono text-slate-200">{t.ticketNumber}</span>
                      <span className="text-slate-400">{t.deviceBrand} {t.deviceModel} · {t.status}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onRepairTicket({ contactId: r.customer?.id, imei: r.device.imei1 })}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
                >
                  <Wrench className="h-4 w-4" /> فتح تذكرة صيانة
                </button>
                <button
                  type="button"
                  onClick={() => onWarrantyClaim(r.device.id)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-300 hover:bg-violet-500/20"
                >
                  <ShieldCheck className="h-4 w-4" /> مطالبة ضمان
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-navy-border/40 px-3 py-2 text-xs font-bold text-slate-200 hover:border-cyan-500/40"
                >
                  <Printer className="h-4 w-4" /> طباعة الشهادة
                </button>
              </div>

              <div id="imei-warranty-slip" className="hidden print:block" aria-hidden="true">
                <div style={{ textAlign: 'center', color: '#000', background: '#fff' }}>
                  <div style={{ fontWeight: 800 }}>شهادة ضمان وفحص الجهاز (DEVICE WARRANTY PASSPORT)</div>
                  <div>{settings?.business_name ?? ''}</div>
                  <div style={{ margin: '4px 0' }}>{r.device.item?.name ?? ''}</div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                    <span><span style={{ fontSize: '11px' }}>IMEI1</span><br /><BarcodeSvg value={r.device.imei1} height={36} moduleWidth={1} /></span>
                    {r.device.imei2 && <span><span style={{ fontSize: '11px' }}>IMEI2</span><br /><BarcodeSvg value={r.device.imei2} height={36} moduleWidth={1} /></span>}
                  </div>
                  <table style={{ width: '100%', fontSize: '12px', color: '#000', marginTop: '6px' }}>
                    <tbody>
                      <tr><td>تاريخ البيع</td><td>{r.device.saleDate ? new Date(r.device.saleDate).toLocaleDateString('ar-DZ') : '—'}</td></tr>
                      <tr><td>انتهاء الضمان</td><td>{r.device.warrantyExpiresAt ? new Date(r.device.warrantyExpiresAt).toLocaleDateString('ar-DZ') : '—'}</td></tr>
                      <tr><td>الزبون</td><td>{r.customer?.name ?? r.device.customerName ?? '—'}</td></tr>
                      <tr><td>الهاتف</td><td dir="ltr">{r.customer?.phone ?? r.device.customerPhone ?? '—'}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: '10px', marginTop: '6px' }}>الضمان لا يشمل: أضرار السوائل، كسر الشاشة، الفك خارج الورشة.</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '11px' }}>
                    <span>توقيع الزبون: ـــــــــ</span><span>توقيع المحل: ـــــــــ</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
