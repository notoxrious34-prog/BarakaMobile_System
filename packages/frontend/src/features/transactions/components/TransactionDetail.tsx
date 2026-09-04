import { X } from 'lucide-react';
import Decimal from 'decimal.js';
import { Loading } from '@/components/feedback/Loading';
import { useTransactionDetailQuery } from '../hooks/useTransactions';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { formatMoney2dp, transactionTypeLabel } from '../utils/transactionLabels';

type Props = {
  open: boolean;
  transactionId: string | null;
  onClose: () => void;
  contactName?: string;
  variant?: 'modal' | 'panel';
  onPrintA4?: (id: string) => void;
  onPrintThermal?: (id: string) => void;
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

const TYPE_LABEL: Record<string, string> = {
  SALE: transactionTypeLabel('SALE'),
  PURCHASE: transactionTypeLabel('PURCHASE'),
  PAYMENT_IN: transactionTypeLabel('PAYMENT_IN'),
  PAYMENT_OUT: transactionTypeLabel('PAYMENT_OUT'),
  OFFSET: transactionTypeLabel('OFFSET'),
};

/** TB-076 — Decimal line total fallback (unit × qty), display only. */
function lineTotalFallback(unitRaw: string | undefined, qty: number): string {
  try {
    return new Decimal(unitRaw ?? '0').times(new Decimal(qty)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

export function TransactionDetail({
  open,
  transactionId,
  onClose,
  contactName,
  variant = 'panel',
  onPrintA4,
  onPrintThermal,
}: Props) {
  const { data: tx, isLoading, isError, error } = useTransactionDetailQuery(transactionId ?? '');
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  if (!open) return null;

  const items = (tx?.itemLines ?? tx?.items ?? []) as Array<{
    id: string;
    itemId: string;
    quantity: number;
    unitPrice?: string;
    costPrice?: string;
    sellingPrice?: string;
    totalPrice?: string;
    item?: { name: string };
  }>;

  const services = (tx?.serviceLines ?? tx?.services ?? []) as Array<{
    id: string;
    serviceId: string;
    amount: string;
    profit: string;
    service?: { name: string };
  }>;

  const isPanel = variant === 'panel';

  const inner = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className={`text-base font-semibold ${isPanel ? 'text-slate-100' : 'text-slate-100'}`}>تفاصيل المعاملة</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {!transactionId ? (
        <p className="py-10 text-center text-sm text-slate-500">اختر معاملة لعرض التفاصيل</p>
      ) : isLoading ? (
        <Loading text="جاري تحميل التفاصيل..." />
      ) : isError ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
          {error instanceof Error ? error.message : 'تعذر تحميل التفاصيل'}
        </div>
      ) : !tx ? (
        <p className="text-sm text-slate-500">لا توجد بيانات.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400">النوع:</span>{' '}
              <span className="inline-flex items-center gap-2">
                <TransactionTypeBadge type={tx.type} /> <span className="text-slate-300">{TYPE_LABEL[tx.type] ?? tx.type}</span>
              </span>
            </div>
            <div>
              <span className="text-slate-400">جهة الاتصال:</span>{' '}
              <span className="font-medium text-slate-100">
                {contactName ?? tx.contact?.name ?? tx.account?.contactId ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">المبلغ:</span>{' '}
              <span dir="ltr" className="font-mono font-medium text-slate-100">
                {formatMoney2dp(tx.amount)} {currencySymbol}
              </span>
            </div>
            <div>
              <span className="text-slate-400">التاريخ:</span>{' '}
              <span dir="ltr" className="text-slate-300">
                {formatArabicDate(tx.createdAt)}
              </span>
            </div>
            {tx.invoiceNumber ? (
              <div className="col-span-2">
                <span className="text-slate-400">رقم الفاتورة:</span>{' '}
                <span dir="ltr" className="font-mono font-medium text-emerald-400">
                  {tx.invoiceNumber}
                </span>
              </div>
            ) : null}
            {tx.note && (
              <div className="col-span-2">
                <span className="text-slate-400">ملاحظة:</span>{' '}
                <span className="text-slate-300">{tx.note}</span>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-100">المنتجات</h3>
              <div className="overflow-hidden rounded-xl border border-navy-border/30">
                <table className="w-full text-sm">
                  <thead className="bg-navy-950/60 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-bold">المنتج</th>
                      <th className="px-3 py-2 text-right font-bold">الكمية</th>
                      <th className="px-3 py-2 text-right font-bold">سعر الوحدة</th>
                      <th className="px-3 py-2 text-right font-bold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l) => (
                      <tr key={l.id} className="border-t border-navy-border/20">
                        <td className="px-3 py-2 text-slate-300">{l.item?.name ?? l.itemId}</td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {l.quantity}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {(l.unitPrice ?? l.costPrice ?? l.sellingPrice ?? '0.00')} {currencySymbol}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {(l.totalPrice ?? lineTotalFallback(l.unitPrice ?? l.costPrice, l.quantity))} {currencySymbol}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {services.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-100">الخدمات</h3>
              <div className="overflow-hidden rounded-xl border border-navy-border/30">
                <table className="w-full text-sm">
                  <thead className="bg-navy-950/60 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-bold">الخدمة</th>
                      <th className="px-3 py-2 text-right font-bold">المبلغ</th>
                      <th className="px-3 py-2 text-right font-bold">الربح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((l) => (
                      <tr key={l.id} className="border-t border-navy-border/20">
                        <td className="px-3 py-2 text-slate-300">{l.service?.name ?? l.serviceId}</td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {formatMoney2dp(l.amount)} {currencySymbol}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300" dir="ltr">
                          {formatMoney2dp(l.profit)} {currencySymbol}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {items.length === 0 && services.length === 0 && (
            <p className="text-sm text-slate-500">لا توجد بنود مرتبطة بهذه المعاملة.</p>
          )}

          {tx.type === 'SALE' && (tx as unknown as { invoiceNumber?: string | null }).invoiceNumber ? (
            <div className="flex flex-wrap gap-2 border-t border-navy-border/30 pt-4">
              <button
                type="button"
                onClick={() => onPrintA4?.(tx.id)}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
              >
                طباعة A4
              </button>
              <button
                type="button"
                onClick={() => onPrintThermal?.(tx.id)}
                className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/[0.06]"
              >
                إيصال حراري
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  if (isPanel) {
    return (
      <div className="scrollbar-premium h-full min-h-[24rem] overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900/60 p-4">
        {inner}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="تفاصيل المعاملة"
        className="scrollbar-premium relative z-10 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900 p-6 text-slate-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  );
}
