import { Printer } from 'lucide-react';
import type { Transaction } from '../hooks/useTransactions';
import { TransactionTypeBadge } from './TransactionTypeBadge';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { formatMoney2dp } from '../utils/transactionLabels';

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
    <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60">
      <div className="scrollbar-premium overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-navy-border/30 text-xs text-slate-500">
              <th className="px-3 py-2 text-right font-bold">التاريخ</th>
              <th className="px-3 py-2 text-right font-bold">النوع</th>
              <th className="px-3 py-2 text-right font-bold">جهة الاتصال</th>
              <th className="px-3 py-2 text-right font-bold">المبلغ</th>
              <th className="px-3 py-2 text-right font-bold">ملاحظة</th>
              <th className="px-3 py-2 text-center font-bold">إجراءات</th>
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
                  className={`cursor-pointer border-b border-navy-border/20 last:border-0 hover:bg-white/[0.03] ${isSelected ? 'bg-white/[0.04] ring-1 ring-inset ring-emerald-500/30' : ''}`}
                >
                  <td className="px-3 py-2.5 text-slate-300" dir="ltr">
                    {formatArabicDate(tx.createdAt)}
                  </td>
                  <td className="px-3 py-2.5">
                    <TransactionTypeBadge type={tx.type} />
                  </td>
                  <td className="px-3 py-2.5 text-slate-100">{getContactName(tx, contactNameMap)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-100" dir="ltr">
                    {formatMoney2dp(tx.amount)} {currencySymbol}
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
                            className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-1 text-xs font-bold text-slate-300 hover:bg-white/[0.06] hover:text-slate-100"
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
                            className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-1 text-xs font-bold text-slate-300 hover:bg-white/[0.06] hover:text-slate-100"
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
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
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
