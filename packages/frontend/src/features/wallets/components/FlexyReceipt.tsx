export type FlexyReceiptData = {
  entryId: string;
  operatorName: string;
  beneficiaryPhone: string | null;
  nominalAmount: string;
  walletDeductionAmount: string;
  commissionProfit: string;
  newWalletBalance: string;
  createdAt: string;
  storeName?: string;
};

/**
 * Compact 80mm thermal receipt for Flexy sales.
 * Print-isolated via #flexy-receipt in index.css (window.print() flow).
 */
export function FlexyReceipt({ data }: { data: FlexyReceiptData }) {
  const ref = data.entryId.replace(/[^a-zA-Z0-9]/g, '').slice(-12).toUpperCase() || 'FLEXY';
  return (
    <div id="flexy-receipt" dir="rtl" className="bg-white text-black">
      <div className="mx-auto w-[72mm] px-2 py-2 text-center font-mono text-[11px] leading-relaxed">
        <p className="text-sm font-extrabold">{data.storeName ?? 'BarakaMobile'}</p>
        <p>خدمات الدفع والتعبئة الإلكترونية</p>
        <p>Flexy — {data.operatorName}</p>
        <div className="my-1 border-t border-dashed border-black" />
        <div className="text-right">
          <p>المرجع: {ref}</p>
          <p dir="ltr">{new Date(data.createdAt).toLocaleString('fr-DZ')}</p>
          <p>الشبكة: {data.operatorName}</p>
          <p dir="ltr">المستفيد: {data.beneficiaryPhone ?? '—'}</p>
        </div>
        <div className="my-1 border-t border-dashed border-black" />
        <div className="text-right">
          <p>المبلغ المقبوض: {data.nominalAmount} د.ج</p>
          <p>المخصوم من المحفظة: {data.walletDeductionAmount} د.ج</p>
          <p>الرصيد الجديد: {data.newWalletBalance} د.ج</p>
        </div>
        <div className="my-1 border-t border-dashed border-black" />
        <p className="text-xs font-bold tracking-widest" dir="ltr">
          *{ref}*
        </p>
        <p className="mt-1">شكراً لتعاملكم معنا</p>
      </div>
    </div>
  );
}
