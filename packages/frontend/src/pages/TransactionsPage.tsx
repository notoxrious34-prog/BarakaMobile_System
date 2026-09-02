import { useState, useMemo } from 'react';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTransactionsQuery } from '@/features/transactions/hooks/useTransactions';
import { TransactionsList } from '@/features/transactions/components/TransactionsList';
import { TransactionDetail } from '@/features/transactions/components/TransactionDetail';
import { InvoiceDocument } from '@/features/invoices/InvoiceDocument';
import { ThermalReceipt } from '@/features/transactions/components/ThermalReceipt';
import { SaleForm } from '@/features/transactions/components/SaleForm';
import { PurchaseForm } from '@/features/transactions/components/PurchaseForm';
import { PaymentForm } from '@/features/transactions/components/PaymentForm';
import { OffsetForm } from '@/features/transactions/components/OffsetForm';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Contact = { id: string; name: string };

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'كل الأنواع' },
  { value: 'SALE', label: 'بيع' },
  { value: 'PURCHASE', label: 'شراء' },
  { value: 'PAYMENT_IN', label: 'تحصيل' },
  { value: 'PAYMENT_OUT', label: 'دفع' },
  { value: 'OFFSET', label: 'مقاصة' },
];

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printA4Id, setPrintA4Id] = useState<string | null>(null);
  const [printThermalId, setPrintThermalId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const contactNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    contacts?.forEach((c) => {
      map[c.id] = c.name;
    });
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

  function getContactNameForTx(tx: NonNullable<typeof transactions>[number]): string {
    if (tx.contact?.name) return tx.contact.name;
    const cid = (tx as unknown as { account?: { contactId: string } }).account?.contactId ?? tx.contactId;
    if (cid && contactNameMap[cid]) return contactNameMap[cid];
    return '';
  }

  const detailContactName = selectedId
    ? (() => {
        const tx = transactions?.find((t) => t.id === selectedId);
        if (!tx) return undefined;
        const name = getContactNameForTx(tx);
        return name || undefined;
      })()
    : undefined;

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const s = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (typeFilter && tx.type !== typeFilter) return false;
      if (!s) return true;
      const hay = [tx.note ?? '', tx.invoiceNumber ?? '', tx.amount ?? '', getContactNameForTx(tx)].join(' ').toLowerCase();
      return hay.includes(s);
    });
  }, [transactions, typeFilter, search, contactNameMap]);

  const hasActiveFilter = typeFilter !== '' || search.trim() !== '';

  return (
    <div dir="rtl" className="font-sans space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">المعاملات</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSaleOpen(true)}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          بيع
        </button>
        <button
          type="button"
          onClick={() => setPurchaseOpen(true)}
          className="inline-flex items-center rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
        >
          شراء
        </button>
        <button
          type="button"
          onClick={() => setPaymentOpen(true)}
          className="inline-flex items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
        >
          دفع/تحصيل
        </button>
        <button
          type="button"
          onClick={() => setOffsetOpen(true)}
          className="inline-flex items-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500"
        >
          مقاصة
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث: ملاحظة أو رقم فاتورة أو جهة..."
          className="min-w-[16rem] flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
        {hasActiveFilter ? (
          <button
            type="button"
            onClick={() => {
              setTypeFilter('');
              setSearch('');
            }}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            مسح
          </button>
        ) : null}
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="w-full lg:w-1/2 lg:flex-shrink-0">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
                لا توجد نتائج مطابقة للبحث
              </div>
            ) : (
              <TransactionsList
                transactions={filtered}
                contactNameMap={contactNameMap}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPrintA4={setPrintA4Id}
                onPrintThermal={setPrintThermalId}
              />
            )}
          </div>
          <div className="w-full lg:w-1/2 lg:sticky lg:top-4">
            <TransactionDetail
              variant="panel"
              open={true}
              transactionId={selectedId}
              onClose={() => setSelectedId(null)}
              contactName={detailContactName}
              onPrintA4={setPrintA4Id}
              onPrintThermal={setPrintThermalId}
            />
          </div>
        </div>
      )}

      <SaleForm open={saleOpen} onClose={() => setSaleOpen(false)} />
      <PurchaseForm open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      <PaymentForm open={paymentOpen} onClose={() => setPaymentOpen(false)} />
      <OffsetForm open={offsetOpen} onClose={() => setOffsetOpen(false)} />
      <InvoiceDocument transactionId={printA4Id} onClose={() => setPrintA4Id(null)} />
      <ThermalReceipt transactionId={printThermalId} onClose={() => setPrintThermalId(null)} />
    </div>
  );
}
