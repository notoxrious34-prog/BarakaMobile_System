import { Banknote, FileText, Pencil, Trash2 } from 'lucide-react';
import type { Contact } from '../hooks/useContacts';
import { ContactBalanceBadge } from './ContactBalanceBadge';
import { getQuickPayPreset } from '../utils/getQuickPayPreset';
import { isZeroBalance, roleLabel } from '../utils/contactLabels';

type Props = {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onDeactivate: (id: string) => void;
  onQuickPay: (contact: Contact) => void;
  onViewStatement: (accountId: string, contactName: string, role: string) => void;
};

/**
 * TB-074 — Deep Navy contacts table with 1-click statement (كشف الحساب)
 * per account. Single-account rows show one "كشف الحساب" button; BOTH
 * rows show separate customer/supplier statement buttons.
 */
export function ContactsTable({ contacts, onEdit, onDeactivate, onQuickPay, onViewStatement }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60">
      <div className="scrollbar-premium overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label="جدول جهات الاتصال">
          <thead>
            <tr className="border-b border-navy-border/30 text-xs text-slate-500">
              <th className="px-3 py-2 text-right font-bold">الاسم</th>
              <th className="px-3 py-2 text-right font-bold">الهاتف</th>
              <th className="px-3 py-2 text-right font-bold">الدور</th>
              <th className="px-3 py-2 text-right font-bold">رصيد المورد</th>
              <th className="px-3 py-2 text-right font-bold">رصيد العميل</th>
              <th className="px-3 py-2 text-right font-bold">الحالة</th>
              <th className="px-3 py-2 text-center font-bold">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const supplierAcc = c.accounts.find((a) => a.role === 'SUPPLIER');
              const customerAcc = c.accounts.find((a) => a.role === 'CUSTOMER');
              const isInactive = !c.isActive;
              const hasNonZeroBalance = c.accounts.some((a) => !isZeroBalance(a.currentBalance));
              const showQuickPay = c.isActive && hasNonZeroBalance;
              const preset = getQuickPayPreset(c);
              const quickPayLabel = preset === 'PAYMENT_IN' ? 'تحصيل مالي' : 'دفـع مالي';
              const quickPayClass =
                preset === 'PAYMENT_IN'
                  ? 'inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20'
                  : 'inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-xs font-bold text-rose-400 hover:bg-rose-500/20';
              const statements = [
                ...(customerAcc
                  ? [{ acc: customerAcc, label: supplierAcc ? 'كشف العميل' : 'كشف الحساب' }]
                  : []),
                ...(supplierAcc
                  ? [{ acc: supplierAcc, label: customerAcc ? 'كشف المورد' : 'كشف الحساب' }]
                  : []),
              ];
              return (
                <tr
                  key={c.id}
                  className={`border-t border-navy-border/20 ${isInactive ? 'opacity-50' : 'hover:bg-white/[0.03]'}`}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-100">{c.name}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300" dir="ltr">
                    {c.phone ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{roleLabel(c.role)}</td>
                  <td className="px-3 py-2.5">
                    {supplierAcc ? (
                      <ContactBalanceBadge balance={supplierAcc.currentBalance} role="SUPPLIER" />
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {customerAcc ? (
                      <ContactBalanceBadge balance={customerAcc.currentBalance} role="CUSTOMER" />
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.isActive ? (
                      <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                        نشط
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-navy-border/40 bg-white/[0.04] px-2.5 py-0.5 text-xs font-bold text-slate-400">
                        غير نشط
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(c)}
                        aria-label={`تعديل ${c.name}`}
                        title="تعديل"
                        className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {c.isActive && (
                        <button
                          type="button"
                          onClick={() => onDeactivate(c.id)}
                          aria-label={`تعطيل ${c.name}`}
                          title="تعطيل"
                          className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {statements.map((s) => (
                        <button
                          key={s.acc.id}
                          type="button"
                          onClick={() => onViewStatement(s.acc.id, c.name, s.acc.role)}
                          aria-label={`${s.label} — ${c.name}`}
                          title={s.label}
                          className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20"
                        >
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="text-xs">{s.label}</span>
                        </button>
                      ))}
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
