import { X } from 'lucide-react';
import { Loading } from '@/components/feedback/Loading';
import { useTransactionDetailQuery } from '../hooks/useTransactions';
import { TransactionTypeBadge } from './TransactionTypeBadge';

type Props = {
  open: boolean;
  transactionId: string | null;
  onClose: () => void;
  contactName?: string;
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
  SALE: 'بيع',
  PURCHASE: 'شراء',
  PAYMENT_IN: 'تحصيل',
  PAYMENT_OUT: 'دفع',
  OFFSET: 'مقاصة',
};

export function TransactionDetail({ open, transactionId, onClose, contactName }: Props) {
  const { data: tx, isLoading, isError, error } = useTransactionDetailQuery(transactionId ?? '');

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="تفاصيل المعاملة"
        className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">تفاصيل المعاملة</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <Loading text="جاري تحميل التفاصيل..." />
        ) : isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error instanceof Error ? error.message : 'تعذر تحميل التفاصيل'}
          </div>
        ) : !tx ? (
          <p className="text-sm text-zinc-500">لا توجد بيانات.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-zinc-500">النوع:</span>{' '}
                <span className="inline-flex items-center gap-2">
                  <TransactionTypeBadge type={tx.type} /> {TYPE_LABEL[tx.type] ?? tx.type}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">جهة الاتصال:</span>{' '}
                <span className="font-medium text-zinc-900">
                  {contactName ?? tx.contact?.name ?? tx.account?.contactId ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">المبلغ:</span>{' '}
                <span dir="ltr" className="font-medium">
                  {Number(tx.amount).toFixed(2)} DZD
                </span>
              </div>
              <div>
                <span className="text-zinc-500">التاريخ:</span>{' '}
                <span dir="ltr">{formatArabicDate(tx.createdAt)}</span>
              </div>
              {tx.note && (
                <div className="col-span-2">
                  <span className="text-zinc-500">ملاحظة:</span> <span className="text-zinc-700">{tx.note}</span>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">المنتجات</h3>
                <div className="overflow-hidden rounded-md border border-zinc-200">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-zinc-600">
                      <tr>
                        <th className="px-3 py-2 text-right">المنتج</th>
                        <th className="px-3 py-2 text-right">الكمية</th>
                        <th className="px-3 py-2 text-right">سعر الوحدة</th>
                        <th className="px-3 py-2 text-right">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((l) => (
                        <tr key={l.id} className="border-t border-zinc-100">
                          <td className="px-3 py-2">{l.item?.name ?? l.itemId}</td>
                          <td className="px-3 py-2" dir="ltr">
                            {l.quantity}
                          </td>
                          <td className="px-3 py-2" dir="ltr">
                            {(l.unitPrice ?? l.costPrice ?? l.sellingPrice ?? '0.00')} DZD
                          </td>
                          <td className="px-3 py-2" dir="ltr">
                            {(l.totalPrice ?? (Number(l.unitPrice ?? l.costPrice ?? '0') * l.quantity).toFixed(2))} DZD
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
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">الخدمات</h3>
                <div className="overflow-hidden rounded-md border border-zinc-200">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-zinc-600">
                      <tr>
                        <th className="px-3 py-2 text-right">الخدمة</th>
                        <th className="px-3 py-2 text-right">المبلغ</th>
                        <th className="px-3 py-2 text-right">الربح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((l) => (
                        <tr key={l.id} className="border-t border-zinc-100">
                          <td className="px-3 py-2">{l.service?.name ?? l.serviceId}</td>
                          <td className="px-3 py-2" dir="ltr">
                            {Number(l.amount).toFixed(2)} DZD
                          </td>
                          <td className="px-3 py-2" dir="ltr">
                            {Number(l.profit).toFixed(2)} DZD
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {items.length === 0 && services.length === 0 && (
              <p className="text-sm text-zinc-500">لا توجد بنود مرتبطة بهذه المعاملة.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
