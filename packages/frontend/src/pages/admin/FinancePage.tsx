import { useState } from 'react';
import { TreasuryPage } from '@/pages/TreasuryPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { Wallet, Receipt } from 'lucide-react';

type TabId = 'cash' | 'expenses';

/**
 * TB-080 Finance cockpit shell — luxury pill sub-nav (AD-57):
 * active amber-on-navy, inactive slate with navy hover.
 */
export function FinancePage() {
  const [activeTab, setActiveTab] = useState<TabId>('cash');

  const tabs: { id: TabId; label: string; Icon: typeof Wallet }[] = [
    { id: 'cash', label: 'الصندوق النقدي', Icon: Wallet },
    { id: 'expenses', label: 'المصاريف', Icon: Receipt },
  ];

  return (
    <div dir="rtl" className="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3 font-sans">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-1">
        <h1 className="text-base font-bold tracking-tight text-slate-100">المالية</h1>
        <span className="text-[11px] text-slate-500">الصندوق والمصاريف</span>
      </div>

      <div className="shrink-0">
        <div
          className="inline-flex gap-2 rounded-2xl border border-navy-800/80 bg-navy-900/80 p-1.5 backdrop-blur-md"
          role="tablist"
          aria-label="أقسام المالية"
        >
          {tabs.map(({ id, label, Icon }) => {
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
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === 'cash' ? <TreasuryPage /> : <ExpensesPage />}
      </div>
    </div>
  );
}
