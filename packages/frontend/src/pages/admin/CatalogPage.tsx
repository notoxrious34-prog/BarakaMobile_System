import { useState } from 'react';
import { BrandMark } from '@/components/layout/BrandMark';
import { InventoryPage } from '@/pages/InventoryPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { Package, Zap } from 'lucide-react';

type TabId = 'products' | 'services';

const TABS: { id: TabId; label: string; Icon: typeof Package }[] = [
  { id: 'products', label: 'المنتجات والمخزون', Icon: Package },
  { id: 'services', label: 'الخدمات', Icon: Zap },
];

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<TabId>('products');

  return (
    <div dir="rtl" className="font-sans space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div>
            <h1 className="text-xl font-bold text-slate-100">الكتالوج</h1>
            <p className="text-xs text-slate-500">المنتجات والخدمات</p>
          </div>
        </div>
      </div>

      <div
        className="inline-flex gap-2 rounded-2xl border border-navy-800/80 bg-navy-900/80 p-1.5 backdrop-blur-md"
        role="tablist"
        aria-label="أقسام الكتالوج"
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                active
                  ? 'border border-amber-500/30 bg-navy-800 text-amber-400 shadow-lg shadow-amber-500/5'
                  : 'border border-transparent text-slate-400 hover:bg-navy-800/50 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="pt-2">
        {activeTab === 'products' ? <InventoryPage /> : <ServicesPage />}
      </div>
    </div>
  );
}
