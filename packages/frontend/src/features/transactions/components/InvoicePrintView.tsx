import type { TransactionDetail } from '../hooks/useTransaction';

type InvoicePrintViewProps = {
  transaction: TransactionDetail;
  settings: Record<string, string>;
};

const TX_TYPE_LABEL: Record<string, string> = {
  SALE: 'بيع',
  PURCHASE: 'شراء',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  OFFSET: 'تسوية',
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

export function InvoicePrintView({ transaction, settings }: InvoicePrintViewProps) {
  const currencySymbol = settings.currency_symbol || 'د.ج';
  const businessName = settings.business_name || 'BarakaMobile';
  const businessPhone = settings.business_phone || '';
  const businessAddress = settings.business_address || '';
  const footerNote = settings.invoice_footer_note || '';
  const shortId = transaction.id.slice(-8);

  return (
    <div id="invoice-print-root" dir="rtl" className="bg-white p-6 text-zinc-900">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invoice-print-root, #invoice-print-root * { visibility: visible; }
          #invoice-print-root { position: absolute; inset: 0; }
          @page { margin: 1cm; }
        }
      `}</style>

      {/* Header block */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-zinc-900">{businessName}</h1>
        {businessPhone && <p className="mt-1 text-sm text-zinc-600">{businessPhone}</p>}
        {businessAddress && <p className="mt-1 text-sm text-zinc-600">{businessAddress}</p>}
        <hr className="mt-4 border-zinc-200" />
      </div>

      {/* Meta block */}
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="font-medium text-zinc-600">رقم الفاتورة:</span>
          <span className="font-mono text-zinc-900" dir="ltr">{shortId}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium text-zinc-600">التاريخ:</span>
          <span className="text-zinc-900">{formatArabicDate(transaction.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium text-zinc-600">النوع:</span>
          <span className="text-zinc-900">{TX_TYPE_LABEL[transaction.type] ?? transaction.type}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium text-zinc-600">العميل:</span>
          <span className="font-medium text-zinc-900">{transaction.account.contact.name}</span>
        </div>
        {transaction.account.contact.phone && (
          <div className="flex justify-between">
            <span className="font-medium text-zinc-600">الهاتف:</span>
            <span className="text-zinc-900" dir="ltr">{transaction.account.contact.phone}</span>
          </div>
        )}
        <hr className="mt-4 border-zinc-200" />
      </div>

      {/* Items table */}
      {transaction.itemLines.length > 0 && (
        <div className="mt-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-300 bg-zinc-50 text-zinc-700">
                <th className="px-3 py-2 text-right font-semibold">الصنف</th>
                <th className="px-3 py-2 text-right font-semibold">الكمية</th>
                <th className="px-3 py-2 text-right font-semibold">سعر الوحدة</th>
                <th className="px-3 py-2 text-right font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {transaction.itemLines.map((line) => (
                <tr key={line.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2 text-zinc-900">{line.item.name}</td>
                  <td className="px-3 py-2 text-zinc-900" dir="ltr">{line.quantity}</td>
                  <td className="px-3 py-2 text-zinc-900" dir="ltr">{formatMoney(line.unitPrice, currencySymbol)}</td>
                  <td className="px-3 py-2 text-zinc-900" dir="ltr">{formatMoney(line.totalPrice, currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr className="mt-4 border-zinc-200" />
        </div>
      )}

      {/* Services table */}
      {transaction.serviceLines.length > 0 && (
        <div className="mt-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-300 bg-zinc-50 text-zinc-700">
                <th className="px-3 py-2 text-right font-semibold">الخدمة</th>
                <th className="px-3 py-2 text-right font-semibold">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {transaction.serviceLines.map((line) => (
                <tr key={line.id} className="border-b border-zinc-100">
                  <td className="px-3 py-2 text-zinc-900">{line.service.name}</td>
                  <td className="px-3 py-2 text-zinc-900" dir="ltr">{formatMoney(line.amount, currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <hr className="mt-4 border-zinc-200" />
        </div>
      )}

      {/* Total block */}
      <div className="mt-6 flex items-center justify-between">
        <span className="text-base font-bold text-zinc-900">المجموع الكلي:</span>
        <span className="text-lg font-bold text-zinc-900" dir="ltr">{formatMoney(transaction.amount, currencySymbol)}</span>
      </div>

      {/* Footer block */}
      <div className="mt-6 text-center">
        {footerNote && <p className="text-sm italic text-zinc-600">{footerNote}</p>}
        <hr className="mt-4 border-zinc-200" />
        <p className="mt-3 text-xs text-zinc-400">تم الإنشاء بواسطة BarakaMobile</p>
      </div>
    </div>
  );
}
