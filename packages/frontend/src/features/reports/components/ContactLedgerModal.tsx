import Decimal from 'decimal.js';
import { Printer, X } from 'lucide-react';
import { Loading } from '@/components/feedback/Loading';
import { useLedgerQuery } from '../hooks/useReports';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  open: boolean;
  onClose: () => void;
  accountId: string | null;
  contactName: string | null;
  role: string | null;
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

const ROLE_LABEL: Record<string, string> = {
  SUPPLIER: 'مورد',
  CUSTOMER: 'عميل',
};

const ENTRY_LABEL: Record<string, { label: string; className: string }> = {
  DEBIT: { label: 'مدين', className: 'border-rose-500/20 bg-rose-500/10 text-rose-400' },
  CREDIT: { label: 'دائن', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' },
};

/** TB-074 — Decimal 2dp display (Rule ②: final rendering only). */
function fmt2(raw: string): string {
  try {
    return new Decimal(raw).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

export function ContactLedgerModal({ open, onClose, accountId, contactName, role }: Props) {
  const { data: entries, isLoading, isError, error } = useLedgerQuery(accountId ?? '');
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  if (!open) return null;

  const roleLabel = role ? (ROLE_LABEL[role] ?? role) : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        id="contact-statement"
        role="dialog"
        aria-modal="true"
        aria-label="كشف الحساب"
        className="scrollbar-premium relative z-10 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-navy-800 bg-navy-950 text-slate-100 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">كشف الحساب</h2>
            {contactName && (
              <p className="text-sm text-slate-400">
                {contactName} {roleLabel ? `— ${roleLabel}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="طباعة الكشف"
              title="طباعة"
              className="rounded-md p-1 text-slate-400 hover:bg-navy-800/60 hover:text-slate-100"
            >
              <Printer className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="rounded-md p-1 text-slate-400 hover:bg-navy-800/60 hover:text-slate-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <Loading text="جاري تحميل الكشف..." />
        ) : isError ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
            {error instanceof Error ? error.message : 'تعذر تحميل الكشف'}
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-navy-700 bg-navy-900/40 p-8 text-center">
            <p className="text-sm text-slate-400">لا توجد حركات في هذا الحساب.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-navy-800">
            <div className="scrollbar-premium overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-navy-950/70 text-slate-300">
                    <th className="px-3 py-2 text-right font-semibold">التاريخ</th>
                    <th className="px-3 py-2 text-right font-semibold">النوع</th>
                    <th className="px-3 py-2 text-right font-semibold">المبلغ</th>
                    <th className="px-3 py-2 text-right font-semibold">الرصيد قبل</th>
                    <th className="px-3 py-2 text-right font-semibold">الرصيد بعد</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const cfg = ENTRY_LABEL[e.entryType] ?? { label: e.entryType, className: 'border-slate-700 bg-slate-800 text-slate-300' };
                    return (
                      <tr key={e.id} className="border-t border-navy-800/60 bg-navy-950/40 hover:bg-navy-800/40">
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {formatArabicDate(e.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-200" dir="ltr">
                          {fmt2(e.amount)} {currencySymbol}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {fmt2(e.balanceBefore)} {currencySymbol}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {fmt2(e.balanceAfter)} {currencySymbol}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
