import { X, Printer, Loader2 } from 'lucide-react';
import Decimal from 'decimal.js';
import { useTransaction } from '../hooks/useTransaction';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  transactionId: string | null;
  onClose: () => void;
};

const TYPE_LABEL: Record<string, string> = {
  SALE: 'بيع',
  PURCHASE: 'شراء',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  OFFSET: 'مقاصة',
};

function formatArabicDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ar-DZ', {
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

/** TB-076 — Decimal 2dp display (Rule ②: final rendering only). */
function formatMoney(value: string | number, currencySymbol: string): string {
  try {
    return `${new Decimal(String(value)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)} ${currencySymbol}`;
  } catch {
    return `0.00 ${currencySymbol}`;
  }
}

export function ThermalReceipt({ transactionId, onClose }: Props) {
  const { data: transaction, isLoading, isError } = useTransaction(transactionId);
  const { data: settings, isLoading: settingsLoading } = useInvoiceSettings();

  if (!transactionId) return null;

  const handlePrint = () => {
    window.print();
    setTimeout(() => onClose(), 500);
  };

  const isLoadingState = isLoading || settingsLoading;
  const currencySymbol = settings?.currency_symbol ?? 'د.ج';
  const businessName = settings?.business_name ?? 'BarakaMobile';
  const businessPhone = settings?.business_phone ?? '';
  const businessAddress = settings?.business_address ?? '';
  const footerNote = settings?.invoice_footer_note ?? '';

  const displayInvoiceNumber =
    (transaction as unknown as { invoiceNumber?: string | null })?.invoiceNumber ?? transaction?.id.slice(-8) ?? '—';
  const itemLines = (transaction?.itemLines ?? []) as Array<{
    id: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    item: { id: string; name: string };
  }>;
  const serviceLines = (transaction?.serviceLines ?? []) as Array<{
    id: string;
    amount: string;
    service: { id: string; name: string };
  }>;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center overflow-auto bg-navy-950 p-4" dir="rtl">
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          html, body { width: 80mm; margin: 0; padding: 0; background: white; }
          body * { visibility: hidden; }
          #thermal-receipt-root, #thermal-receipt-root * { visibility: visible; }
          #thermal-receipt-root {
            position: absolute; left: 0; top: 0;
            width: 72mm;
            background: white;
            color: black;
            font-family: Tajawal, system-ui, sans-serif;
            font-size: 11px;
            line-height: 1.35;
            padding: 2mm;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Chrome controls — not printed */}
      <div className="no-print mb-4 flex w-full max-w-[302px] items-center justify-between rounded-xl border border-navy-border/40 bg-navy-900 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-sm font-bold text-slate-100">إيصال حراري</span>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          طباعة
        </button>
      </div>

      {/* On-screen preview: white paper on dark backdrop, ~302px */}
      <div
        id="thermal-receipt-root"
        dir="rtl"
        className="w-[302px] bg-white p-4 text-black shadow-lg"
        style={{ fontFamily: 'Tajawal, system-ui, sans-serif', fontSize: '11px', lineHeight: 1.35 }}
      >
        {isLoadingState ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" aria-hidden="true" />
            <p className="text-sm text-zinc-500">جاري تحميل الإيصال...</p>
          </div>
        ) : isError || !transaction || !settings ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <p className="text-sm text-red-600">تعذر تحميل الإيصال</p>
          </div>
        ) : (
          <div>
            {/* a) business_name */}
            <p className="text-center text-sm font-bold text-black">{businessName}</p>
            {/* b) phone / address */}
            {businessPhone ? <p className="mt-1 text-center text-[10px] text-zinc-600">{businessPhone}</p> : null}
            {businessAddress ? <p className="mt-1 text-center text-[10px] text-zinc-600">{businessAddress}</p> : null}
            {/* c) dashed separator */}
            <p className="my-2 text-center text-zinc-400">- - - - - - - - - - - - - - - - - - - -</p>
            {/* d) invoice number */}
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-600">رقم:</span>
              <span className="font-mono font-semibold text-black" dir="ltr">
                {displayInvoiceNumber}
              </span>
            </div>
            {/* e) date */}
            <div className="mt-1 flex justify-between text-[11px]">
              <span className="text-zinc-600">التاريخ:</span>
              <span className="text-black">{formatArabicDate(transaction.createdAt)}</span>
            </div>
            {/* f) type */}
            <div className="mt-1 flex justify-between text-[11px]">
              <span className="text-zinc-600">النوع:</span>
              <span className="text-black">{TYPE_LABEL[transaction.type] ?? transaction.type}</span>
            </div>
            {/* g) customer */}
            <div className="mt-1 flex justify-between text-[11px]">
              <span className="text-zinc-600">العميل:</span>
              <span className="font-medium text-black">{transaction.account.contact.name}</span>
            </div>
            {/* h) dashed separator */}
            <p className="my-2 text-center text-zinc-400">- - - - - - - - - - - - - - - - - - - -</p>
            {/* i) lines */}
            {itemLines.length > 0 ? (
              <div className="space-y-1">
                {itemLines.map((l) => (
                  <div key={l.id} className="flex justify-between gap-2 text-[11px]">
                    <span className="flex-1 text-black">
                      {l.item?.name ?? l.id} × <span dir="ltr">{l.quantity}</span>
                    </span>
                    <span className="font-mono text-black" dir="ltr">
                      {formatMoney(l.totalPrice, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {serviceLines.length > 0 ? (
              <div className="mt-2 space-y-1">
                {serviceLines.map((l) => (
                  <div key={l.id} className="flex justify-between gap-2 text-[11px]">
                    <span className="flex-1 text-black">{l.service?.name ?? l.id}</span>
                    <span className="font-mono text-black" dir="ltr">
                      {formatMoney(l.amount, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {itemLines.length === 0 && serviceLines.length === 0 ? (
              <p className="text-center text-[11px] text-zinc-500">لا توجد بنود</p>
            ) : null}
            {/* j) dashed separator */}
            <p className="my-2 text-center text-zinc-400">- - - - - - - - - - - - - - - - - - - -</p>
            {/* k) TOTAL */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-black">المجموع</span>
              <span className="font-mono text-sm font-extrabold text-black" dir="ltr">
                {formatMoney(transaction.amount, currencySymbol)}
              </span>
            </div>
            {/* l) footer note */}
            {footerNote ? <p className="mt-3 text-center text-[10px] italic text-zinc-600">{footerNote}</p> : null}
            {/* m) branding */}
            <p className="mt-3 text-center text-[10px] text-zinc-500">بركة موبايل — BarakaMobile</p>
          </div>
        )}
      </div>
    </div>
  );
}
