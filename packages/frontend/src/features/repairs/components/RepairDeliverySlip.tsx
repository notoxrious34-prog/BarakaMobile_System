import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import QRCode from 'qrcode';
import { Printer, X } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import type { RepairTicket } from '../hooks/useRepairs';
import { deviceLabel } from '../utils/repairLabels';

type Props = {
  ticket: RepairTicket;
  customerPhone?: string | null;
  warrantyDays?: number;
  onClose: () => void;
};

function D2(v: string | undefined | null): string {
  try {
    return new Decimal(v ?? '0.00').toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function SlipRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`font-sans ${bold ? 'font-bold' : ''}`}>{label}</span>
      <span dir="auto" className={`text-left ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

/**
 * TB-119 delivery & warranty invoice — 80/58mm thermal, QR-coded, itemized parts.
 * `#repair-delivery-receipt` is print-isolated in index.css.
 */
export function RepairDeliverySlip({ ticket, customerPhone, warrantyDays = 30, onClose }: Props) {
  const [width, setWidth] = useState<'80' | '58'>('80');
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    QRCode.toDataURL(`BarakaMobile|${ticket.ticketNumber}|DELIVERED`, { width: 120, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [ticket.ticketNumber]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parts = ticket.parts ?? [];
  let profit = '0.00';
  try {
    const total = new Decimal(ticket.actualCost && ticket.actualCost !== '0.00' ? ticket.actualCost : '0.00');
    const cost = new Decimal(ticket.partsCost ?? '0.00');
    profit = total.minus(cost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    profit = '0.00';
  }
  let remaining = '0.00';
  try {
    const t = new Decimal(ticket.actualCost && ticket.actualCost !== '0.00' ? ticket.actualCost : '0.00');
    const paid = new Decimal(ticket.depositAmount ?? '0.00').plus(new Decimal(ticket.paidAmount ?? '0.00'));
    const r = t.minus(paid);
    remaining = r.gt(0) ? r.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) : '0.00';
  } catch {
    remaining = '0.00';
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm print:bg-white print:p-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="فاتورة تسليم الصيانة"
    >
      <div className="flex max-h-full flex-col items-center gap-3 overflow-y-auto">
        <div className="flex w-full max-w-[80mm] items-center justify-between gap-2 print:hidden">
          <div className="flex overflow-hidden rounded-xl border border-navy-border/40 font-mono text-xs font-bold">
            <button
              type="button"
              onClick={() => setWidth('80')}
              className={`px-3 py-2 ${width === '80' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <span dir="ltr">80mm</span>
            </button>
            <button
              type="button"
              onClick={() => setWidth('58')}
              className={`px-3 py-2 ${width === '58' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <span dir="ltr">58mm</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500">فاتورة التسليم + الضمان</p>
        </div>

        <div
          id="repair-delivery-receipt"
          dir="rtl"
          className={`bg-white px-3 py-4 font-mono text-[12px] leading-relaxed text-black ${width === '80' ? 'w-[80mm]' : 'w-[58mm] text-[11px]'}`}
        >
          <div className="flex flex-col items-center text-center">
            <BrandMark className="h-12 w-12" />
            <p className="mt-1 font-sans text-base font-extrabold">بركة موبايل — ورشة الصيانة</p>
            <p className="font-sans text-[11px] font-bold">فاتورة تسليم صيانة وضمان</p>
          </div>
          <hr className="my-2 border-dashed border-black/40" />
          <div className="flex items-center justify-between font-sans text-[11px]">
            <span>رقم التذكرة</span>
            <span dir="ltr" className="font-mono text-sm font-bold">{ticket.ticketNumber}</span>
          </div>
          {ticket.invoiceNumber && (
            <div className="flex items-center justify-between font-sans text-[11px]">
              <span>رقم الفاتورة</span>
              <span dir="ltr" className="font-mono font-bold">{ticket.invoiceNumber}</span>
            </div>
          )}
          <div className="flex items-center justify-between font-sans text-[11px]">
            <span>تاريخ التسليم</span>
            <span>{ticket.deliveredAt ? new Date(ticket.deliveredAt).toLocaleString('ar-DZ') : '—'}</span>
          </div>
          <hr className="my-2 border-dashed border-black/40" />
          <SlipRow label="العميل" value={ticket.contact?.name ?? '—'} bold />
          {customerPhone && <SlipRow label="الهاتف" value={customerPhone} />}
          <SlipRow label="الجهاز" value={`${deviceLabel(ticket.deviceType)} — ${ticket.deviceBrand} ${ticket.deviceModel}`} />
          {ticket.technicianName && <SlipRow label="الفني" value={ticket.technicianName} />}
          <hr className="my-2 border-dashed border-black/40" />
          {parts.length > 0 ? (
            <>
              <p className="font-sans text-[11px] font-bold">قطع الغيار المستبدلة:</p>
              {parts.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="font-sans">{p.inventoryItem?.name ?? 'قطعة'} <span dir="ltr" className="font-mono">×{p.quantity}</span></span>
                  <span dir="ltr" className="font-mono font-bold">{D2(p.totalPrice)} د.ج</span>
                </div>
              ))}
              <hr className="my-2 border-dashed border-black/40" />
            </>
          ) : null}
          <SlipRow label="أتعاب اليد العاملة" value={`${D2(ticket.laborCost)} د.ج`} />
          {ticket.discountAmount !== '0.00' && <SlipRow label="الخصم" value={`${D2(ticket.discountAmount)} د.ج`} />}
          <SlipRow label="الإجمالي" value={`${D2(ticket.actualCost)} د.ج`} bold />
          <SlipRow label="المدفوع" value={`${D2(new Decimal(ticket.depositAmount ?? '0.00').plus(new Decimal(ticket.paidAmount ?? '0.00')).toFixed(2))} د.ج`} />
          <SlipRow label="المتبقي" value={`${remaining} د.ج`} bold />
          <SlipRow label="صافي الربح (إداري)" value={`${profit} د.ج`} />
          <hr className="my-2 border-dashed border-black/40" />
          <p className="text-center font-sans text-[10px] font-bold">
            ضمان {warrantyDays} يوم على قطع الغيار والصيانة (عيوب التركيب فقط)
          </p>
          {qrDataUrl && (
            <div className="mt-1 flex flex-col items-center gap-1">
              <img src={qrDataUrl} alt="رمز التسليم" className="h-20 w-20" />
              <span dir="ltr" className="font-mono text-[9px] text-black/60">{ticket.ticketNumber}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between font-sans text-[10px]">
            <span>توقيع المستلم: ـــــــــ</span>
            <span>توقيع الورشة: ـــــــــ</span>
          </div>
        </div>

        <div className={`flex gap-2 print:hidden ${width === '80' ? 'w-[80mm]' : 'w-[58mm]'}`}>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-navy-border/40 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
