import { useState, useMemo } from 'react';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTransactionsQuery } from '@/features/transactions/hooks/useTransactions';
import { TransactionsList } from '@/features/transactions/components/TransactionsList';
import { TransactionDetail } from '@/features/transactions/components/TransactionDetail';
import { SaleForm } from '@/features/transactions/components/SaleForm';
import { PurchaseForm } from '@/features/transactions/components/PurchaseForm';
import { PaymentForm } from '@/features/transactions/components/PaymentForm';
import { OffsetForm } from '@/features/transactions/components/OffsetForm';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Contact = { id: string; name: string };

export function TransactionsPage() {
  const { data: transactions, isLoading, isError, error, refetch } = useTransactionsQuery();
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<Contact[]>('/contacts'),
  });

  const [saleOpen, setSaleOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [offsetOpen, setOffsetOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const contactNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    contacts?.forEach((c) => {
      map[c.id] = c.name;
    });
    // Also map accountId -> contact name via transactions' account.contactId if needed, but we have contactId
    transactions?.forEach((tx) => {
      const cid = (tx as unknown as { account?: { contactId: string } }).account?.contactId;
      if (cid && contacts?.find((c) => c.id === cid)) {
        map[tx.accountId] = contacts.find((c) => c.id === cid)!.name;
        map[cid] = contacts.find((c) => c.id === cid)!.name;
      }
      if (tx.contactId && tx.contact?.name) map[tx.contactId] = tx.contact.name;
    });
    return map;
  }, [contacts, transactions]);

  const detailContactName = detailId
    ? (() => {
        const tx = transactions?.find((t) => t.id === detailId);
        if (!tx) return undefined;
        if (tx.contact?.name) return tx.contact.name;
        const cid = (tx as unknown as { account?: { contactId: string } }).account?.contactId ?? tx.contactId;
        if (cid && contactNameMap[cid]) return contactNameMap[cid];
        return undefined;
      })()
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">المعاملات</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSaleOpen(true)}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          بيع
        </button>
        <button
          type="button"
          onClick={() => setPurchaseOpen(true)}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          شراء
        </button>
        <button
          type="button"
          onClick={() => setPaymentOpen(true)}
          className="inline-flex items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          دفع/تحصيل
        </button>
        <button
          type="button"
          onClick={() => setOffsetOpen(true)}
          className="inline-flex items-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          مقاصة
        </button>
      </div>

      {isLoading ? (
        <Loading text="جاري تحميل المعاملات..." />
      ) : isError ? (
        <ErrorState
          title="تعذر تحميل المعاملات"
          message={error instanceof Error ? error.message : 'حدث خطأ أثناء جلب البيانات'}
          onRetry={() => refetch()}
        />
      ) : !transactions || transactions.length === 0 ? (
        <EmptyState title="لا توجد معاملات" message="ابدأ بإنشاء عملية بيع أو شراء أو دفع." />
      ) : (
        <TransactionsList transactions={transactions} contactNameMap={contactNameMap} onView={setDetailId} />
      )}

      <SaleForm open={saleOpen} onClose={() => setSaleOpen(false)} />
      <PurchaseForm open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      <PaymentForm open={paymentOpen} onClose={() => setPaymentOpen(false)} />
      <OffsetForm open={offsetOpen} onClose={() => setOffsetOpen(false)} />
      <TransactionDetail
        open={!!detailId}
        transactionId={detailId}
        onClose={() => setDetailId(null)}
        contactName={detailContactName}
      />
    </div>
  );
}
