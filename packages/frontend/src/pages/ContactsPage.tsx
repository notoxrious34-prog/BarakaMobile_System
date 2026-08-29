import { useState } from 'react';
import { Plus } from 'lucide-react';
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

export function ContactsPage() {
  const { data: contacts, isLoading, isError, error, refetch } = useContactsQuery();
  const deactivateMut = useDeactivateContactMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900">جهات الاتصال</h1>
          {contacts && (
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white">
              {activeCount} نشط
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
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
        <ContactsTable contacts={contacts} onEdit={openEdit} onDeactivate={handleDeactivate} />
      )}

      <ContactFormModal open={modalOpen} onClose={closeModal} contact={editingContact} />
    </div>
  );
}
