import { Pencil, Trash2, ArrowUpDown, ScanBarcode } from 'lucide-react';
import Decimal from 'decimal.js';
import type { Item } from '../hooks/useInventory';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { StockBadge } from './StockBadge';

/** Decimal-compliant display: 2dp + thousand separators (string grouping only). */
function formatPrice(v: string | number | undefined | null): string {
  try {
    const fixed = new Decimal(v ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    const parts = fixed.split('.');
    return `${(parts[0] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${parts[1] ?? '00'}`;
  } catch {
    return '0.00';
  }
}

type Props = {
  items: Item[];
  onEdit: (item: Item) => void;
  onStock: (item: Item) => void;
  onDeactivate: (id: string) => void;
  onPrintLabel: (item: Item) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  /** CASHIER safeguard: mask wholesale purchase cost (backend sends 'MASKED'). */
  hideCosts?: boolean;
};

function ItemRow({
  item,
  onEdit,
  onStock,
  onDeactivate,
  onPrintLabel,
  selected,
  onToggleSelect,
  hideCosts,
}: {
  item: Item;
  onEdit: (i: Item) => void;
  onStock: (i: Item) => void;
  onDeactivate: (id: string) => void;
  onPrintLabel: (i: Item) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  hideCosts: boolean;
}) {
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const stock = item.currentStock ?? 0;
  const minStock = item.minStock ?? 0;
  const isInactive = !item.isActive;

  return (
    <tr
      className={`border-t border-navy-border/30 ${isInactive ? 'opacity-50' : 'hover:bg-navy-800/40'}`}
    >
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          aria-label={`تحديد ${item.name}`}
          className="h-4 w-4 rounded accent-cyan-500"
        />
      </td>
      <td className="px-3 py-2.5 font-medium text-slate-100">{item.name}</td>
      <td className="px-3 py-2.5 font-mono text-slate-300" dir="ltr">
        {item.sku ?? '—'}
      </td>
      <td className="px-3 py-2.5 font-mono font-bold text-white" dir="ltr">
        {hideCosts || item.costPrice === 'MASKED' ? '•••' : <>{formatPrice(item.costPrice)} {currencySymbol}</>}
      </td>
      <td className="px-3 py-2.5 font-mono font-bold text-white" dir="ltr">
        {formatPrice(item.sellingPrice)} {currencySymbol}
      </td>
      <td className="px-3 py-2.5">
        <StockBadge currentStock={stock} minStock={minStock} />
      </td>
      <td className="px-3 py-2.5">
        {item.isActive ? (
          <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            نشط
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
            غير نشط
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(item)}
            aria-label={`تعديل ${item.name}`}
            title="تعديل"
            className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onStock(item)}
            aria-label={`حركة ${item.name}`}
            title="حركة مخزون"
            className="rounded-md p-2 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
          >
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onPrintLabel(item)}
            aria-label={`طباعة ملصق ${item.name}`}
            title="طباعة ملصق"
            className="rounded-md p-2 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
          >
            <ScanBarcode className="h-4 w-4" aria-hidden="true" />
          </button>
          {item.isActive && (
            <button
              type="button"
              onClick={() => onDeactivate(item.id)}
              aria-label={`تعطيل ${item.name}`}
              title="تعطيل"
              className="rounded-md p-2 text-rose-400 hover:bg-rose-500/10"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function ItemsTable({ items, onEdit, onStock, onDeactivate, onPrintLabel, selectedIds, onToggleSelect, onToggleSelectAll, hideCosts = false }: Props) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.includes(i.id));
  return (
    <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60 backdrop-blur-md">
      <div className="overflow-x-auto scrollbar-premium">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-navy-border/40 text-slate-400">
              <th className="px-3 py-2.5 text-right font-semibold">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  aria-label="تحديد الكل"
                  className="h-4 w-4 rounded accent-cyan-500"
                />
              </th>
              <th className="px-3 py-2.5 text-right font-semibold">الاسم</th>
              <th className="px-3 py-2.5 text-right font-semibold">SKU</th>
              <th className="px-3 py-2.5 text-right font-semibold">{hideCosts ? 'سعر التكلفة (مخفي)' : 'سعر التكلفة'}</th>
              <th className="px-3 py-2.5 text-right font-semibold">سعر البيع</th>
              <th className="px-3 py-2.5 text-right font-semibold">المخزون الحالي</th>
              <th className="px-3 py-2.5 text-right font-semibold">الحالة</th>
              <th className="px-3 py-2.5 text-center font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onEdit={onEdit}
                onStock={onStock}
                onDeactivate={onDeactivate}
                onPrintLabel={onPrintLabel}
                selected={selectedIds.includes(item.id)}
                onToggleSelect={onToggleSelect}
                hideCosts={hideCosts}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
