import { Pencil, Trash2 } from 'lucide-react';
import type { Contact } from '../hooks/useContacts';
import { ContactBalanceBadge } from './ContactBalanceBadge';

type Props = {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onDeactivate: (id: string) => void;
};

const ROLE_LABEL: Record<Contact['role'], string> = {
  SUPPLIER: 'مورد',
  CUSTOMER: 'عميل',
  BOTH: 'مورد وعميل',
};

export function ContactsTable({ contacts, onEdit, onDeactivate }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-zinc-50 text-zinc-600">
              <th className="px-4 py-3 text-right font-semibold">الاسم</th>
              <th className="px-4 py-3 text-right font-semibold">الهاتف</th>
              <th className="px-4 py-3 text-right font-semibold">الدور</th>
              <th className="px-4 py-3 text-right font-semibold">رصيد المورد</th>
              <th className="px-4 py-3 text-right font-semibold">رصيد العميل</th>
              <th className="px-4 py-3 text-right font-semibold">الحالة</th>
              <th className="px-4 py-3 text-center font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const supplierAcc = c.accounts.find((a) => a.role === 'SUPPLIER');
              const customerAcc = c.accounts.find((a) => a.role === 'CUSTOMER');
              const isInactive = !c.isActive;
              return (
                <tr
                  key={c.id}
                  className={`border-t border-zinc-100 ${isInactive ? 'bg-zinc-50 opacity-60' : 'bg-white hover:bg-zinc-50'}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-900">{c.name}</td>
                  <td className="px-4 py-3 text-zinc-700" dir="ltr">
                    {c.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{ROLE_LABEL[c.role]}</td>
                  <td className="px-4 py-3">
                    {supplierAcc ? (
                      <ContactBalanceBadge balance={supplierAcc.currentBalance} role="SUPPLIER" />
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {customerAcc ? (
                      <ContactBalanceBadge balance={customerAcc.currentBalance} role="CUSTOMER" />
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.isActive ? (
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
                        onClick={() => onEdit(c)}
                        aria-label={`تعديل ${c.name}`}
                        title="تعديل"
                        className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {c.isActive && (
                        <button
                          type="button"
                          onClick={() => onDeactivate(c.id)}
                          aria-label={`تعطيل ${c.name}`}
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
