import { Pencil, Trash2, Banknote } from 'lucide-react';
import type { Contact } from '../hooks/useContacts';
import { ContactBalanceBadge } from './ContactBalanceBadge';

type Props = {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onDeactivate: (id: string) => void;
  onQuickPay: (contact: Contact) => void;
};

const ROLE_LABEL: Record<Contact['role'], string> = {
  SUPPLIER: 'مورد',
  CUSTOMER: 'عميل',
  BOTH: 'مورد وعميل',
};

function getQuickPayPreset(contact: Contact): 'PAYMENT_IN' | 'PAYMENT_OUT' {
  const supplierAcc = contact.accounts.find((a) => a.role === 'SUPPLIER');
  const customerAcc = contact.accounts.find((a) => a.role === 'CUSTOMER');
  const supplierNonZero = supplierAcc ? Math.abs(Number(supplierAcc.currentBalance)) >= 0.005 : false;
  const customerNonZero = customerAcc ? Math.abs(Number(customerAcc.currentBalance)) >= 0.005 : false;
  if (customerNonZero && !supplierNonZero) return 'PAYMENT_IN';
  if (supplierNonZero && !customerNonZero) return 'PAYMENT_OUT';
  if (customerNonZero && supplierNonZero) return 'PAYMENT_IN';
  if (supplierNonZero) return 'PAYMENT_OUT';
  return 'PAYMENT_IN';
}

export function ContactsTable({ contacts, onEdit, onDeactivate, onQuickPay }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="px-3 py-2.5 text-right font-semibold">الاسم</th>
              <th className="px-3 py-2.5 text-right font-semibold">الهاتف</th>
              <th className="px-3 py-2.5 text-right font-semibold">الدور</th>
              <th className="px-3 py-2.5 text-right font-semibold">رصيد المورد</th>
              <th className="px-3 py-2.5 text-right font-semibold">رصيد العميل</th>
              <th className="px-3 py-2.5 text-right font-semibold">الحالة</th>
              <th className="px-3 py-2.5 text-center font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const supplierAcc = c.accounts.find((a) => a.role === 'SUPPLIER');
              const customerAcc = c.accounts.find((a) => a.role === 'CUSTOMER');
              const isInactive = !c.isActive;
              const hasNonZeroBalance = c.accounts.some((a) => Math.abs(Number(a.currentBalance)) >= 0.005);
              const showQuickPay = c.isActive && hasNonZeroBalance;
              const preset = getQuickPayPreset(c);
              const quickPayLabel = preset === 'PAYMENT_IN' ? 'تحصيل مالي' : 'دفـع مالي';
              const quickPayClass =
                preset === 'PAYMENT_IN'
                  ? 'inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20'
                  : 'inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/20';
              return (
                <tr
                  key={c.id}
                  className={`border-t border-slate-800/80 ${isInactive ? 'opacity-50' : 'hover:bg-slate-800/40'}`}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-100">{c.name}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300" dir="ltr">
                    {c.phone ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{ROLE_LABEL[c.role]}</td>
                  <td className="px-3 py-2.5">
                    {supplierAcc ? (
                      <ContactBalanceBadge balance={supplierAcc.currentBalance} role="SUPPLIER" />
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {customerAcc ? (
                      <ContactBalanceBadge balance={customerAcc.currentBalance} role="CUSTOMER" />
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.isActive ? (
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
                        onClick={() => onEdit(c)}
                        aria-label={`تعديل ${c.name}`}
                        title="تعديل"
                        className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {c.isActive && (
                        <button
                          type="button"
                          onClick={() => onDeactivate(c.id)}
                          aria-label={`تعطيل ${c.name}`}
                          title="تعطيل"
                          className="rounded-md p-2 text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {showQuickPay && (
                        <button
                          type="button"
                          onClick={() => onQuickPay(c)}
                          aria-label={`${quickPayLabel} ${c.name}`}
                          title={quickPayLabel}
                          className={quickPayClass}
                        >
                          <Banknote className="h-4 w-4" aria-hidden="true" />
                          <span className="text-xs">{quickPayLabel}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
