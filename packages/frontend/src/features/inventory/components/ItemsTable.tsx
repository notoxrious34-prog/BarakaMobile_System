import { Pencil, Trash2, ArrowUpDown } from 'lucide-react';
import type { Item } from '../hooks/useInventory';
import { useItemStockQuery } from '../hooks/useInventory';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';
import { StockBadge } from './StockBadge';

type Props = {
  items: Item[];
  onEdit: (item: Item) => void;
  onStock: (item: Item) => void;
  onDeactivate: (id: string) => void;
};

function ItemRow({
  item,
  onEdit,
  onStock,
  onDeactivate,
}: {
  item: Item;
  onEdit: (i: Item) => void;
  onStock: (i: Item) => void;
  onDeactivate: (id: string) => void;
}) {
  const { data: stockData, isLoading } = useItemStockQuery(item.id);
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const stock = stockData?.currentStock ?? item.currentStock ?? 0;
  const isInactive = !item.isActive;

  return (
    <tr
      className={`border-t border-zinc-100 ${isInactive ? 'bg-zinc-50 opacity-60' : 'bg-white hover:bg-zinc-50'}`}
    >
      <td className="px-4 py-3 font-medium text-zinc-900">{item.name}</td>
      <td className="px-4 py-3 text-zinc-600" dir="ltr">
        {item.sku ?? '—'}
      </td>
      <td className="px-4 py-3 text-zinc-700" dir="ltr">
        {Number(item.costPrice).toFixed(2)} {currencySymbol}
      </td>
      <td className="px-4 py-3 text-zinc-700" dir="ltr">
        {Number(item.sellingPrice).toFixed(2)} {currencySymbol}
      </td>
      <td className="px-4 py-3">
        {isLoading ? (
          <span className="text-xs text-zinc-400">…</span>
        ) : (
          <StockBadge stock={stock} />
        )}
      </td>
      <td className="px-4 py-3">
        {item.isActive ? (
          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            نشط
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-500/20">
            غير نشط
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(item)}
            aria-label={`تعديل ${item.name}`}
            title="تعديل"
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onStock(item)}
            aria-label={`حركة ${item.name}`}
            title="حركة مخزون"
            className="rounded-md p-2 text-blue-600 hover:bg-blue-50 hover:text-blue-800"
          >
            <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
          </button>
          {item.isActive && (
            <button
              type="button"
              onClick={() => onDeactivate(item.id)}
              aria-label={`تعطيل ${item.name}`}
              title="تعطيل"
              className="rounded-md p-2 text-red-500 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function ItemsTable({ items, onEdit, onStock, onDeactivate }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-zinc-600">
              <th className="px-4 py-3 text-right font-semibold">الاسم</th>
              <th className="px-4 py-3 text-right font-semibold">SKU</th>
              <th className="px-4 py-3 text-right font-semibold">سعر التكلفة</th>
              <th className="px-4 py-3 text-right font-semibold">سعر البيع</th>
              <th className="px-4 py-3 text-right font-semibold">المخزون الحالي</th>
              <th className="px-4 py-3 text-right font-semibold">الحالة</th>
              <th className="px-4 py-3 text-center font-semibold">الإجراءات</th>
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
