import { useState } from 'react';
import { InventoryPage } from '@/pages/InventoryPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { Package, Zap } from 'lucide-react';

type TabId = 'products' | 'services';

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<TabId>('products');

  return (
    <div dir="rtl" className="font-sans space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">الكتالوج</h1>
        <span className="text-xs text-slate-500">المنتجات والخدمات</span>
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'products'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="h-4 w-4" aria-hidden="true" />
          المنتجات والمخزون
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'services'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="h-4 w-4" aria-hidden="true" />
          الخدمات
        </button>
      </div>

      <div className="pt-2">
        {activeTab === 'products' ? <InventoryPage /> : <ServicesPage />}
      </div>
    </div>
  );
}
