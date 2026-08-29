import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import {
  useServicesQuery,
  useDeactivateServiceMutation,
  type Service,
} from '@/features/services/hooks/useServices';
import { ServicesTable } from '@/features/services/components/ServicesTable';
import { ServiceFormModal } from '@/features/services/components/ServiceFormModal';

export function ServicesPage() {
  const { data: services, isLoading, isError, error, refetch } = useServicesQuery();
  const deactivateMut = useDeactivateServiceMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const activeCount = services ? services.filter((s) => s.isActive).length : 0;

  function openCreate() {
    setEditingService(null);
    setFormOpen(true);
  }

  function openEdit(service: Service) {
    setEditingService(service);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingService(null);
  }

  function handleDeactivate(id: string) {
    const confirmed = window.confirm('هل أنت متأكد من تعطيل هذه الخدمة؟');
    if (!confirmed) return;
    deactivateMut.mutate(id, {
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'فشل تعطيل الخدمة';
        window.alert(msg);
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900">الخدمات</h1>
          {services && (
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
          إضافة خدمة
        </button>
      </div>

      {isLoading ? (
        <Loading text="جاري تحميل الخدمات..." />
      ) : isError ? (
        <ErrorState
          title="تعذر تحميل الخدمات"
          message={error instanceof Error ? error.message : 'حدث خطأ أثناء جلب البيانات'}
          onRetry={() => refetch()}
        />
      ) : !services || services.length === 0 ? (
        <EmptyState title="لا توجد خدمات" message="ابدأ بإضافة خدمة جديدة." />
      ) : (
        <ServicesTable services={services} onEdit={openEdit} onDeactivate={handleDeactivate} />
      )}

      <ServiceFormModal open={formOpen} onClose={closeForm} service={editingService} />
    </div>
  );
}
