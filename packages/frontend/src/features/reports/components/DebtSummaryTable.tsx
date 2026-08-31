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

function getNetPositionTone(value: string): string {
  const n = Number(value);
  if (n > 0) return 'text-emerald-700';
  if (n < 0) return 'text-red-700';
  return 'text-zinc-600';
}

function getNetDebtTone(value: string): string {
  const n = Number(value);
  if (n > 0) return 'text-emerald-700';
  if (n < 0) return 'text-red-700';
  return 'text-zinc-600';
}

export function DebtSummaryTable({ data, onViewLedger }: Props) {
  const netDebtTone = getNetDebtTone(data.netDebtPosition);
  const { data: settingsData } = useInvoiceSettings();
  const currencySymbol = settingsData?.currency_symbol ?? 'د.ج';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">إجمالي المستحقات</p>
          <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">
            {Number(data.totalReceivables).toFixed(2)} {currencySymbol}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">إجمالي الالتزامات</p>
          <p className="mt-1 text-lg font-bold text-zinc-900" dir="ltr">
            {Number(data.totalPayables).toFixed(2)} {currencySymbol}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-zinc-500">صافي المركز المالي</p>
          <p className={`mt-1 text-lg font-bold ${netDebtTone}`} dir="ltr">
            {Number(data.netDebtPosition).toFixed(2)} {currencySymbol}
          </p>
        </div>
      </div>

      {data.topDebtors && data.topDebtors.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">أكبر المدينين (العملاء)</h3>
          <ol className="space-y-2">
            {data.topDebtors.map((d, idx) => (
              <li key={d.contactId} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{idx + 1}</span>
                  <span className="text-sm font-medium text-zinc-900">{d.contactName}</span>
                </span>
                <span className="text-sm font-bold text-zinc-900" dir="ltr">
                  {Number(d.currentBalance).toFixed(2)} {currencySymbol}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.topCreditors && data.topCreditors.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">أكبر الدائنين (الموردين)</h3>
          <ol className="space-y-2">
            {data.topCreditors.map((d, idx) => (
              <li key={d.contactId} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">{idx + 1}</span>
                  <span className="text-sm font-medium text-zinc-900">{d.contactName}</span>
                </span>
                <span className="text-sm font-bold text-zinc-900" dir="ltr">
                  {Number(d.currentBalance).toFixed(2)} {currencySymbol}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-50 text-zinc-600">
                <th className="px-4 py-3 text-right font-semibold">جهة الاتصال</th>
                <th className="px-4 py-3 text-right font-semibold">الدور</th>
                <th className="px-4 py-3 text-right font-semibold">رصيد المورد</th>
                <th className="px-4 py-3 text-right font-semibold">رصيد العميل</th>
                <th className="px-4 py-3 text-right font-semibold">المركز الصافي</th>
                <th className="px-4 py-3 text-center font-semibold">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data.contacts.map((c) => (
                <tr key={c.contactId} className="border-t border-zinc-100 bg-white hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{c.contactName}</td>
                  <td className="px-4 py-3 text-zinc-700">{ROLE_LABEL[c.contactRole] ?? c.contactRole}</td>
                  <td className="px-4 py-3 text-zinc-700" dir="ltr">
                    {c.supplierAccount ? `${Number(c.supplierAccount.currentBalance).toFixed(2)} ${currencySymbol}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-700" dir="ltr">
                    {c.customerAccount ? `${Number(c.customerAccount.currentBalance).toFixed(2)} ${currencySymbol}` : '—'}
                  </td>
                  <td className={`px-4 py-3 font-medium ${getNetPositionTone(c.netPosition)}`} dir="ltr">
                    {Number(c.netPosition).toFixed(2)} {currencySymbol}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {c.customerAccount && (
                        <button
                          type="button"
                          onClick={() => onViewLedger(c.customerAccount!.accountId, c.contactName, 'CUSTOMER')}
                          aria-label={`عرض كشف ${c.contactName} عميل`}
                          title="عرض كشف العميل"
                          className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
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
                          className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
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
