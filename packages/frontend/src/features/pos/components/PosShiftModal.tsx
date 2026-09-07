import { useEffect, useState } from 'react';
import { Printer, RefreshCw, X, Zap } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { useShiftReport, type VarianceTone } from '../hooks/useShiftReport';
import { useWalletStatsQuery } from '@/features/wallets/hooks/useWallets';

type Props = {
  onClose: () => void;
};

const TONE_STYLE: Record<VarianceTone, { box: string; label: string }> = {
  match: {
    box: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    label: 'مطابق تماماً',
  },
  surplus: {
    box: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
    label: 'فائض في الصندوق',
  },
  deficit: {
    box: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    label: 'عجز في الصندوق',
  },
  none: {
    box: 'border-dashed border-navy-border/40 text-slate-500',
    label: 'أدخل المبلغ المعدود',
  },
};

function SlipRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`font-sans ${bold ? 'font-bold' : ''}`}>{label}</span>
      <span dir="ltr" className={`font-mono ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

/**
 * TB-068 shift close & Z-report — read-only reconciliation + printable slip.
 * No POST: backend exposes no shift-close endpoint and is frozen (AD-58).
 * Keys: Ctrl+P / Enter → print, Esc → close.
 */
export function PosShiftModal({ onClose }: Props) {
  const report = useShiftReport();
  const { data: settings } = useInvoiceSettings();
  const { data: flexy } = useWalletStatsQuery(report.date || undefined, !report.isLoading);
  const [counted, setCounted] = useState('');
  const [cashier, setCashier] = useState('');

  const businessName = settings?.business_name ?? 'بركة موبايل';
  const variance = report.varianceOf(counted);
  const tone = TONE_STYLE[variance.tone];

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm print:bg-white print:p-0"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="إغلاق الوردية / تقرير Z"
    >
      <div className="flex max-h-full w-full max-w-lg flex-col items-center gap-3 overflow-y-auto">
        {/* Screen header — never printed */}
        <div className="flex w-full items-center justify-between print:hidden">
          <h3 className="text-sm font-bold text-slate-100">إغلاق الوردية / تقرير Z</h3>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={report.date}
              onChange={(e) => e.target.value && report.setDate(e.target.value)}
              aria-label="تاريخ الوردية"
              className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-2 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => report.refetch()}
              aria-label="تحديث"
              className="rounded-xl border border-navy-border/40 p-2 text-slate-400 hover:text-slate-100"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="rounded-xl border border-navy-border/40 p-2 text-slate-400 hover:text-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Screen metrics — never printed */}
        <div className="w-full space-y-2 print:hidden">
          {report.isLoading ? (
            <p className="rounded-2xl border border-navy-border/40 bg-navy-900/60 p-6 text-center text-sm text-slate-400">
              جاري تحميل بيانات الوردية…
            </p>
          ) : report.isError ? (
            <p className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-6 text-center text-sm text-rose-300" role="alert">
              تعذر تحميل بيانات الوردية
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 p-3">
                  <p className="text-[11px] text-slate-500">رصيد الافتتاح</p>
                  <p dir="ltr" className="mt-0.5 font-mono text-base font-bold text-slate-100">{report.opening} د.ج</p>
                </div>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3">
                  <p className="text-[11px] text-slate-500">النقد المتوقع في الدرج</p>
                  <p dir="ltr" className="mt-0.5 font-mono text-base font-bold text-amber-400">{report.expected} د.ج</p>
                </div>
                <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 p-3">
                  <p className="text-[11px] text-slate-500">مبيعات اليوم ({report.salesCount})</p>
                  <p dir="ltr" className="mt-0.5 font-mono text-base font-bold text-slate-100">{report.salesVolume} د.ج</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    نقداً <span dir="ltr" className="font-mono text-emerald-400">{report.salesCash}</span>
                    {' · '}آجل <span dir="ltr" className="font-mono text-amber-300">{report.salesCredit}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 p-3">
                  <p className="text-[11px] text-slate-500">التدفقات (داخل / خارج)</p>
                  <p dir="ltr" className="mt-0.5 font-mono text-base font-bold text-emerald-400">+{report.totalIn}</p>
                  <p dir="ltr" className="font-mono text-sm font-bold text-slate-400">−{report.totalOut}</p>
                </div>
              </div>

              {report.liveBalance !== null && (
                <p className="text-center text-[11px] text-slate-500">
                  الرصيد الحي للصندوق: <span dir="ltr" className="font-mono font-bold text-slate-300">{report.liveBalance} د.ج</span>
                </p>
              )}

              <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                  <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                  خدمات الدفع والتعبئة الرقمية (فليكسي)
                </p>
                <div className="flex items-center justify-between py-0.5 text-xs">
                  <span className="text-slate-300">نقدية الفليكسي المحصلة بالدرج ({flexy?.sales.count ?? 0})</span>
                  <span dir="ltr" className="font-mono font-bold text-emerald-300">+{flexy?.flexyCashInflow ?? '0.00'} د.ج</span>
                </div>
                <div className="flex items-center justify-between py-0.5 text-xs">
                  <span className="text-slate-300">صافي ربح العمولات</span>
                  <span dir="ltr" className="font-mono font-bold text-emerald-300">+{flexy?.sales.commissionProfit ?? '0.00'} د.ج</span>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  الدرج يشمل نقدية الفليكسي — المبلغ أعلاه جزء من إجمالي المقبوضات.
                </p>
              </div>

              <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 p-3">
                <p className="mb-1 text-[11px] text-slate-500">تفصيل الحركات حسب الفئة</p>
                {report.breakdown.length === 0 ? (
                  <p className="text-xs text-slate-500">لا توجد حركات اليوم</p>
                ) : (
                  report.breakdown.map((b) => (
                    <div key={b.category} className="flex items-center justify-between py-0.5 text-xs">
                      <span className="text-slate-300">{b.label}</span>
                      <span dir="ltr" className="font-mono font-bold text-slate-100">{b.amount}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-navy-border/30 bg-navy-900/60 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    placeholder="المبلغ المعدود في الدرج (د.ج)"
                    aria-label="المبلغ المعدود في الدرج"
                    className="h-10 w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-xs placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
                    dir="ltr"
                  />
                </div>
                <div className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-bold ${tone.box}`} role="status">
                  <span>{tone.label}</span>
                  {variance.raw !== null && <span dir="ltr" className="font-mono">{variance.raw} د.ج</span>}
                </div>
                <input
                  type="text"
                  value={cashier}
                  onChange={(e) => setCashier(e.target.value)}
                  placeholder="اسم الكاشير (اختياري — يظهر على القصاصة)"
                  aria-label="اسم الكاشير"
                  className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-xs placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
                />
              </div>
            </>
          )}
        </div>

        {/* Printable Z slip — thermal 80mm, monochrome */}
        {!report.isLoading && !report.isError && (
          <div id="pos-receipt" dir="rtl" className="w-[80mm] bg-white px-3 py-4 font-mono text-[12px] leading-relaxed text-black">
            <div className="flex flex-col items-center text-center">
              <BrandMark className="h-10 w-10" />
              <p className="mt-1 font-sans text-base font-extrabold">{businessName}</p>
              <p className="font-sans text-[11px] font-bold">تقرير إغلاق الوردية (Z)</p>
            </div>
            <hr className="my-2 border-dashed border-black/40" />
            <div className="font-sans text-[11px]">
              <div className="flex items-center justify-between">
                <span>التاريخ</span>
                <span dir="ltr" className="font-mono">{report.date}</span>
              </div>
              {cashier.trim() && (
                <div className="flex items-center justify-between">
                  <span>الكاشير</span>
                  <span className="font-bold">{cashier.trim()}</span>
                </div>
              )}
            </div>
            <hr className="my-2 border-dashed border-black/40" />
            <SlipRow label="رصيد الافتتاح" value={`${report.opening} د.ج`} />
            <SlipRow label={`مبيعات اليوم (${report.salesCount})`} value={`${report.salesVolume} د.ج`} />
            <SlipRow label="منها نقداً" value={`${report.salesCash} د.ج`} />
            <SlipRow label="منها آجل" value={`${report.salesCredit} د.ج`} />
            <SlipRow label="تدفقات داخلة" value={`+${report.totalIn} د.ج`} />
            <SlipRow label="تدفقات خارجة" value={`-${report.totalOut} د.ج`} />
            <hr className="my-2 border-dashed border-black/40" />
            <div className="font-sans text-[11px] font-bold">خدمات الدفع الإلكتروني (فليكسي)</div>
            <SlipRow label="مبيعات التعبئة (كاش)" value={`${flexy?.flexyCashInflow ?? '0.00'} د.ج`} />
            <SlipRow label="أرباح العمولات" value={`${flexy?.sales.commissionProfit ?? '0.00'} د.ج`} />
            <SlipRow label="عدد العمليات" value={`${flexy?.sales.count ?? 0}`} />
            <hr className="my-2 border-dashed border-black/40" />
            <SlipRow label="النقد المتوقع" value={`${report.expected} د.ج`} bold />
            <SlipRow label="المبلغ المعدود" value={counted.trim() ? `${counted.trim()} د.ج` : '—'} />
            <SlipRow
              label={
                variance.tone === 'match' ? 'الفرق: مطابق' :
                variance.tone === 'surplus' ? 'الفرق: فائض' :
                variance.tone === 'deficit' ? 'الفرق: عجز' : 'الفرق: —'
              }
              value={variance.raw !== null ? `${variance.raw} د.ج` : '—'}
              bold
            />
            {report.breakdown.length > 0 && (
              <>
                <hr className="my-2 border-dashed border-black/40" />
                {report.breakdown.map((b) => (
                  <SlipRow key={b.category} label={b.label} value={`${b.amount} د.ج`} />
                ))}
              </>
            )}
            <hr className="my-2 border-dashed border-black/40" />
            <div className="mt-6 flex justify-between gap-4 text-center font-sans text-[11px]">
              <div className="flex-1">
                <p className="font-bold">الكاشير</p>
                <div className="mt-8 border-t border-black/60" />
              </div>
              <div className="flex-1">
                <p className="font-bold">المشرف</p>
                <div className="mt-8 border-t border-black/60" />
              </div>
            </div>
          </div>
        )}

        {/* Screen actions — never printed */}
        <div className="flex w-full max-w-lg gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={report.isLoading || report.isError}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة تقرير Z
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
