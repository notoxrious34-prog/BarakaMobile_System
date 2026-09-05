import { useState } from 'react';
import Decimal from 'decimal.js';
import { BrandMark } from '@/components/layout/BrandMark';

type ReceiptPreviewProps = {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  currencySymbol: string;
  footerNote: string;
};

type PreviewMode = 'thermal' | 'a4';

type DemoItem = { name: string; qty: number; price: string };

const DEMO_ITEMS: DemoItem[] = [
  { name: 'شاشة iPhone 11', qty: 1, price: '4500.00' },
  { name: 'كابل USB-C', qty: 2, price: '350.00' },
  { name: 'خدمة فليكسي 500 دج', qty: 1, price: '500.00' },
];

function formatMoney(value: string | number | Decimal): string {
  try {
    return new Decimal(value).toFixed(2);
  } catch {
    return '0.00';
  }
}

export function ReceiptPreview({
  businessName,
  businessPhone,
  businessAddress,
  currencySymbol,
  footerNote,
}: ReceiptPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('thermal');

  const subtotal = DEMO_ITEMS.reduce((sum, item) => {
    return sum.plus(new Decimal(item.price).times(item.qty));
  }, new Decimal(0));
  const subtotalStr = subtotal.toFixed(2);
  const resolvedName = businessName.trim() || 'BarakaMobile';

  const pill = (active: boolean) =>
    `rounded-xl border px-3 py-1.5 text-xs transition-colors ${
      active
        ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-300 border-amber-500/30 font-bold'
        : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/50 border-transparent font-medium'
    }`;

  return (
    <div className="rounded-2xl border border-navy-800/80 bg-navy-900/60 p-5 backdrop-blur-md shadow-xl shadow-navy-950/40 sticky top-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-100">معاينة الإيصال</h3>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">مباشر</span>
      </div>

      <div className="mb-4 flex gap-1.5 rounded-2xl border border-navy-800/80 bg-navy-950/70 p-1.5" role="tablist" aria-label="نمط المعاينة">
        <button type="button" role="tab" aria-selected={mode === 'thermal'} onClick={() => setMode('thermal')} className={pill(mode === 'thermal')}>
          حراري (80mm)
        </button>
        <button type="button" role="tab" aria-selected={mode === 'a4'} onClick={() => setMode('a4')} className={pill(mode === 'a4')}>
          فاتورة A4
        </button>
      </div>

      {mode === 'thermal' ? (
        <div className="mx-auto w-full max-w-[320px] rounded-lg bg-white p-4 font-mono text-xs text-slate-900 shadow-2xl" dir="rtl">
          <div className="text-center">
            <BrandMark className="mx-auto h-10 w-10" />
            <p className="mt-1 font-sans text-sm font-bold text-zinc-900">{resolvedName}</p>
            {businessPhone.trim() ? (
              <p className="mt-1 font-sans text-[11px] text-zinc-600" dir="ltr">
                {businessPhone}
              </p>
            ) : null}
            {businessAddress.trim() ? <p className="mt-1 font-sans text-[11px] text-zinc-600">{businessAddress}</p> : null}
          </div>

          <p className="my-3 text-center text-zinc-300">- - - - - - - - - - - - - - - - - -</p>

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

          <div>
            <div className="flex justify-between border-b border-zinc-200 pb-1.5 text-[10px] font-semibold text-zinc-500">
              <span>الصنف</span>
              <span className="font-mono">المبلغ</span>
            </div>
            <div className="mt-2 space-y-2">
              {DEMO_ITEMS.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 text-[11px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-sans font-medium text-zinc-900">{item.name}</p>
                    <p className="font-mono text-[10px] text-zinc-500" dir="ltr">
                      {item.qty} × {formatMoney(item.price)} {currencySymbol}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono font-semibold text-zinc-900" dir="ltr">
                    {formatMoney(new Decimal(item.price).times(item.qty))} {currencySymbol}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="my-3 text-center text-zinc-300">- - - - - - - - - - - - - - - - - -</p>

          <div className="space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex justify-between text-[11px]">
              <span className="font-sans text-zinc-600">المجموع الفرعي:</span>
              <span className="font-mono font-medium text-zinc-900" dir="ltr">
                {formatMoney(subtotalStr)} {currencySymbol}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="font-sans font-bold text-zinc-900">المجموع الكلي:</span>
              <span className="font-mono text-sm font-extrabold text-zinc-900" dir="ltr">
                {formatMoney(subtotalStr)} {currencySymbol}
              </span>
            </div>
          </div>

          <div className="mt-3 text-center">
            {footerNote.trim() ? <p className="font-sans text-[11px] italic text-zinc-600">{footerNote}</p> : <p className="font-sans text-[11px] text-zinc-400">—</p>}
            <p className="mt-2 font-sans text-[10px] text-zinc-400">شكراً لزيارتكم</p>
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[420px] rounded-lg border border-slate-200 bg-white p-5 font-sans text-xs text-slate-900 shadow-2xl" dir="rtl">
          <div className="flex items-center gap-3 border-b-2 border-zinc-900 pb-3">
            <BrandMark className="h-12 w-12" />
            <div className="flex-1">
              <p className="text-base font-bold text-zinc-900">{resolvedName}</p>
              {businessPhone.trim() ? (
                <p className="mt-0.5 text-[11px] text-zinc-600" dir="ltr">
                  {businessPhone}
                </p>
              ) : null}
              {businessAddress.trim() ? <p className="mt-0.5 text-[11px] text-zinc-600">{businessAddress}</p> : null}
            </div>
            <div className="text-left">
              <p className="text-[10px] text-zinc-500">فاتورة</p>
              <p className="font-mono text-sm font-bold text-zinc-900" dir="ltr">
                INV-000042
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">٢٠٢٦/٠٩/٠٢</p>
            </div>
          </div>

          <table className="mt-3 w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="py-1.5 text-right font-semibold">الصنف</th>
                <th className="py-1.5 text-center font-semibold">الكمية</th>
                <th className="py-1.5 text-left font-semibold">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ITEMS.map((item, idx) => (
                <tr key={idx} className="border-b border-zinc-100 last:border-0">
                  <td className="py-1.5 font-medium text-zinc-900">
                    {item.name}
                    <span className="block font-mono text-[10px] font-normal text-zinc-500" dir="ltr">
                      {formatMoney(item.price)} {currencySymbol}
                    </span>
                  </td>
                  <td className="py-1.5 text-center font-mono text-zinc-700">{item.qty}</td>
                  <td className="py-1.5 text-left font-mono font-semibold text-zinc-900" dir="ltr">
                    {formatMoney(new Decimal(item.price).times(item.qty))} {currencySymbol}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 space-y-1.5 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex justify-between">
              <span className="text-zinc-600">المجموع الفرعي:</span>
              <span className="font-mono font-medium text-zinc-900" dir="ltr">
                {formatMoney(subtotalStr)} {currencySymbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold text-zinc-900">المجموع الكلي:</span>
              <span className="font-mono text-sm font-extrabold text-zinc-900" dir="ltr">
                {formatMoney(subtotalStr)} {currencySymbol}
              </span>
            </div>
          </div>

          <div className="mt-3 text-center">
            {footerNote.trim() ? <p className="text-[11px] italic text-zinc-600">{footerNote}</p> : <p className="text-[11px] text-zinc-400">—</p>}
            <p className="mt-2 text-[10px] text-zinc-400">شكراً لزيارتكم</p>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-slate-500">تحديث فوري أثناء الكتابة — لا حاجة للحفظ للمعاينة</p>
    </div>
  );
}
