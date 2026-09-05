import Decimal from 'decimal.js';
import type { DebtSummaryResponse } from '../hooks/useReports';
import { useInvoiceSettings } from '@/features/settings/hooks/useInvoiceSettings';

type Props = {
  data: DebtSummaryResponse;
  onViewLedger: (accountId: string, contactName: string, role: string) => void;
};

const ROLE_LABEL: Record<string, string> = {
  SUPPLIER: 'مورد',
  CUSTOMER: 'عميل',
  BOTH: 'مورد وعميل',
};

const fmt = (v?: string | null) => {
  if (!v) return '0.00';
  try {
    return new Decimal(v).toFixed(2);
  } catch {
    return '0.00';
  }
};

function getNetPositionTone(value: string): string {
  try {
    const d = new Decimal(value || '0');
    if (d.gt(0)) return 'text-emerald-400';
    if (d.lt(0)) return 'text-rose-400';
    return 'text-slate-400';
  } catch {
    return 'text-slate-400';
  }
}

function getNetDebtTone(value: string): string {
  try {
    const d = new Decimal(value || '0');
    if (d.gt(0)) return 'text-emerald-400';
    if (d.lt(0)) return 'text-rose-400';
    return 'text-slate-400';
  } catch {
    return 'text-slate-400';
  }
}

export function DebtSummaryTable({ data, onViewLedger }: Props) {
  const netDebtTone = getNetDebtTone(data.netDebtPosition);
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-400">إجمالي المستحقات</p>
          <p className="mt-1 text-lg font-bold font-mono text-emerald-400" dir="ltr">
            {fmt(data.totalReceivables)} {currencySymbol}
          </p>
        </div>
        <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-400">إجمالي الالتزامات</p>
          <p className="mt-1 text-lg font-bold font-mono text-amber-400" dir="ltr">
            {fmt(data.totalPayables)} {currencySymbol}
          </p>
        </div>
        <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-400">صافي المركز المالي</p>
          <p className={`mt-1 text-lg font-bold font-mono ${netDebtTone}`} dir="ltr">
            {fmt(data.netDebtPosition)} {currencySymbol}
          </p>
        </div>
      </div>

      {data.topDebtors && data.topDebtors.length > 0 && (
        <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">أكبر المدينين (العملاء)</h3>
          <ol className="space-y-2">
            {data.topDebtors.map((d, idx) => (
              <li key={d.contactId} className="flex items-center justify-between rounded-lg bg-navy-950/60 px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-100">{d.contactName}</span>
                </span>
                <span className="text-sm font-bold font-mono text-slate-100" dir="ltr">
                  {fmt(d.currentBalance)} {currencySymbol}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.topCreditors && data.topCreditors.length > 0 && (
        <div className="rounded-2xl border border-navy-800 bg-navy-900/60 p-4 backdrop-blur-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-100">أكبر الدائنين (الموردين)</h3>
          <ol className="space-y-2">
            {data.topCreditors.map((d, idx) => (
              <li key={d.contactId} className="flex items-center justify-between rounded-lg bg-navy-950/60 px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-400 border border-amber-500/20">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-100">{d.contactName}</span>
                </span>
                <span className="text-sm font-bold font-mono text-slate-100" dir="ltr">
                  {fmt(d.currentBalance)} {currencySymbol}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-navy-800 bg-navy-900/60 backdrop-blur-sm">
        <div className="scrollbar-premium overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-navy-950/70 text-slate-300">
                <th className="px-3 py-2.5 text-right font-semibold">جهة الاتصال</th>
                <th className="px-3 py-2.5 text-right font-semibold">الدور</th>
                <th className="px-3 py-2.5 text-right font-semibold">رصيد المورد</th>
                <th className="px-3 py-2.5 text-right font-semibold">رصيد العميل</th>
                <th className="px-3 py-2.5 text-right font-semibold">المركز الصافي</th>
                <th className="px-3 py-2.5 text-center font-semibold">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data.contacts.map((c) => (
                <tr key={c.contactId} className="border-t border-navy-800/60 bg-navy-900/60 hover:bg-navy-800/40">
                  <td className="px-3 py-2.5 font-medium text-slate-100">{c.contactName}</td>
                  <td className="px-3 py-2.5 text-slate-300">{ROLE_LABEL[c.contactRole] ?? c.contactRole}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300" dir="ltr">
                    {c.supplierAccount ? `${fmt(c.supplierAccount.currentBalance)} ${currencySymbol}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-300" dir="ltr">
                    {c.customerAccount ? `${fmt(c.customerAccount.currentBalance)} ${currencySymbol}` : '—'}
                  </td>
                  <td className={`px-3 py-2.5 font-medium font-mono ${getNetPositionTone(c.netPosition)}`} dir="ltr">
                    {fmt(c.netPosition)} {currencySymbol}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {c.customerAccount && (
                        <button
                          type="button"
                          onClick={() => onViewLedger(c.customerAccount!.accountId, c.contactName, 'CUSTOMER')}
                          aria-label={`عرض كشف ${c.contactName} عميل`}
                          title="عرض كشف العميل"
                          className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20"
                        >
                          كشف العميل
                        </button>
                      )}
                      {c.supplierAccount && (
                        <button
                          type="button"
                          onClick={() => onViewLedger(c.supplierAccount!.accountId, c.contactName, 'SUPPLIER')}
                          aria-label={`عرض كشف ${c.contactName} مورد`}
                          title="عرض كشف المورد"
                          className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/20"
                        >
                          كشف المورد
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
