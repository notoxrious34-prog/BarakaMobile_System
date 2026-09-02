import { Printer } from 'lucide-react';
import type { Transaction } from '../hooks/useTransactions';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  transactions: Transaction[];
  contactNameMap: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
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

export function TransactionsList({
  transactions,
  contactNameMap,
  selectedId,
  onSelect,
  onPrintA4,
  onPrintThermal,
}: Props) {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="px-3 py-2.5 text-right font-semibold">التاريخ</th>
              <th className="px-3 py-2.5 text-right font-semibold">النوع</th>
              <th className="px-3 py-2.5 text-right font-semibold">جهة الاتصال</th>
              <th className="px-3 py-2.5 text-right font-semibold">المبلغ</th>
              <th className="px-3 py-2.5 text-right font-semibold">ملاحظة</th>
              <th className="px-3 py-2.5 text-center font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => {
              const isSelected = selectedId === tx.id;
              const hasInvoice = tx.type === 'SALE' && !!tx.invoiceNumber;
              return (
                <tr
                  key={tx.id}
                  onClick={() => onSelect(tx.id)}
                  className={`cursor-pointer border-b border-slate-800 hover:bg-slate-800/50 ${isSelected ? 'bg-slate-800/80 ring-1 ring-emerald-500/30' : ''}`}
                >
                  <td className="px-3 py-2.5 text-slate-300" dir="ltr">
                    {formatArabicDate(tx.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <TransactionTypeBadge type={tx.type} />
                  </td>
                  <td className="px-3 py-2.5 text-slate-100">{getContactName(tx, contactNameMap)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-100" dir="ltr">
                    {Number(tx.amount).toFixed(2)} {currencySymbol}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 text-slate-400">{tx.note ?? '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {hasInvoice ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPrintA4?.(tx.id);
                            }}
                            title="طباعة A4"
                            aria-label={`طباعة A4 ${tx.id}`}
                            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                          >
                            A4
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPrintThermal?.(tx.id);
                            }}
                            title="إيصال حراري"
                            aria-label={`إيصال حراري ${tx.id}`}
                            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                          >
                            حراري
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPrintA4?.(tx.id);
                            }}
                            aria-label={`طباعة ${tx.id}`}
                            title="طباعة الفاتورة"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                          >
                            <Printer className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
