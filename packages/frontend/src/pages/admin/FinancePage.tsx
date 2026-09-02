import { useState } from 'react';
import { TreasuryPage } from '@/pages/TreasuryPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { Wallet, CreditCard } from 'lucide-react';

type TabId = 'cash' | 'expenses';

export function FinancePage() {
  const [activeTab, setActiveTab] = useState<TabId>('cash');

  return (
    <div dir="rtl" className="font-sans space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">المالية</h1>
        <span className="text-xs text-slate-500">الصندوق والمصاريف</span>
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('cash')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'cash'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          الصندوق النقدي
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'expenses'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          المصاريف
        </button>
      </div>

      <div className="pt-2">
        {activeTab === 'cash' ? <TreasuryPage /> : <ExpensesPage />}
      </div>
    </div>
  );
}
