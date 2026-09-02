import { Pencil, Trash2, ArrowUpDown } from 'lucide-react';
import type { Item } from '../hooks/useInventory';
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
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';
  const stock = item.currentStock ?? 0;
  const minStock = item.minStock ?? 0;
  const isInactive = !item.isActive;

  return (
    <tr
      className={`border-t border-slate-800/80 ${isInactive ? 'opacity-50' : 'hover:bg-slate-800/40'}`}
    >
      <td className="px-3 py-2.5 font-medium text-slate-100">{item.name}</td>
      <td className="px-3 py-2.5 font-mono text-slate-300" dir="ltr">
        {item.sku ?? '—'}
      </td>
      <td className="px-3 py-2.5 font-mono text-slate-300" dir="ltr">
        {Number(item.costPrice).toFixed(2)} {currencySymbol}
      </td>
      <td className="px-3 py-2.5 font-mono text-slate-300" dir="ltr">
        {Number(item.sellingPrice).toFixed(2)} {currencySymbol}
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

export function ItemsTable({ items, onEdit, onStock, onDeactivate }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="px-3 py-2.5 text-right font-semibold">الاسم</th>
              <th className="px-3 py-2.5 text-right font-semibold">SKU</th>
              <th className="px-3 py-2.5 text-right font-semibold">سعر التكلفة</th>
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
