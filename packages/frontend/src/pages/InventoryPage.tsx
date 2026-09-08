import { useState, useMemo } from 'react';
import { Plus, Search, ScanBarcode } from 'lucide-react';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import {
  useItemsQuery,
  useDeactivateItemMutation,
  type Item,
} from '@/features/inventory/hooks/useInventory';
import { ItemsTable } from '@/features/inventory/components/ItemsTable';
import { BarcodePrintModal, type LabelQueueEntry } from '@/features/inventory/components/barcode/BarcodePrintModal';
import { useCapability } from '@/features/auth/AuthContext';
import { ItemFormModal } from '@/features/inventory/components/ItemFormModal';
import { StockMovementModal } from '@/features/inventory/components/StockMovementModal';

type StockFilter = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

const STOCK_FILTER_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: 'ALL', label: 'الكل' },
  { value: 'IN_STOCK', label: 'متوفر' },
  { value: 'LOW_STOCK', label: 'مخزون منخفض' },
  { value: 'OUT_OF_STOCK', label: 'نفذ من المخزون' },
];

function getStockTier(item: Item): 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' {
  const currentStock = item.currentStock ?? 0;
  const minStock = item.minStock ?? 0;
  if (currentStock <= 0) return 'OUT_OF_STOCK';
  if (minStock > 0 && currentStock <= minStock) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function InventoryPage() {
  const { data: items, isLoading, isError, error, refetch } = useItemsQuery();
  const deactivateMut = useDeactivateItemMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [movementItem, setMovementItem] = useState<Item | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [labelQueue, setLabelQueue] = useState<LabelQueueEntry[] | null>(null);
  const canViewCosts = useCapability('canViewCosts');

  const activeCount = items ? items.filter((i) => i.isActive).length : 0;

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        q === '' ||
        item.name.toLowerCase().includes(q) ||
        (item.sku ?? '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (stockFilter === 'ALL') return true;
      const tier = getStockTier(item);
      return tier === stockFilter;
    });
  }, [items, searchQuery, stockFilter]);

  const hasItems = items !== undefined && items.length > 0;
  const hasFilteredResults = filteredItems.length > 0;

  const toggleSelect = (id: string) =>
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleSelectAll = () =>
    setSelectedIds((s) => {
      const visible = filteredItems.map((i) => i.id);
      const allVisible = visible.length > 0 && visible.every((id) => s.includes(id));
      return allVisible ? s.filter((id) => !visible.includes(id)) : [...new Set([...s, ...visible])];
    });
  const selectedItems = useMemo(
    () => (items ?? []).filter((i) => selectedIds.includes(i.id)),
    [items, selectedIds],
  );
  const openBatchLabels = () =>
    setLabelQueue(selectedItems.map((item) => ({ item, quantity: 1 })));

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
    <div dir="rtl" className="font-sans space-y-4 text-slate-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-100">المخزون</h1>
          {items && (
            <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
              {activeCount} نشط
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 shadow-lg shadow-cyan-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          إضافة منتج
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-navy-border/40 bg-navy-900/60 backdrop-blur-md p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو SKU"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-2 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 transition-colors"
          />
        </div>
        <select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value as StockFilter)}
          className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 sm:w-48 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 transition-colors"
        >
          {STOCK_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Loading text="جاري تحميل المنتجات..." />
      ) : isError ? (
        <ErrorState
          title="تعذر تحميل المخزون"
          message={error instanceof Error ? error.message : 'حدث خطأ أثناء جلب البيانات'}
          onRetry={() => refetch()}
        />
      ) : !hasItems ? (
        <EmptyState title="لا توجد منتجات" message="ابدأ بإضافة منتج جديد." />
      ) : !hasFilteredResults ? (
        <EmptyState title="لا توجد نتائج" message="جرّب تعديل كلمة البحث أو الفلتر." />
      ) : (
        <ItemsTable
          items={filteredItems}
          onEdit={openEdit}
          onStock={openStock}
          onDeactivate={handleDeactivate}
          onPrintLabel={(item) => setLabelQueue([{ item, quantity: 1 }])}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          hideCosts={!canViewCosts}
        />
      )}

      {selectedItems.length > 0 && (
        <div className="sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-3 rounded-2xl border border-cyan-500/30 bg-navy-900/95 px-4 py-2.5 shadow-2xl shadow-cyan-500/10 backdrop-blur-md">
          <span className="text-xs font-bold text-slate-200">{selectedItems.length} مادة محددة</span>
          <button
            type="button"
            onClick={openBatchLabels}
            className="inline-flex items-center gap-1 rounded-xl bg-cyan-600 px-4 py-1.5 text-xs font-extrabold text-white hover:bg-cyan-500"
          >
            <ScanBarcode className="h-4 w-4" /> طباعة باركود
          </button>
          <button type="button" onClick={() => setSelectedIds([])} className="text-xs text-slate-400 hover:text-slate-200">مسح التحديد</button>
        </div>
      )}

      {labelQueue && (
        <BarcodePrintModal open={!!labelQueue} onClose={() => setLabelQueue(null)} initialQueue={labelQueue} />
      )}

      <ItemFormModal open={formOpen} onClose={closeForm} item={editingItem} />
      <StockMovementModal open={!!movementItem} onClose={closeStock} item={movementItem} />
    </div>
  );
}
