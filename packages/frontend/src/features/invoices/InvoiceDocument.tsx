import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Printer, Download, Loader2 } from 'lucide-react';
import { useTransaction } from '@/features/transactions/hooks/useTransaction';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import logoUrl from '@/assets/logo.png';

declare global {
  interface Window {
    electronAPI?: {
      exportInvoicePDF?: (invoiceNumber?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      getVersion?: () => Promise<string>;
      platform?: string;
    };
  }
}

type Props = {
  transactionId: string | null;
  onClose: () => void;
};

function formatMoney(value: string | number, currencySymbol: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return `0.00 ${currencySymbol}`;
  return `${n.toFixed(2)} ${currencySymbol}`;
}

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

function formatISODate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso.slice(0, 10);
  }
}

export function InvoiceDocument({ transactionId, onClose }: Props) {
  const { data: transaction, isLoading: txLoading, isError: txError } = useTransaction(transactionId);
  const { data: settings, isLoading: settingsLoading } = useInvoiceSettings();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [pdfState, setPdfState] = useState<{ msg: string; isError: boolean } | null>(null);

  const isLoading = txLoading || settingsLoading;
  const isError = txError || (!isLoading && !transaction);

  const currencySymbol = settings?.currency_symbol ?? 'د.ج';
  const businessName = settings?.business_name ?? 'BarakaMobile';
  const businessPhone = settings?.business_phone ?? '';
  const businessAddress = settings?.business_address ?? '';
  const footerNote = settings?.invoice_footer_note ?? '';

  useEffect(() => {
    if (!transaction || !settings) return;
    const invoiceNumber = (transaction as unknown as { invoiceNumber?: string | null }).invoiceNumber;
    if (!invoiceNumber) return;
    const dateStr = formatISODate(transaction.createdAt);
    const grandTotal = Number(transaction.amount).toFixed(2);
    const content = `BarakaMobile|${invoiceNumber}|${dateStr}|${grandTotal}${currencySymbol}`;
    QRCode.toDataURL(content, { width: 140, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [transaction, settings, currencySymbol]);

  if (!transactionId) return null;

  const handlePrint = () => {
    window.print();
    setTimeout(() => onClose(), 500);
  };

  const handleExportPdf = async () => {
    setPdfState(null);
    const api = window.electronAPI?.exportInvoicePDF;
    if (!api) {
      setPdfState({ msg: 'ميزة حفظ PDF متاحة فقط داخل تطبيق سطح المكتب.', isError: true });
      return;
    }
    try {
      const invoiceNum = (transaction as unknown as { invoiceNumber?: string | null })?.invoiceNumber ?? undefined;
      const result = await api(invoiceNum ?? undefined);
      if (result.success) {
        setPdfState({ msg: `تم حفظ PDF بنجاح: ${result.filePath}`, isError: false });
      } else {
        if (result.error === 'cancelled') {
          setPdfState({ msg: 'تم إلغاء الحفظ.', isError: false });
        } else {
          setPdfState({ msg: `فشل حفظ PDF: ${result.error ?? 'خطأ غير معروف'}`, isError: true });
        }
      }
    } catch (e) {
      setPdfState({ msg: `فشل حفظ PDF: ${e instanceof Error ? e.message : String(e)}`, isError: true });
    }
  };

  const invoiceNumber = (transaction as unknown as { invoiceNumber?: string | null })?.invoiceNumber ?? null;
  const displayInvoiceNumber = invoiceNumber ?? transaction?.id.slice(-8) ?? '—';
  // Build combined line items: items first then services
  const itemLines = (transaction?.itemLines ?? []) as Array<{
    id: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    item: { id: string; name: string; sku: string | null };
  }>;
  const serviceLines = (transaction?.serviceLines ?? []) as Array<{
    id: string;
    amount: string;
    profit: string;
    service: { id: string; name: string; pricingType: string };
  }>;

  type CombinedRow = {
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  };
  const combinedRows: CombinedRow[] = [
    ...itemLines.map((l) => ({
      id: l.id,
      description: l.item?.name ?? l.id,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.totalPrice,
    })),
    ...serviceLines.map((l) => ({
      id: l.id,
      description: l.service?.name ?? l.id,
      quantity: 1,
      unitPrice: l.amount,
      lineTotal: l.amount,
    })),
  ];

  const subtotal = combinedRows.reduce((acc, r) => acc + Number(r.lineTotal), 0);
  const subtotalStr = subtotal.toFixed(2);
  const grandTotalStr = transaction ? Number(transaction.amount).toFixed(2) : '0.00';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center overflow-auto bg-white p-4" dir="rtl">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          #invoice-paper { box-shadow: none !important; border: none !important; margin: 0 !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Action bar — excluded from print/PDF content via .no-print and not inside invoice-paper shadow nuance; overlay ensures sidebar not captured in PDF */}
      <div className="no-print mb-4 flex w-full max-w-[210mm] items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-zinc-500 hover:bg-white hover:text-zinc-900"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold text-zinc-700">معاينة الفاتورة</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            حفظ كـ PDF
          </button>
        </div>
      </div>

      {pdfState && (
        <div
          className={`no-print mb-3 w-full max-w-[210mm] rounded-md border px-4 py-2 text-sm ${pdfState.isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}
          role="status"
        >
          {pdfState.msg}
        </div>
      )}

      <div
        id="invoice-paper"
        className="w-full max-w-[210mm] min-h-[297mm] bg-white p-8 shadow-lg border border-zinc-200 flex flex-col"
      >
        {isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" aria-hidden="true" />
            <p className="text-sm text-zinc-500">جاري تحميل الفاتورة...</p>
          </div>
        ) : isError || !transaction || !settings ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
            <p className="text-sm text-red-600">تعذر تحميل الفاتورة</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <>
            {/* a. Header row: logo + business info from Settings API */}
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-4">
                <img
                  src={logoUrl}
                  alt="logo"
                  className="h-14 w-auto object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const fallback = document.getElementById('logo-text-fallback');
                    if (fallback) fallback.style.display = 'block';
                  }}
                />
                <div id="logo-text-fallback" style={{ display: 'none' }}>
                  <p className="text-2xl font-extrabold tracking-tight text-zinc-900">{businessName}</p>
                </div>
              </div>
              <div className="text-left" dir="rtl">
                <p className="text-lg font-bold text-zinc-900">{businessName}</p>
                {businessPhone && <p className="mt-1 text-sm text-zinc-600" dir="ltr">{businessPhone}</p>}
                {businessAddress && <p className="mt-1 text-sm text-zinc-600">{businessAddress}</p>}
              </div>
            </div>
            <hr className="mt-6 border-zinc-200" />

            {/* b. Document title */}
            <div className="mt-6 text-center">
              <h1 className="text-3xl font-extrabold text-zinc-900">فاتورة</h1>
              <p className="mt-1 text-xs tracking-widest text-zinc-400">INVOICE</p>
            </div>

            {/* c. Metadata block: invoiceNumber, date, QR */}
            <div className="mt-6 flex items-start justify-between gap-6 rounded-lg border border-zinc-100 bg-zinc-50/50 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="font-medium text-zinc-500">رقم الفاتورة:</span>
                  <span className="font-mono font-semibold text-zinc-900" dir="ltr">{displayInvoiceNumber}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium text-zinc-500">التاريخ:</span>
                  <span className="text-zinc-900">{formatArabicDate(transaction.createdAt)}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-medium text-zinc-500">النوع:</span>
                  <span className="text-zinc-900">بيع</span>
                </div>
                {invoiceNumber && (
                  <div className="flex gap-2">
                    <span className="font-medium text-zinc-500">مرجع:</span>
                    <span className="font-mono text-xs text-zinc-500" dir="ltr">{transaction.id.slice(-8)}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-2">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR" className="h-28 w-28 rounded border border-zinc-200 bg-white p-1" />
                ) : invoiceNumber ? (
                  <div className="flex h-28 w-28 items-center justify-center rounded border border-dashed border-zinc-300 bg-white">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                  </div>
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded border border-dashed border-zinc-300 bg-white text-xs text-zinc-400">لا يوجد QR</div>
                )}
                {qrDataUrl && <span className="text-[10px] text-zinc-400" dir="ltr">{`BarakaMobile|${invoiceNumber}`}</span>}
              </div>
            </div>

            {/* d. Bill To block */}
            <div className="mt-6 rounded-lg border border-zinc-200 p-4">
              <h3 className="text-sm font-semibold text-zinc-700">فاتورة إلى</h3>
              <div className="mt-2 space-y-1 text-sm">
                <p className="font-medium text-zinc-900">{transaction.account.contact.name}</p>
                {transaction.account.contact.phone && (
                  <p className="text-zinc-600" dir="ltr">{transaction.account.contact.phone}</p>
                )}
                {transaction.account.contact.address && (
                  <p className="text-zinc-600">{transaction.account.contact.address}</p>
                )}
              </div>
            </div>

            {/* e. Line items table — uses transaction itemLines sellingPrice historically (unitPrice), NOT current item sellingPrice */}
            <div className="mt-6 flex-1">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-300 bg-zinc-50 text-zinc-700">
                    <th className="px-3 py-2 text-right font-semibold">#</th>
                    <th className="px-3 py-2 text-right font-semibold">الوصف</th>
                    <th className="px-3 py-2 text-right font-semibold">الكمية</th>
                    <th className="px-3 py-2 text-right font-semibold">سعر الوحدة</th>
                    <th className="px-3 py-2 text-right font-semibold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-zinc-400">لا توجد بنود</td>
                    </tr>
                  ) : (
                    combinedRows.map((row, idx) => (
                      <tr key={row.id} className="border-b border-zinc-100">
                        <td className="px-3 py-2 text-zinc-600">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-zinc-900">{row.description}</td>
                        <td className="px-3 py-2 text-zinc-900" dir="ltr">{row.quantity}</td>
                        <td className="px-3 py-2 text-zinc-900" dir="ltr">{formatMoney(row.unitPrice, currencySymbol)}</td>
                        <td className="px-3 py-2 font-medium text-zinc-900" dir="ltr">{formatMoney(row.lineTotal, currencySymbol)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* f. Totals block */}
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-600">المجموع الفرعي:</span>
                  <span className="font-medium text-zinc-900" dir="ltr">{formatMoney(subtotalStr, currencySymbol)}</span>
                </div>
                <hr className="border-zinc-200" />
                <div className="flex justify-between text-base">
                  <span className="font-bold text-zinc-900">المجموع الكلي:</span>
                  <span className="font-extrabold text-zinc-900" dir="ltr">{formatMoney(grandTotalStr, currencySymbol)}</span>
                </div>
              </div>
            </div>

            {/* g. Footer */}
            <div className="mt-8 text-center">
              {footerNote && <p className="text-sm italic text-zinc-600">{footerNote}</p>}
              <p className="mt-2 text-sm text-zinc-500">شكراً لتعاملكم معنا</p>
              <hr className="mt-4 border-zinc-200" />
              <p className="mt-3 text-xs text-zinc-400">تم الإنشاء بواسطة BarakaMobile • {formatArabicDate(transaction.createdAt)}</p>
              <p className="mt-1 text-[10px] text-zinc-400" dir="ltr">QR: BarakaMobile|{displayInvoiceNumber}|{formatISODate(transaction.createdAt)}|{grandTotalStr}{currencySymbol}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
