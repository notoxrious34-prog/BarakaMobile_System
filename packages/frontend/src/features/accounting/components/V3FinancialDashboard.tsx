import { useState } from 'react';
import {
  useV3BalanceSheetQuery,
  useV3CoaQuery,
  useV3IncomeStatementQuery,
  useV3TrialBalanceQuery,
} from '../api/accountingV3Hooks';
import { checkBalanceEquation } from '../utils/v3StatementChecks';
import { V3ClosePeriodModal } from './V3ClosePeriodModal';

/**
 * DIRECTIVE-023 Stage 10.4 — financial statements dashboard.
 *
 * COA matrix with live balances, trial-balance grid with the
 * ΣDr ≡ ΣCr badge, P&L breakdown (revenues / COGS / gross / expenses /
 * net), balance-sheet groups with an independently recomputed
 * Assets ≡ Liabilities + Equity banner, and the guarded period-close
 * entry point. Purely additive — the legacy ReportsPage is untouched.
 */
function Money({ value }: { value: string }) {
  return (
    <span dir="ltr" className="font-mono">
      {value}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-navy-border/40 bg-navy-900/60 p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function V3FinancialDashboard() {
  const [asOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [range] = useState(() => ({
    startDate: `${new Date().getFullYear()}-01-01`,
    endDate: `${new Date().getFullYear()}-12-31`,
  }));
  const [closeTarget, setCloseTarget] = useState<{ id: string; name: string } | null>(null);

  const coa = useV3CoaQuery();
  const trial = useV3TrialBalanceQuery({ asOfDate: asOf });
  const pnl = useV3IncomeStatementQuery(range);
  const sheet = useV3BalanceSheetQuery({ asOfDate: asOf });

  const equation = sheet.data
    ? checkBalanceEquation(sheet.data.totalAssets, sheet.data.totalLiabilities, sheet.data.totalEquity)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Section title="دليل الحسابات (COA)">
        {coa.isLoading && <p className="text-slate-400">جارٍ التحميل…</p>}
        {coa.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1 text-right">الرمز</th>
                  <th className="py-1 text-right">الاسم</th>
                  <th className="py-1 text-right">الصنف</th>
                  <th className="py-1 text-left">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {coa.data.map((a) => (
                  <tr key={a.accountCode} className="border-t border-navy-border/30">
                    <td className="py-1 font-mono" dir="ltr">{a.accountCode}</td>
                    <td className="py-1">{a.name}</td>
                    <td className="py-1 text-slate-400">{a.type}</td>
                    <td className="py-1 text-left"><Money value={a.netBalance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="ميزان المراجعة">
        {trial.data && (
          <div className="flex flex-col gap-2">
            <span className={`self-start rounded-full border px-3 py-0.5 text-xs font-bold ${trial.data.isBalanced ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`}>
              {trial.data.isBalanced ? 'ΣDr ≡ ΣCr — متوازن' : `غير متوازن: ${trial.data.imbalanceAmount}`}
            </span>
            <div className="flex justify-between font-mono text-sm" dir="ltr">
              <span>Dr {trial.data.totalDebits}</span>
              <span>Cr {trial.data.totalCredits}</span>
            </div>
          </div>
        )}
      </Section>

      <Section title="قائمة الدخل (P&L)">
        {pnl.data && (
          <div className="flex flex-col gap-1 font-mono text-sm" dir="ltr">
            <div className="flex justify-between"><span className="font-sans text-slate-400">الإيرادات</span><span>{pnl.data.totalRevenue}</span></div>
            <div className="flex justify-between"><span className="font-sans text-slate-400">تكلفة البضاعة</span><span>{pnl.data.totalCogs}</span></div>
            <div className="flex justify-between font-bold"><span className="font-sans font-normal text-slate-300">هامش الربح</span><span>{pnl.data.grossProfit}</span></div>
            <div className="flex justify-between"><span className="font-sans text-slate-400">المصاريف التشغيلية</span><span>{pnl.data.totalExpenses}</span></div>
            <div className="flex justify-between border-t border-navy-border/40 pt-1 font-bold"><span className="font-sans font-normal">صافي الربح</span><span>{pnl.data.netIncome}</span></div>
          </div>
        )}
      </Section>

      <Section title="الميزانية العمومية">
        {sheet.data && equation && (
          <div className="flex flex-col gap-2">
            <span className={`self-start rounded-full border px-3 py-0.5 text-xs font-bold ${equation.balanced ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`}>
              {equation.balanced
                ? `الأصول (${equation.totalAssets}) ≡ الخصوم + الحقوق (${equation.totalLiabilities} + ${equation.totalEquity})`
                : 'المعادلة مختلة — راجع القيود'}
            </span>
            <div className="flex flex-col gap-1 font-mono text-sm" dir="ltr">
              <div className="flex justify-between"><span className="font-sans text-slate-400">الأصول</span><span>{sheet.data.totalAssets}</span></div>
              <div className="flex justify-between"><span className="font-sans text-slate-400">الخصوم</span><span>{sheet.data.totalLiabilities}</span></div>
              <div className="flex justify-between"><span className="font-sans text-slate-400">الحقوق + الأرباح المحتجزة + الجاري</span><span>{sheet.data.totalEquity}</span></div>
            </div>
            {sheet.data.periodId && (
              <button
                onClick={() => setCloseTarget({ id: sheet.data.periodId as string, name: sheet.data.periodName ?? '' })}
                className="self-start rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white"
              >
                إغلاق الفترة المالية
              </button>
            )}
          </div>
        )}
      </Section>

      {closeTarget && (
        <V3ClosePeriodModal periodId={closeTarget.id} periodName={closeTarget.name} onClose={() => setCloseTarget(null)} />
      )}
    </div>
  );
}
