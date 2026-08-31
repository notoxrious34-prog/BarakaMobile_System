import { Eye, Printer } from 'lucide-react';
import type { Transaction } from '../hooks/useTransactions';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  transactions: Transaction[];
  contactNameMap: Record<string, string>;
  onView: (id: string) => void;
  onPrint?: (id: string) => void;
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

function getContactName(tx: Transaction, map: Record<string, string>): string {
  if (tx.contact?.name) return tx.contact.name;
  if ((tx as unknown as { account?: { contact?: { name: string } } }).account?.contact?.name) {
    return (tx as unknown as { account: { contact: { name: string } } }).account.contact.name;
  }
  const cid = tx.contactId ?? tx.account?.contactId ?? tx.accountId;
  if (cid && map[cid]) return map[cid];
  if (tx.account?.contactId && map[tx.account.contactId]) return map[tx.account.contactId];
  return tx.account?.contactId ?? tx.contactId ?? '—';
}

export function TransactionsList({ transactions, contactNameMap, onView, onPrint }: Props) {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-zinc-600">
              <th className="px-4 py-3 text-right font-semibold">التاريخ</th>
              <th className="px-4 py-3 text-right font-semibold">النوع</th>
              <th className="px-4 py-3 text-right font-semibold">جهة الاتصال</th>
              <th className="px-4 py-3 text-right font-semibold">المبلغ</th>
              <th className="px-4 py-3 text-right font-semibold">ملاحظة</th>
              <th className="px-4 py-3 text-center font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => (
              <tr key={tx.id} className="border-t border-zinc-100 bg-white hover:bg-zinc-50">
                <td className="px-4 py-3 text-zinc-700" dir="ltr">
                  {formatArabicDate(tx.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <TransactionTypeBadge type={tx.type} />
                </td>
                <td className="px-4 py-3 text-zinc-900">{getContactName(tx, contactNameMap)}</td>
                <td className="px-4 py-3 text-zinc-700" dir="ltr">
                  {Number(tx.amount).toFixed(2)} {currencySymbol}
                </td>
                <td className="px-4 py-3 text-zinc-600">{tx.note ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => onView(tx.id)}
                      aria-label={`عرض ${tx.id}`}
                      title="عرض التفاصيل"
                      className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {tx.type === 'SALE' && tx.invoiceNumber ? (
                      <button
                        type="button"
                        onClick={() => onPrint?.(tx.id)}
                        aria-label={`طباعة ${tx.id}`}
                        title="طباعة الفاتورة"
                        className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Printer className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
