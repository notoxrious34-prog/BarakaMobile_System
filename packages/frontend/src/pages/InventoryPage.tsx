import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import {
  useItemsQuery,
  useDeactivateItemMutation,
  type Item,
} from '@/features/inventory/hooks/useInventory';
import { ItemsTable } from '@/features/inventory/components/ItemsTable';
import { ItemFormModal } from '@/features/inventory/components/ItemFormModal';
import { StockMovementModal } from '@/features/inventory/components/StockMovementModal';

export function InventoryPage() {
  const { data: items, isLoading, isError, error, refetch } = useItemsQuery();
  const deactivateMut = useDeactivateItemMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [movementItem, setMovementItem] = useState<Item | null>(null);

  const activeCount = items ? items.filter((i) => i.isActive).length : 0;

  function openCreate() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEdit(item: Item) {
    setEditingItem(item);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingItem(null);
  }

  function openStock(item: Item) {
    setMovementItem(item);
  }

  function closeStock() {
    setMovementItem(null);
  }

  function handleDeactivate(id: string) {
    const confirmed = window.confirm('هل أنت متأكد من تعطيل هذا المنتج؟');
    if (!confirmed) return;
    deactivateMut.mutate(id, {
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : 'فشل تعطيل المنتج';
        window.alert(msg);
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900">المخزون</h1>
          {items && (
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
          إضافة منتج
        </button>
      </div>

      {isLoading ? (
        <Loading text="جاري تحميل المنتجات..." />
      ) : isError ? (
        <ErrorState
          title="تعذر تحميل المخزون"
          message={error instanceof Error ? error.message : 'حدث خطأ أثناء جلب البيانات'}
          onRetry={() => refetch()}
        />
      ) : !items || items.length === 0 ? (
        <EmptyState title="لا توجد منتجات" message="ابدأ بإضافة منتج جديد." />
      ) : (
        <ItemsTable
          items={items}
          onEdit={openEdit}
          onStock={openStock}
          onDeactivate={handleDeactivate}
        />
      )}

      <ItemFormModal open={formOpen} onClose={closeForm} item={editingItem} />
      <StockMovementModal open={!!movementItem} onClose={closeStock} item={movementItem} />
    </div>
  );
}
