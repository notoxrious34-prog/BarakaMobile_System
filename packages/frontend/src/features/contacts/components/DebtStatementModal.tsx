import Decimal from 'decimal.js';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Loading } from '@/components/feedback/Loading';
import { fetchDebtLedger, fetchSupplierLedger, type DebtLedgerResponse, type SupplierLedgerResponse } from '../api/debtApi';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  open: boolean;
  onClose: () => void;
  contactId: string | null;
  contactName: string | null;
  kind: 'customer' | 'supplier';
  onPay?: () => void;
};

const TYPE_META: Record<string, { label: string; className: string }> = {
  OPENING_BALANCE: { label: 'رصيد افتتاحي', className: 'border-violet-500/30 bg-violet-500/10 text-violet-300' },
  CREDIT_SALE: { label: 'بيع آجل', className: 'border-rose-500/20 bg-rose-500/10 text-rose-400' },
  CREDIT_REPAIR: { label: 'إصلاح آجل', className: 'border-rose-500/20 bg-rose-500/10 text-rose-400' },
  CREDIT_PURCHASE: { label: 'شراء آجل', className: 'border-amber-500/20 bg-amber-500/10 text-amber-300' },
  PAYMENT: { label: 'تسديد', className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' },
  DEBT_ADJUSTMENT_ADD: { label: 'تسوية +', className: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300' },
  DEBT_ADJUSTMENT_SUB: { label: 'تسوية −', className: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300' },
  RETURN_CREDIT: { label: 'مرتجع دائن', className: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300' },
  PURCHASE_RETURN_DEBT: { label: 'مرتجع مشتريات', className: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300' },
};

/** TB-142 — Decimal 2dp display only (Rule ②: final rendering). */
function fmt2(raw: string): string {
  try {
    return new Decimal(raw).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function formatArabicDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-DZ', {
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

/**
 * AD-76 debt statement (TB-142). Renders the counterparty ledger
 * chronologically (opening balance first as genesis row). Running
 * balances come from the server — no client-side money math.
 */
export function DebtStatementModal({ open, onClose, contactId, contactName, kind, onPay }: Props) {
  const query = useQuery<DebtLedgerResponse | SupplierLedgerResponse>({
    queryKey: kind === 'customer' ? ['debt-ledger', contactId] : ['supplier-ledger', contactId],
    queryFn: () =>
      kind === 'customer' ? fetchDebtLedger(contactId ?? '') : fetchSupplierLedger(contactId ?? ''),
    enabled: open && !!contactId,
  });
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  if (!open) return null;

  const rows = [...(query.data?.entries ?? [])].reverse();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={kind === 'customer' ? 'كشف حساب العميل' : 'كشف حساب المورد'}
        className="scrollbar-premium relative z-10 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-navy-800 bg-navy-950 p-6 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {kind === 'customer' ? 'كشف حساب العميل' : 'كشف حساب المورد'}
            </h2>
            {contactName && <p className="text-sm text-slate-400">{contactName}</p>}
            {query.data && (
              <p className="mt-1 text-sm text-slate-300">
                الرصيد الحالي:{' '}
                <span dir="ltr" className="font-mono tabular-nums">
                  {fmt2(query.data.currentBalance)} {currencySymbol}
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-slate-400 hover:bg-navy-800/60 hover:text-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {onPay && (
          <button
            type="button"
            onClick={onPay}
            className={`mb-3 inline-flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-extrabold text-white ${
              kind === 'customer'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-amber-600 hover:bg-amber-500'
            }`}
          >
            {kind === 'customer' ? 'قبض دفعة' : 'سداد دفعة'}
          </button>
        )}

        {query.isLoading ? (
          <Loading text="جاري تحميل الكشف..." />
        ) : query.isError ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
            تعذر تحميل الكشف
          </div>
        ) : rows.length === 0 ? (
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
                  {rows.map((e) => {
                    const cfg = TYPE_META[e.type] ?? {
                      label: e.type,
                      className: 'border-navy-700/60 bg-navy-950/60 text-slate-300',
                    };
                    const voucherCfg =
                      e.type === 'PAYMENT'
                        ? kind === 'customer'
                          ? { label: 'سند قبض', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
                          : { label: 'سند صرف', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' }
                        : null;
                    return (
                      <tr key={e.id} className="border-t border-navy-800/60 bg-navy-950/40 hover:bg-navy-800/40">
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {formatArabicDate(e.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                          {voucherCfg && (
                            <span className={`ms-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${voucherCfg.className}`}>
                              {voucherCfg.label}
                            </span>
                          )}
                          {e.notes && <p className="mt-1 max-w-56 text-[11px] leading-4 text-slate-500">{e.notes}</p>}
                        </td>
                        <td className="px-3 py-2 text-slate-200">
                          <span dir="ltr" className="font-mono tabular-nums">
                            {fmt2(e.amount)} {currencySymbol}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          <span dir="ltr" className="font-mono tabular-nums">
                            {fmt2(e.balanceBefore)} {currencySymbol}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          <span dir="ltr" className="font-mono tabular-nums">
                            {fmt2(e.balanceAfter)} {currencySymbol}
                          </span>
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
