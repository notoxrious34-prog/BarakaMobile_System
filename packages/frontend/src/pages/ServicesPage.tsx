import { useState, useMemo } from 'react';
import { Plus, Search, X } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [pricingFilter, setPricingFilter] = useState<'' | 'FIXED' | 'COMMISSION'>('');
  const [pendingDeactivateId, setPendingDeactivateId] = useState<string | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const activeCount = services ? services.filter((s) => s.isActive).length : 0;

  const pendingService = pendingDeactivateId ? services?.find((s) => s.id === pendingDeactivateId) ?? null : null;

  const filteredServices = useMemo(() => {
    if (!services) return [];
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (pricingFilter && s.pricingType !== pricingFilter) return false;
      if (!q) return true;
      const hay = `${s.name} ${s.supplier?.name ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [services, search, pricingFilter]);

  const hasActiveFilter = search.trim() !== '' || pricingFilter !== '';

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

  function requestDeactivate(id: string) {
    setDeactivateError(null);
    setPendingDeactivateId(id);
  }

  function cancelDeactivate() {
    setPendingDeactivateId(null);
    setDeactivateError(null);
  }

  function confirmDeactivate() {
    if (!pendingDeactivateId) return;
    setDeactivateError(null);
    deactivateMut.mutate(pendingDeactivateId, {
      onSuccess: () => {
        setPendingDeactivateId(null);
        setDeactivateError(null);
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'فشل تعطيل الخدمة';
        setDeactivateError(msg);
      },
    });
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 p-4 font-sans space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-100">الخدمات</h1>
          {services && (
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
              {activeCount} نشط
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          إضافة خدمة
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث: اسم الخدمة أو المورد..."
            className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pr-9 pl-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </div>
        <select
          value={pricingFilter}
          onChange={(e) => setPricingFilter(e.target.value as '' | 'FIXED' | 'COMMISSION')}
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        >
          <option value="">كل الأنواع</option>
          <option value="FIXED">ربح ثابت</option>
          <option value="COMMISSION">عمولة</option>
        </select>
        {hasActiveFilter ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setPricingFilter('');
            }}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            مسح
          </button>
        ) : null}
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
      ) : filteredServices.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
          لا توجد نتائج مطابقة للبحث
        </div>
      ) : (
        <ServicesTable services={filteredServices} onEdit={openEdit} onDeactivate={requestDeactivate} />
      )}

      <ServiceFormModal open={formOpen} onClose={closeForm} service={editingService} />

      {pendingDeactivateId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60" onClick={cancelDeactivate} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="تأكيد التعطيل"
            className="relative z-10 w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">تأكيد التعطيل</h2>
              <button
                type="button"
                onClick={cancelDeactivate}
                aria-label="إغلاق"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="text-sm leading-6 text-slate-300">
              سيتم تعطيل الخدمة{pendingService ? ` «${pendingService.name}»` : ''} ولن تظهر في القائمة النشطة. يمكن اعتبار هذا حذفاً ناعماً.
            </p>
            {deactivateError ? (
              <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
                {deactivateError}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDeactivate}
                disabled={deactivateMut.isPending}
                className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmDeactivate}
                disabled={deactivateMut.isPending}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {deactivateMut.isPending ? 'جاري التعطيل...' : 'تأكيد التعطيل'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
