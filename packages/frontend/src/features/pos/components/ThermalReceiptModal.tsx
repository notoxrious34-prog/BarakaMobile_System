import { BrandMark } from '@/components/layout/BrandMark';

export type ReceiptLine = {
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
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
};

type Props = {
  data: ReceiptData;
  onClose: () => void;
};

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-bold' : ''}>{label}</span>
      <span dir="ltr" className={`font-mono ${bold ? 'font-bold' : ''}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * 80mm thermal receipt — screen preview + isolated print.
 * Print CSS (`#thermal-receipt` in index.css) hides all app chrome.
 */
export function ThermalReceiptModal({ data, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm print:bg-white print:p-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="إيصال حراري"
    >
      <div className="flex max-h-full flex-col items-center gap-3 overflow-y-auto">
        <div
          id="thermal-receipt"
          dir="rtl"
          className="thermal-receipt w-[80mm] bg-white px-3 py-4 font-mono text-[12px] leading-relaxed text-black"
        >
          <div className="flex flex-col items-center text-center">
            <BrandMark className="h-12 w-12" />
            <p className="mt-1 font-sans text-base font-extrabold">بركة موبايل</p>
            <p className="font-sans text-[11px]">نقطة البيع — مبيعات التجزئة</p>
          </div>

          <hr className="my-2 border-dashed border-black/40" />

          <div className="font-sans text-[11px]">
            {data.invoiceNumber && (
              <div className="flex items-center justify-between">
                <span>رقم الفاتورة</span>
                <span dir="ltr" className="font-mono font-bold">{data.invoiceNumber}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>التاريخ</span>
              <span>
                {new Date(data.createdAt).toLocaleString('ar-DZ', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
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
                    <span dir="ltr" className="block font-mono text-[10px] text-black/60">
                      {l.unitPrice}
                    </span>
                  </td>
                  <td dir="ltr" className="text-center">{l.quantity}</td>
                  <td dir="ltr" className="text-left font-bold">{l.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <hr className="my-2 border-dashed border-black/40" />

          <Row label="المجموع الفرعي" value={`${data.subtotal} د.ج`} />
          {data.discountLabel && (
            <Row label={`خصم (${data.discountLabel})`} value={`-${data.discountAmount} د.ج`} />
          )}
          <Row label="المجموع الكلي" value={`${data.grandTotal} د.ج`} bold />
          <Row label="المدفوع نقداً" value={`${data.paid} د.ج`} />
          <Row label="الباقي للعميل" value={`${data.change} د.ج`} bold />

          <hr className="my-2 border-dashed border-black/40" />

          <p className="text-center font-sans text-[11px] font-bold">
            شكراً لتعاملكم معنا
          </p>
          <p className="text-center font-sans text-[10px]">
            البضاعة المباعة ترد وتستبدل خلال 48 ساعة
          </p>
        </div>

        <div className="flex w-[80mm] gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500"
          >
            طباعة فورية
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-navy-border/40 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/[0.05]"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
