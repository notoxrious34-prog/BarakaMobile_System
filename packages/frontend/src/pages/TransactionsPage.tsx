import { useState, useMemo } from 'react';
import { Plus, Search, ArrowLeftRight, Zap } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import { WalletTopupModal } from '@/features/wallets/components/WalletTopupModal';
import { useTransactionsQuery } from '@/features/transactions/hooks/useTransactions';
import { TransactionsList } from '@/features/transactions/components/TransactionsList';
import { TransactionDetail } from '@/features/transactions/components/TransactionDetail';
import { InvoiceDocument } from '@/features/invoices/InvoiceDocument';
import { ThermalReceipt } from '@/features/transactions/components/ThermalReceipt';
import { PurchaseForm } from '@/features/transactions/components/PurchaseForm';
import { PaymentForm } from '@/features/transactions/components/PaymentForm';
import { OffsetForm } from '@/features/transactions/components/OffsetForm';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  TRANSACTION_FILTERS,
  sumByType,
  type TransactionFilter,
} from '@/features/transactions/utils/transactionLabels';

type Contact = { id: string; name: string };

/**
 * TB-076 Transactions & Financial Ledger cockpit — Golden Standard shell:
 * BrandMark header, 4 Decimal metric badges (sales/purchases/collections/
 * outflows), omnisearch, quick filter pills, purchase/payment/offset CTAs.
 */
export function TransactionsPage() {
  const { data: transactions, isLoading, isError, error, refetch } = useTransactionsQuery();
  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ['contacts'],
    queryFn: () => api.get<Contact[]>('/contacts'),
  });

  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [offsetOpen, setOffsetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [printA4Id, setPrintA4Id] = useState<string | null>(null);
  const [printThermalId, setPrintThermalId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TransactionFilter>('ALL');
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

  const metrics = useMemo(() => {
    const list = transactions ?? [];
    return {
      sales: sumByType(list, 'SALE'),
      purchases: sumByType(list, 'PURCHASE'),
      collections: sumByType(list, 'PAYMENT_IN'),
      outflows: sumByType(list, 'PAYMENT_OUT'),
    };
  }, [transactions]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const s = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;
      if (!s) return true;
      const hay = [tx.note ?? '', tx.invoiceNumber ?? '', tx.amount ?? '', getContactNameForTx(tx)].join(' ').toLowerCase();
      return hay.includes(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, typeFilter, search, contactNameMap]);

  function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
    return (
      <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 px-3 py-2">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p dir="ltr" className={`mt-0.5 text-left font-mono text-base font-bold ${tone}`}>
          {value} د.ج
        </p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3 font-sans">
      {/* Cockpit header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-100">
              سجل المعاملات والعمليات المالية
            </h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              إدارة المشتريات، المقاصات، وسندات القبض والدفع
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPurchaseOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-extrabold text-navy-950 hover:bg-cyan-500"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            شراء بضاعة
          </button>
          <button
            type="button"
            onClick={() => setTopupOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-extrabold text-navy-950 hover:bg-amber-400"
          >
            <Zap className="h-4 w-4" aria-hidden="true" />
            شحن محفظة رقمية
          </button>
          <button
            type="button"
            onClick={() => setPaymentOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            سند مالي
          </button>
          <button
            type="button"
            onClick={() => setOffsetOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-violet-500"
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            مقاصة حسابات
          </button>
        </div>
      </div>

      {/* Metric badges (Decimal) */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="إجمالي المبيعات" value={metrics.sales} tone="text-emerald-400" />
        <Metric label="إجمالي المشتريات" value={metrics.purchases} tone="text-cyan-300" />
        <Metric label="إجمالي المقبوضات" value={metrics.collections} tone="text-emerald-400" />
        <Metric label="إجمالي المدفوعات" value={metrics.outflows} tone="text-rose-400" />
      </div>

      {/* Toolbar: omnisearch */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث: ملاحظة أو رقم فاتورة أو مبلغ أو جهة…"
            aria-label="بحث في المعاملات"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-2 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Quick filter pills */}
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {TRANSACTION_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTypeFilter(f.value)}
            aria-pressed={typeFilter === f.value}
            className={`h-7 rounded-lg border px-2 py-0.5 text-xs font-bold ${
              typeFilter === f.value
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-navy-border/40 text-slate-400 hover:text-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Board */}
      <div className="min-h-[200px] flex-1">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-navy-border/30 bg-navy-800/40" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-rose-500/20 bg-navy-900 p-6 text-center">
            <p className="text-sm text-rose-300">تعذر تحميل المعاملات</p>
            <p className="mt-1 text-xs text-slate-500">
              {error instanceof Error ? error.message : 'حدث خطأ أثناء جلب البيانات'}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 rounded-xl bg-rose-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-rose-500"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <ArrowLeftRight className="h-8 w-8 text-slate-600" aria-hidden="true" />
            <p className="text-sm text-slate-400">لا توجد معاملات — ابدأ بإنشاء عملية شراء أو سند مالي.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="w-full lg:w-1/2 lg:flex-shrink-0">
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-navy-border/30 bg-navy-900/60 p-8 text-center text-sm text-slate-500">
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
      </div>

      <PurchaseForm open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      <WalletTopupModal open={topupOpen} onClose={() => setTopupOpen(false)} />
      <PaymentForm open={paymentOpen} onClose={() => setPaymentOpen(false)} />
      <OffsetForm open={offsetOpen} onClose={() => setOffsetOpen(false)} />
      <InvoiceDocument transactionId={printA4Id} onClose={() => setPrintA4Id(null)} />
      <ThermalReceipt transactionId={printThermalId} onClose={() => setPrintThermalId(null)} />
    </div>
  );
}
