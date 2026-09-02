import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
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

export function ContactsPage() {
  const qc = useQueryClient();
  const { data: contacts, isLoading, isError, error, refetch } = useContactsQuery();
  const deactivateMut = useDeactivateContactMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [quickPayContact, setQuickPayContact] = useState<Contact | null>(null);

  const activeCount = contacts ? contacts.filter((c) => c.isActive).length : 0;

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
    const supplierAcc = quickPayContact.accounts.find((a) => a.role === 'SUPPLIER');
    const customerAcc = quickPayContact.accounts.find((a) => a.role === 'CUSTOMER');
    const supplierNonZero = supplierAcc ? Math.abs(Number(supplierAcc.currentBalance)) >= 0.005 : false;
    const customerNonZero = customerAcc ? Math.abs(Number(customerAcc.currentBalance)) >= 0.005 : false;
    if (customerNonZero && !supplierNonZero) return 'PAYMENT_IN';
    if (supplierNonZero && !customerNonZero) return 'PAYMENT_OUT';
    if (customerNonZero && supplierNonZero) return 'PAYMENT_IN';
    if (supplierNonZero) return 'PAYMENT_OUT';
    return 'PAYMENT_IN';
  })();

  return (
    <div dir="rtl" className="font-sans space-y-6 text-slate-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-100">جهات الاتصال</h1>
          {contacts && (
            <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
              {activeCount} نشط
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          إضافة جهة اتصال
        </button>
      </div>

      {isLoading ? (
        <Loading text="جاري تحميل جهات الاتصال..." />
      ) : isError ? (
        <ErrorState
          title="تعذر تحميل جهات الاتصال"
          message={error instanceof Error ? error.message : 'حدث خطأ أثناء جلب البيانات'}
          onRetry={() => refetch()}
        />
      ) : !contacts || contacts.length === 0 ? (
        <EmptyState title="لا توجد جهات اتصال" message="ابدأ بإضافة جهة اتصال جديدة." />
      ) : (
        <ContactsTable contacts={contacts} onEdit={openEdit} onDeactivate={handleDeactivate} onQuickPay={handleQuickPay} />
      )}

      <ContactFormModal open={modalOpen} onClose={closeModal} contact={editingContact} />
      <PaymentForm
        open={paymentOpen}
        onClose={handlePaymentClose}
        presetContactId={quickPayContact?.id}
        presetPaymentType={presetPaymentType}
        onPaid={handlePaid}
      />
    </div>
  );
}
