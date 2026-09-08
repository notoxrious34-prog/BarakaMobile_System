import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, ShieldCheck, X } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { BarcodeSvg } from '@/features/inventory/components/barcode/BarcodeSvg';

export type ReceiptSerial = {
  id: string;
  imei1: string;
  warrantyMonths?: number;
  warrantyExpiresAt?: string | null;
};

export type ReceiptLine = {
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  serials?: ReceiptSerial[];
};

export type ReceiptData = {
  lines: ReceiptLine[];
  subtotal: string;
  discountAmount: string;
  discountLabel: string | null;
  grandTotal: string;
  paid: string;
  change: string;
  invoiceNumber?: string;
  createdAt: string;
  customerLabel: string;
  customerPhone?: string | null;
};

type Props = {
  data: ReceiptData;
  onClose: () => void;
  /** Dismiss + reset for the next customer (Esc) */
  onNewSale: () => void;
};

type Mode = 'thermal' | 'standard';

function formatArDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-DZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatISODate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * TB-068 dual-mode smart receipt — thermal 80/58mm slip + standard A4 invoice.
 * Screen preview follows the app theme; `#pos-receipt` is print-isolated in index.css.
 * Keys: Enter / Ctrl+P → print, Esc → close + next customer.
 */
export function PosReceiptModal({ data, onClose, onNewSale }: Props) {
  const [mode, setMode] = useState<Mode>('thermal');
  const [thermalWidth, setThermalWidth] = useState<'80' | '58'>('80');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const { data: settings } = useInvoiceSettings();
  const soldSerials = data.lines.flatMap((l) =>
    (l.serials ?? []).map((s) => ({ ...s, itemName: l.name })),
  );

  const businessName = settings?.business_name ?? 'بركة موبايل';
  const businessPhone = settings?.business_phone ?? '';
  const businessAddress = settings?.business_address ?? '';
  const footerNote = settings?.invoice_footer_note ?? '';

  useEffect(() => {
    if (!data.invoiceNumber) {
      setQrDataUrl('');
      return;
    }
    const content = `BarakaMobile|${data.invoiceNumber}|${formatISODate(data.createdAt)}|${data.grandTotal}`;
    QRCode.toDataURL(content, { width: 140, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [data.invoiceNumber, data.createdAt, data.grandTotal]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onNewSale();
      } else if (e.key === 'F8' && soldSerials.length > 0) {
        e.preventDefault();
        setWarrantyOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        window.print();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNewSale, soldSerials.length]);

  const invoiceLabel = data.invoiceNumber ?? '—';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm print:bg-white print:p-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="إيصال البيع"
    >
      {/* Toolbar — never printed */}
      <div className="flex max-h-full flex-col items-center gap-3 overflow-y-auto">
        <div className="flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex overflow-hidden rounded-xl border border-navy-border/40 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode('thermal')}
              className={`px-3 py-2 ${mode === 'thermal' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              حراري 80/58
            </button>
            <button
              type="button"
              onClick={() => setMode('standard')}
              className={`px-3 py-2 ${mode === 'standard' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              فاتورة A4
            </button>
          </div>
          {mode === 'thermal' && (
            <div className="flex overflow-hidden rounded-xl border border-navy-border/40 font-mono text-xs font-bold">
              <button
                type="button"
                onClick={() => setThermalWidth('80')}
                className={`px-3 py-2 ${thermalWidth === '80' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span dir="ltr">80mm</span>
              </button>
              <button
                type="button"
                onClick={() => setThermalWidth('58')}
                className={`px-3 py-2 ${thermalWidth === '58' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span dir="ltr">58mm</span>
              </button>
            </div>
          )}
        </div>

        {mode === 'thermal' ? (
          <div
            id="pos-receipt"
            dir="rtl"
            className={`bg-white px-3 py-4 font-mono text-[12px] leading-relaxed text-black ${thermalWidth === '80' ? 'w-[80mm]' : 'w-[58mm] text-[11px]'}`}
          >
            <div className="flex flex-col items-center text-center">
              <BrandMark className="h-12 w-12" />
              <p className="mt-1 font-sans text-base font-extrabold">{businessName}</p>
              <p className="font-sans text-[11px]">نقطة البيع — مبيعات التجزئة</p>
              {businessPhone && (
                <p className="font-sans text-[11px]" dir="ltr">{businessPhone}</p>
              )}
            </div>

            <hr className="my-2 border-dashed border-black/40" />

            <div className="font-sans text-[11px]">
              <div className="flex items-center justify-between">
                <span>رقم الفاتورة</span>
                <span dir="ltr" className="font-mono font-bold">{invoiceLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>التاريخ</span>
                <span>{formatArDateTime(data.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>العميل</span>
                <span className="font-bold">{data.customerLabel}</span>
              </div>
            </div>

            <hr className="my-2 border-dashed border-black/40" />

            <table className="w-full">
              <thead>
                <tr className="font-sans text-[11px]">
                  <th className="text-right font-bold">الصنف</th>
                  <th className="text-center font-bold">الكمية</th>
                  <th className="text-left font-bold">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l, i) => (
                  <tr key={i} className="border-t border-dashed border-black/20">
                    <td className="py-0.5 text-right font-sans text-[11px]">
                      {l.name}
                      {l.sku && (
                        <span dir="ltr" className="block font-mono text-[10px] text-black/60">
                          {l.sku}
                        </span>
                      )}
                      <span dir="ltr" className="block font-mono text-[10px] text-black/60">
                        {l.unitPrice}
                      </span>
                      {(l.serials ?? []).map((s) => (
                        <span key={s.id} dir="ltr" className="block font-mono text-[10px] font-bold text-black">
                          IMEI: {s.imei1} | الضمان: {s.warrantyMonths ?? 12} شهر
                          {s.warrantyExpiresAt && ` (ينتهي: ${s.warrantyExpiresAt.slice(0, 10)})`}
                        </span>
                      ))}
                    </td>
                    <td dir="ltr" className="text-center">{l.quantity}</td>
                    <td dir="ltr" className="text-left font-bold">{l.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr className="my-2 border-dashed border-black/40" />

            <div className="flex items-center justify-between">
              <span className="font-sans">المجموع الفرعي</span>
              <span dir="ltr">{data.subtotal} د.ج</span>
            </div>
            {data.discountLabel && (
              <div className="flex items-center justify-between">
                <span className="font-sans">خصم ({data.discountLabel})</span>
                <span dir="ltr">-{data.discountAmount} د.ج</span>
              </div>
            )}
            <div className="flex items-center justify-between font-bold">
              <span className="font-sans">المجموع الكلي</span>
              <span dir="ltr">{data.grandTotal} د.ج</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-sans">المدفوع نقداً</span>
              <span dir="ltr">{data.paid} د.ج</span>
            </div>
            <div className="flex items-center justify-between font-bold">
              <span className="font-sans">الباقي للعميل</span>
              <span dir="ltr">{data.change} د.ج</span>
            </div>

            <hr className="my-2 border-dashed border-black/40" />

            {qrDataUrl && (
              <div className="flex flex-col items-center gap-1">
                <img src={qrDataUrl} alt="رمز الفاتورة" className="h-20 w-20" />
                <span dir="ltr" className="font-mono text-[9px] text-black/60">{data.invoiceNumber}</span>
              </div>
            )}
            <p className="mt-1 text-center font-sans text-[11px] font-bold">
              شكراً لتعاملكم معنا
            </p>
            <p className="text-center font-sans text-[10px]">
              {footerNote || 'البضاعة المباعة ترد وتستبدل خلال 48 ساعة'}
            </p>
          </div>
        ) : (
          <>
            <style>{`@page { size: A4; margin: 12mm; }`}</style>
            <div
              id="pos-receipt"
              dir="rtl"
              className="flex w-full max-w-[210mm] flex-col bg-white p-8 text-zinc-900"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="flex items-center gap-4">
                  <BrandMark className="h-14 w-14" />
                  <div>
                    <p className="text-xl font-extrabold">{businessName}</p>
                    {businessAddress && <p className="mt-1 text-sm text-zinc-600">{businessAddress}</p>}
                    {businessPhone && <p className="mt-1 text-sm text-zinc-600" dir="ltr">{businessPhone}</p>}
                  </div>
                </div>
                <div className="text-center">
                  <h1 className="text-3xl font-extrabold">فاتورة بيع</h1>
                  <p className="mt-1 text-xs tracking-widest text-zinc-400">SALES INVOICE</p>
                </div>
              </div>
              <hr className="mt-6 border-zinc-200" />

              <div className="mt-6 flex items-start justify-between gap-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <span className="font-medium text-zinc-500">رقم الفاتورة:</span>
                    <span className="font-mono font-semibold" dir="ltr">{invoiceLabel}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium text-zinc-500">التاريخ:</span>
                    <span>{formatArDateTime(data.createdAt)}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-medium text-zinc-500">العميل:</span>
                    <span className="font-semibold">{data.customerLabel}</span>
                  </div>
                  {data.customerPhone && (
                    <div className="flex gap-2">
                      <span className="font-medium text-zinc-500">الهاتف:</span>
                      <span className="font-mono" dir="ltr">{data.customerPhone}</span>
                    </div>
                  )}
                </div>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="رمز الفاتورة" className="h-28 w-28 rounded border border-zinc-200 bg-white p-1" />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded border border-dashed border-zinc-300 text-xs text-zinc-400">
                    {data.invoiceNumber ? '...' : 'بدون رمز'}
                  </div>
                )}
              </div>

              <table className="mt-6 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-300 bg-zinc-50 text-zinc-700">
                    <th className="px-3 py-2 text-right font-semibold">#</th>
                    <th className="px-3 py-2 text-right font-semibold">الصنف</th>
                    <th className="px-3 py-2 text-right font-semibold">الباركود</th>
                    <th className="px-3 py-2 text-right font-semibold">الكمية</th>
                    <th className="px-3 py-2 text-right font-semibold">سعر الوحدة</th>
                    <th className="px-3 py-2 text-right font-semibold">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l, i) => (
                    <tr key={i} className="border-b border-zinc-100">
                      <td className="px-3 py-2 text-zinc-600">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        {l.name}
                        {(l.serials ?? []).map((s) => (
                          <span key={s.id} dir="ltr" className="block font-mono text-[11px] text-zinc-600">
                            IMEI: {s.imei1} — ضمان {s.warrantyMonths ?? 12} شهر
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-zinc-600" dir="ltr">{l.sku ?? '—'}</td>
                      <td className="px-3 py-2" dir="ltr">{l.quantity}</td>
                      <td className="px-3 py-2" dir="ltr">{l.unitPrice} د.ج</td>
                      <td className="px-3 py-2 font-medium" dir="ltr">{l.lineTotal} د.ج</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 flex justify-end">
                <div className="w-64 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">المجموع الفرعي:</span>
                    <span className="font-medium" dir="ltr">{data.subtotal} د.ج</span>
                  </div>
                  {data.discountLabel && (
                    <div className="flex justify-between">
                      <span className="text-zinc-600">خصم ({data.discountLabel}):</span>
                      <span className="font-medium" dir="ltr">-{data.discountAmount} د.ج</span>
                    </div>
                  )}
                  <hr className="border-zinc-200" />
                  <div className="flex justify-between text-base">
                    <span className="font-bold">المجموع الكلي:</span>
                    <span className="font-extrabold" dir="ltr">{data.grandTotal} د.ج</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">المستلم:</span>
                    <span className="font-medium" dir="ltr">{data.paid} د.ج</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">الباقي:</span>
                    <span className="font-medium" dir="ltr">{data.change} د.ج</span>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex justify-between gap-6 text-center text-sm">
                <div className="flex-1">
                  <p className="font-semibold">توقيع الكاشير</p>
                  <div className="mt-8 border-t border-zinc-300" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">توقيع العميل</p>
                  <div className="mt-8 border-t border-zinc-300" />
                </div>
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm text-zinc-500">شكراً لتعاملكم معنا</p>
                <p className="mt-1 text-xs text-zinc-400">{footerNote || 'البضاعة المباعة ترد وتستبدل خلال 48 ساعة'}</p>
              </div>
            </div>
          </>
        )}

        <div className={`flex gap-2 print:hidden ${mode === 'thermal' ? (thermalWidth === '80' ? 'w-[80mm]' : 'w-[58mm]') : 'w-full max-w-[210mm]'}`}>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة
            <kbd dir="ltr" className="rounded bg-navy-950/20 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
          </button>
          {soldSerials.length > 0 && (
            <button
              type="button"
              onClick={() => setWarrantyOpen(true)}
              title="طباعة شهادة الضمان"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-bold text-violet-300 hover:bg-violet-500/20"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              شهادة الضمان
              <kbd dir="ltr" className="rounded bg-navy-950/20 px-1.5 py-0.5 font-mono text-[10px]">F8</kbd>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-navy-border/40 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05]"
          >
            إغلاق
          </button>
          <button
            type="button"
            onClick={onNewSale}
            title="زبون التالي (Esc)"
            className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {warrantyOpen && soldSerials.length > 0 && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm print:bg-white print:p-0"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setWarrantyOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="شهادات الضمان"
        >
          <div className="flex max-h-full flex-col items-center gap-3 overflow-y-auto">
            <div className="flex gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-violet-500"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                طباعة شهادات الضمان ({soldSerials.length})
              </button>
              <button
                type="button"
                onClick={() => setWarrantyOpen(false)}
                className="rounded-xl border border-navy-border/40 px-4 py-2.5 text-sm text-slate-300"
              >
                إغلاق
              </button>
            </div>
            <div id="warranty-certificate-receipt" dir="rtl" className="w-[80mm] bg-white px-3 py-4 font-mono text-[12px] leading-relaxed text-black">
              {soldSerials.map((s) => (
                <div key={s.id} className="warranty-cert-page mb-4 border-b-2 border-dashed border-black/60 pb-4 last:mb-0 last:border-0 last:pb-0">
                  <div className="flex flex-col items-center text-center">
                    <BrandMark className="h-10 w-10" />
                    <p className="mt-1 font-sans text-sm font-extrabold">شهادة ضمان الجهاز</p>
                    <p className="font-sans text-[10px]">{businessName}{businessPhone ? ` — ${businessPhone}` : ''}</p>
                  </div>
                  <hr className="my-2 border-dashed border-black/40" />
                  <div className="flex items-center justify-between font-sans text-[11px]">
                    <span>الفاتورة</span>
                    <span dir="ltr" className="font-mono font-bold">{invoiceLabel}</span>
                  </div>
                  <div className="flex items-center justify-between font-sans text-[11px]">
                    <span>الزبون</span>
                    <span className="font-bold">{data.customerLabel}</span>
                  </div>
                  {data.customerPhone && (
                    <div className="flex items-center justify-between font-sans text-[11px]">
                      <span>الهاتف</span>
                      <span dir="ltr" className="font-mono">{data.customerPhone}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-sans text-[11px]">
                    <span>الصنف</span>
                    <span className="font-bold">{s.itemName}</span>
                  </div>
                  <div className="mt-1 flex flex-col items-center gap-1">
                    <BarcodeSvg value={s.imei1} height={40} moduleWidth={1} />
                  </div>
                  <div className="flex items-center justify-between font-sans text-[11px]">
                    <span>الضمان</span>
                    <span className="font-bold">{s.warrantyMonths ?? 12} شهر</span>
                  </div>
                  <div className="flex items-center justify-between font-sans text-[11px]">
                    <span>ينتهي</span>
                    <span>{s.warrantyExpiresAt ? s.warrantyExpiresAt.slice(0, 10) : '—'}</span>
                  </div>
                  <p className="mt-1 text-center font-sans text-[10px]">الضمان لا يشمل: أضرار السوائل، كسر الشاشة، الفك خارج الورشة.</p>
                  <div className="mt-2 flex items-center justify-between font-sans text-[10px]">
                    <span>توقيع الزبون: ـــــــــ</span>
                    <span>توقيع المحل: ـــــــــ</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
