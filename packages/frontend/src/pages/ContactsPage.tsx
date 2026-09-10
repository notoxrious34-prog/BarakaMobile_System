import { useMemo, useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { BrandMark } from '@/components/layout/BrandMark';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import {
  useContactsQuery,
  useDeactivateContactMutation,
  type Contact,
} from '@/features/contacts/hooks/useContacts';
import { ContactsTable } from '@/features/contacts/components/ContactsTable';
import { ContactFormModal } from '@/features/contacts/components/ContactFormModal';
import { PaymentForm } from '@/features/transactions/components/PaymentForm';
import { ContactLedgerModal } from '@/features/reports/components/ContactLedgerModal';
import { DebtStatementModal } from '@/features/contacts/components/DebtStatementModal';
import { CustomerDebtSettlementModal } from '@/features/contacts/components/CustomerDebtSettlementModal';
import { SupplierDebtSettlementModal } from '@/features/contacts/components/SupplierDebtSettlementModal';
import { getQuickPayPreset } from '@/features/contacts/utils/getQuickPayPreset';
import {
  isPositiveBalance,
  netBalance,
  sumBalances,
  type DebtFilter,
} from '@/features/contacts/utils/contactLabels';

const FILTERS: { value: DebtFilter; label: string }[] = [
  { value: 'ALL', label: 'الكل' },
  { value: 'CUSTOMERS', label: 'عملاء' },
  { value: 'SUPPLIERS', label: 'موردون' },
  { value: 'DEBTORS', label: 'عليهم ديون' },
  { value: 'CREDITORS', label: 'لهم مستحقات' },
];

/**
 * TB-074 Contacts & Debt Ledger cockpit — Golden Standard shell: BrandMark
 * header, 4 Decimal metric badges, omnisearch (name/phone/notes), quick filter
 * pills, per-account statement (كشف الحساب), quick-pay flow.
 */
export function ContactsPage() {
  const qc = useQueryClient();
  const { data: contacts, isLoading, isError, error, refetch } = useContactsQuery();
  const deactivateMut = useDeactivateContactMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [quickPayContact, setQuickPayContact] = useState<Contact | null>(null);
  const [filter, setFilter] = useState<DebtFilter>('ALL');
  const [search, setSearch] = useState('');
  const [ledger, setLedger] = useState<{ accountId: string; contactName: string; role: string } | null>(null);
  const [debtStmt, setDebtStmt] = useState<{ id: string; name: string; kind: 'customer' | 'supplier' } | null>(null);
  const [debtSettle, setDebtSettle] = useState<{ id: string; name: string; balance: string } | null>(null);
  const [supplierSettle, setSupplierSettle] = useState<{ id: string; name: string; balance: string } | null>(null);

  const metrics = useMemo(() => {
    const list = contacts ?? [];
    const receivables = sumBalances(
      list.flatMap((c) =>
        c.accounts
          .filter((a) => a.role === 'CUSTOMER' && isPositiveBalance(a.currentBalance))
          .map((a) => a.currentBalance),
      ),
    );
    const payables = sumBalances(
      list.flatMap((c) =>
        c.accounts
          .filter((a) => a.role === 'SUPPLIER' && isPositiveBalance(a.currentBalance))
          .map((a) => a.currentBalance),
      ),
    );
    return {
      active: list.filter((c) => c.isActive).length,
      receivables,
      payables,
      net: netBalance(receivables, payables),
    };
  }, [contacts]);

  const filtered = useMemo(() => {
    let list = contacts ?? [];
    if (filter === 'CUSTOMERS') list = list.filter((c) => c.role === 'CUSTOMER' || c.role === 'BOTH');
    else if (filter === 'SUPPLIERS') list = list.filter((c) => c.role === 'SUPPLIER' || c.role === 'BOTH');
    else if (filter === 'DEBTORS')
      list = list.filter((c) =>
        c.accounts.some((a) => a.role === 'CUSTOMER' && isPositiveBalance(a.currentBalance)),
      );
    else if (filter === 'CREDITORS')
      list = list.filter((c) =>
        c.accounts.some((a) => a.role === 'SUPPLIER' && isPositiveBalance(a.currentBalance)),
      );
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (c) =>
          (c.name ?? '').toLowerCase().includes(s) ||
          (c.phone ?? '').toLowerCase().includes(s) ||
          (c.notes ?? '').toLowerCase().includes(s),
      );
    }
    return list;
  }, [contacts, filter, search]);

  function openCreate() {
    setEditingContact(null);
    setModalOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingContact(null);
  }

  function handleDeactivate(id: string) {
    const confirmed = window.confirm('هل أنت متأكد من تعطيل جهة الاتصال هذه؟');
    if (!confirmed) return;
    deactivateMut.mutate(id, {
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'فشل تعطيل جهة الاتصال';
        window.alert(msg);
      },
    });
  }

  function handleQuickPay(contact: Contact) {
    setQuickPayContact(contact);
    setPaymentOpen(true);
  }

  function handlePaymentClose() {
    setPaymentOpen(false);
    setQuickPayContact(null);
  }

  function handlePaid() {
    qc.invalidateQueries({ queryKey: ['contacts'] });
  }

  const presetPaymentType: 'PAYMENT_IN' | 'PAYMENT_OUT' | undefined = (() => {
    if (!quickPayContact) return undefined;
    return getQuickPayPreset(quickPayContact);
  })();

  function Metric({ label, value, tone, mono }: { label: string; value: string | number; tone: string; mono?: boolean }) {
    return (
      <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 px-3 py-2">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p dir="ltr" className={`mt-0.5 text-left text-base font-bold ${mono ? 'font-mono' : ''} ${tone}`}>
          {value}
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
              إدارة جهات الاتصال والديون
            </h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              متابعة أرصدة العملاء والموردين ودفتر الحسابات
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          إضافة جهة اتصال
        </button>
      </div>

      {/* Metric badges (Decimal) */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="جهات نشطة" value={metrics.active} tone="text-slate-100" />
        <Metric label="مستحقاتنا لدى العملاء" value={`${metrics.receivables} د.ج`} tone="text-emerald-400" mono />
        <Metric label="ديون الموردين على المحل" value={`${metrics.payables} د.ج`} tone="text-rose-400" mono />
        <Metric label="صافي المركز المالي" value={`${metrics.net} د.ج`} tone="text-amber-400" mono />
      </div>

      {/* Toolbar: omnisearch + filter pills */}
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
            placeholder="بحث: الاسم أو الهاتف أو الملاحظات…"
            aria-label="بحث في جهات الاتصال"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-2 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`h-7 rounded-lg border px-2 py-0.5 text-xs font-bold ${
              filter === f.value
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
            <p className="text-sm text-rose-300">تعذر تحميل جهات الاتصال</p>
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-slate-600" aria-hidden="true" />
            <p className="text-sm text-slate-400">
              {contacts && contacts.length > 0 ? 'لا توجد نتائج مطابقة' : 'لا توجد جهات اتصال — ابدأ بإضافة جهة اتصال جديدة.'}
            </p>
          </div>
        ) : (
          <ContactsTable
            contacts={filtered}
            onEdit={openEdit}
            onDeactivate={handleDeactivate}
            onQuickPay={handleQuickPay}
            onSettleDebt={(c) => {
              const acc = c.accounts.find((a) => a.role === 'CUSTOMER');
              if (!acc) return;
              setDebtSettle({ id: c.id, name: c.name, balance: acc.currentBalance });
            }}
            onSettleSupplier={(c) => {
              const acc = c.accounts.find((a) => a.role === 'SUPPLIER');
              if (!acc) return;
              setSupplierSettle({ id: c.id, name: c.name, balance: acc.currentBalance });
            }}
            onViewStatement={(accountId, contactName, role) =>
              setLedger({ accountId, contactName, role })
            }
            onDebtStatement={(c, kind) => setDebtStmt({ id: c.id, name: c.name, kind })}
          />
        )}
      </div>

      <ContactFormModal open={modalOpen} onClose={closeModal} contact={editingContact} />
      <PaymentForm
        open={paymentOpen}
        onClose={handlePaymentClose}
        presetContactId={quickPayContact?.id}
        presetPaymentType={presetPaymentType}
        onPaid={handlePaid}
      />
      <ContactLedgerModal
        open={!!ledger}
        onClose={() => setLedger(null)}
        accountId={ledger?.accountId ?? null}
        contactName={ledger?.contactName ?? null}
        role={ledger?.role ?? null}
      />
      {debtStmt && (
        <DebtStatementModal
          open={!!debtStmt}
          onClose={() => setDebtStmt(null)}
          contactId={debtStmt.id}
          contactName={debtStmt.name}
          kind={debtStmt.kind}
        />
      )}
      {debtSettle && (
        <CustomerDebtSettlementModal
          open={!!debtSettle}
          onClose={() => setDebtSettle(null)}
          contactId={debtSettle.id}
          contactName={debtSettle.name}
          currentDebt={debtSettle.balance}
          onSettled={() => qc.invalidateQueries({ queryKey: ['contacts'] })}
        />
      )}
      {supplierSettle && (
        <SupplierDebtSettlementModal
          open={!!supplierSettle}
          onClose={() => setSupplierSettle(null)}
          contactId={supplierSettle.id}
          contactName={supplierSettle.name}
          currentPayable={supplierSettle.balance}
          onSettled={() => qc.invalidateQueries({ queryKey: ['contacts'] })}
        />
      )}
    </div>
  );
}
