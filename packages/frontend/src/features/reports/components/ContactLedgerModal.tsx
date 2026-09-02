import { X } from 'lucide-react';
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
        role="dialog"
        aria-modal="true"
        aria-label="كشف الحساب"
        className="relative z-10 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
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
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <Loading text="جاري تحميل الكشف..." />
        ) : isError ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
            {error instanceof Error ? error.message : 'تعذر تحميل الكشف'}
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center">
            <p className="text-sm text-slate-400">لا توجد حركات في هذا الحساب.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-800 text-slate-400">
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
                      <tr key={e.id} className="border-t border-slate-800 bg-slate-900 hover:bg-slate-800/40">
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {formatArabicDate(e.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-200" dir="ltr">
                          {Number(e.amount).toFixed(2)} {currencySymbol}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {Number(e.balanceBefore).toFixed(2)} {currencySymbol}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {Number(e.balanceAfter).toFixed(2)} {currencySymbol}
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
