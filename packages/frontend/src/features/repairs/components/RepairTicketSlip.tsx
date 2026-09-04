import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, X } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import type { RepairTicket } from '../hooks/useRepairs';
import { deviceLabel, repairTypeLabel, statusLabel } from '../utils/repairLabels';

type Props = {
  ticket: RepairTicket;
  customerPhone?: string | null;
  onClose: () => void;
};

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

function SlipRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`font-sans ${bold ? 'font-bold' : ''}`}>{label}</span>
      <span dir="auto" className={`text-left ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

/**
 * TB-072 repair claim slip + bench sticker — 80/58mm thermal, QR-coded.
 * `#repair-slip` is print-isolated in index.css (PosReceiptModal pattern).
 * Keys: Enter / Ctrl+P → print, Esc → close.
 */
export function RepairTicketSlip({ ticket, customerPhone, onClose }: Props) {
  const [width, setWidth] = useState<'80' | '58'>('80');
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    QRCode.toDataURL(`BarakaMobile|${ticket.ticketNumber}`, { width: 120, margin: 1 })
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
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        window.print();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm print:bg-white print:p-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="تذكرة استلام الصيانة"
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
          <p className="text-[11px] text-slate-500">تذكرة الاستلام + لاصق الورشة</p>
        </div>

        <div
          id="repair-slip"
          dir="rtl"
          className={`bg-white px-3 py-4 font-mono text-[12px] leading-relaxed text-black ${width === '80' ? 'w-[80mm]' : 'w-[58mm] text-[11px]'}`}
        >
          {/* Claim slip */}
          <div className="flex flex-col items-center text-center">
            <BrandMark className="h-12 w-12" />
            <p className="mt-1 font-sans text-base font-extrabold">بركة موبايل — ورشة الصيانة</p>
            <p className="font-sans text-[11px] font-bold">تذكرة استلام جهاز</p>
          </div>
          <hr className="my-2 border-dashed border-black/40" />
          <div className="flex items-center justify-between font-sans text-[11px]">
            <span>رقم التذكرة</span>
            <span dir="ltr" className="font-mono text-sm font-bold">{ticket.ticketNumber}</span>
          </div>
          <div className="flex items-center justify-between font-sans text-[11px]">
            <span>التاريخ</span>
            <span>{formatArDateTime(ticket.receivedAt)}</span>
          </div>
          <hr className="my-2 border-dashed border-black/40" />
          <SlipRow label="العميل" value={ticket.contact?.name ?? '—'} bold />
          {customerPhone && <SlipRow label="الهاتف" value={customerPhone} />}
          <SlipRow label="الجهاز" value={`${deviceLabel(ticket.deviceType)} — ${ticket.deviceBrand} ${ticket.deviceModel}`} />
          <SlipRow label="العطل" value={ticket.problemDescription} />
          <SlipRow label="النوع" value={repairTypeLabel(ticket.repairType)} />
          {ticket.technicianName && <SlipRow label="الفني" value={ticket.technicianName} />}
          <SlipRow label="الحالة" value={statusLabel(ticket.status)} bold />
          <hr className="my-2 border-dashed border-black/40" />
          <SlipRow label="التكلفة التقديرية" value={`${ticket.estimatedCost} د.ج`} bold />
          <SlipRow label="العربون المستلم" value={`${ticket.depositAmount} د.ج`} bold />
          {qrDataUrl && (
            <div className="mt-1 flex flex-col items-center gap-1">
              <img src={qrDataUrl} alt="رمز التذكرة" className="h-20 w-20" />
              <span dir="ltr" className="font-mono text-[9px] text-black/60">{ticket.ticketNumber}</span>
            </div>
          )}
          <p className="mt-1 text-center font-sans text-[10px]">
            احتفظ بهذه التذكرة — التسليم لا يتم بدونها
          </p>

          {/* Bench sticker strip — cut line */}
          <div className="mt-2 border-t-2 border-dashed border-black/60 pt-2 text-center">
            <p className="font-sans text-[10px] font-bold">✂ لاصق الورشة (يُلصق على ظهر الجهاز)</p>
            <p dir="ltr" className="mt-1 font-mono text-sm font-extrabold">{ticket.ticketNumber}</p>
            <p className="font-sans text-[11px] font-bold">
              {ticket.deviceBrand} {ticket.deviceModel}
            </p>
            <p className="font-sans text-[10px]">{ticket.contact?.name ?? ''}</p>
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
