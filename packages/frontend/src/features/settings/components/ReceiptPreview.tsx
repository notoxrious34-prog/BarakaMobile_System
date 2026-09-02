type ReceiptPreviewProps = {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  currencySymbol: string;
  footerNote: string;
};

type DemoLine = { name: string; qty: number; unit: string; lineTotal: string };

function formatMoney(value: string, currencySymbol: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return `0.00 ${currencySymbol}`;
  return `${n.toFixed(2)} ${currencySymbol}`;
}

export function ReceiptPreview({
  businessName,
  businessPhone,
  businessAddress,
  currencySymbol,
  footerNote,
}: ReceiptPreviewProps) {
  const demoLines: DemoLine[] = [
    { name: 'شاشة iPhone 11', qty: 1, unit: '4500.00', lineTotal: '4500.00' },
    { name: 'كابل USB-C', qty: 2, unit: '350.00', lineTotal: '700.00' },
    { name: 'خدمة فليكسي 500 دج', qty: 1, unit: '500.00', lineTotal: '500.00' },
  ];

  const subtotal = demoLines.reduce((sum, l) => sum + Number(l.lineTotal), 0);
  const subtotalStr = subtotal.toFixed(2);
  const resolvedName = businessName.trim() || 'BarakaMobile';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">معاينة الإيصال</h3>
        <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">مباشر</span>
      </div>

      {/* Inner paper — light print metaphor on dark outer */}
      <div className="mx-auto w-full max-w-[320px] rounded-lg border border-zinc-200 bg-white p-4 shadow-md" dir="rtl">
        {/* Header: business block */}
        <div className="text-center">
          <p className="font-sans text-sm font-bold text-zinc-900">{resolvedName}</p>
          {businessPhone.trim() ? (
            <p className="mt-1 font-sans text-[11px] text-zinc-600" dir="ltr">
              {businessPhone}
            </p>
          ) : null}
          {businessAddress.trim() ? <p className="mt-1 font-sans text-[11px] text-zinc-600">{businessAddress}</p> : null}
        </div>

        <p className="my-3 text-center text-zinc-300">- - - - - - - - - - - - - - - - - -</p>

        {/* Demo date / number row */}
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span className="font-sans text-zinc-500">رقم الفاتورة:</span>
            <span className="font-mono text-zinc-900" dir="ltr">
              INV-000042
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-zinc-500">التاريخ:</span>
            <span className="font-sans text-zinc-900">٢٠٢٦/٠٩/٠٢</span>
          </div>
        </div>

        <p className="my-3 text-center text-zinc-300">- - - - - - - - - - - - - - - - - -</p>

        {/* Demo line items */}
        <div>
          <div className="flex justify-between border-b border-zinc-200 pb-1.5 text-[10px] font-semibold text-zinc-500">
            <span>الصنف</span>
            <span className="font-mono">المبلغ</span>
          </div>
          <div className="mt-2 space-y-2">
            {demoLines.map((line, idx) => (
              <div key={idx} className="flex items-start justify-between gap-3 text-[11px]">
                <div className="min-w-0 flex-1">
                  <p className="font-sans font-medium text-zinc-900">{line.name}</p>
                  <p className="font-mono text-[10px] text-zinc-500" dir="ltr">
                    {line.qty} × {formatMoney(line.unit, currencySymbol)}
                  </p>
                </div>
                <span className="shrink-0 font-mono font-semibold text-zinc-900" dir="ltr">
                  {formatMoney(line.lineTotal, currencySymbol)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="my-3 text-center text-zinc-300">- - - - - - - - - - - - - - - - - -</p>

        {/* Totals block */}
        <div className="space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex justify-between text-[11px]">
            <span className="font-sans text-zinc-600">المجموع الفرعي:</span>
            <span className="font-mono font-medium text-zinc-900" dir="ltr">
              {formatMoney(subtotalStr, currencySymbol)}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="font-sans font-bold text-zinc-900">المجموع الكلي:</span>
            <span className="font-mono text-sm font-extrabold text-zinc-900" dir="ltr">
              {formatMoney(subtotalStr, currencySymbol)}
            </span>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-3 text-center">
          {footerNote.trim() ? <p className="font-sans text-[11px] italic text-zinc-600">{footerNote}</p> : <p className="font-sans text-[11px] text-zinc-400">—</p>}
          <p className="mt-2 font-sans text-[10px] text-zinc-400">شكراً لزيارتكم</p>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">تحديث فوري أثناء الكتابة — لا حاجة للحفظ للمعاينة</p>
    </div>
  );
}
