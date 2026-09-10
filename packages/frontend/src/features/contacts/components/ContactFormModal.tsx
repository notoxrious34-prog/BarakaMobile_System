import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import {
  useCreateContactMutation,
  useUpdateContactMutation,
  type Contact,
  type ContactRole,
} from '../hooks/useContacts';
import { roleLabel } from '../utils/contactLabels';
import { OpeningBalanceSection, EMPTY_OPENING, type OpeningFormState } from './OpeningBalanceSection';
import {
  createCustomer,
  createSupplier,
  postCustomerOpeningBalance,
  postSupplierOpeningBalance,
} from '../api/counterpartyApi';
import { fetchDebtLedger, fetchSupplierLedger } from '../api/debtApi';

type Props = {
  open: boolean;
  onClose: () => void;
  contact?: Contact | null;
};

const ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
  { value: 'SUPPLIER', label: 'مورد' },
  { value: 'CUSTOMER', label: 'عميل' },
  { value: 'BOTH', label: 'مورد وعميل' },
];

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

function toPayload(s: OpeningFormState) {
  return {
    amount: s.amount.trim(),
    direction: s.direction,
    ...(s.date ? { date: new Date(`${s.date}T00:00:00`).toISOString() } : {}),
    ...(s.note.trim() ? { notes: s.note.trim() } : {}),
  };
}

/**
 * TB-074 base + TB-142 AD-76 opening balance (behavior: create/edit contact,
 * name+phone required, role locked on edit; opening card on create, lock
 * callout on edit once ledger movements exist).
 */
export function ContactFormModal({ open, onClose, contact }: Props) {
  const isEdit = !!contact;
  const qc = useQueryClient();
  const createMut = useCreateContactMutation();
  const updateMut = useUpdateContactMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<ContactRole>('CUSTOMER');
  const [customerOpening, setCustomerOpening] = useState<OpeningFormState>(EMPTY_OPENING);
  const [supplierOpening, setSupplierOpening] = useState<OpeningFormState>(EMPTY_OPENING);
  const [customerLocked, setCustomerLocked] = useState(true);
  const [supplierLocked, setSupplierLocked] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string; opening?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setName(contact.name);
      setPhone(contact.phone ?? '');
      setRole(contact.role);
      setCustomerOpening(EMPTY_OPENING);
      setSupplierOpening(EMPTY_OPENING);
      setCustomerLocked(true);
      setSupplierLocked(true);
      const id = contact.id;
      const needsCustomer = contact.role === 'CUSTOMER' || contact.role === 'BOTH';
      const needsSupplier = contact.role === 'SUPPLIER' || contact.role === 'BOTH';
      if (needsCustomer) {
        fetchDebtLedger(id).then(
          (r) => setCustomerLocked(r.entries.length > 0),
          () => setCustomerLocked(true),
        );
      } else {
        setCustomerLocked(true);
      }
      if (needsSupplier) {
        fetchSupplierLedger(id).then(
          (r) => setSupplierLocked(r.entries.length > 0),
          () => setSupplierLocked(true),
        );
      } else {
        setSupplierLocked(true);
      }
    } else {
      setName('');
      setPhone('');
      setRole('CUSTOMER');
      setCustomerOpening(EMPTY_OPENING);
      setSupplierOpening(EMPTY_OPENING);
      setCustomerLocked(false);
      setSupplierLocked(false);
    }
    setFieldErrors({});
    setApiError(null);
  }, [open, contact]);

  if (!open) return null;

  const isSubmitting = createMut.isPending || updateMut.isPending;
  const showCustomer = role === 'CUSTOMER' || role === 'BOTH';
  const showSupplier = role === 'SUPPLIER' || role === 'BOTH';

  function validateOpening(s: OpeningFormState): boolean {
    if (!s.amount.trim()) return true;
    return AMOUNT_RE.test(s.amount.trim());
  }

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!name.trim()) errs.name = 'الاسم مطلوب';
    if (!phone.trim()) errs.phone = 'الهاتف مطلوب';
    if (showCustomer && !validateOpening(customerOpening)) errs.opening = 'مبلغ الرصيد الافتتاحي (عميل) غير صالح';
    else if (showSupplier && !validateOpening(supplierOpening)) errs.opening = 'مبلغ الرصيد الافتتاحي (مورد) غير صالح';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function refreshLedgerCaches() {
    await qc.invalidateQueries({ queryKey: ['contacts'] });
    await qc.invalidateQueries({ queryKey: ['debt-ledger'] });
    await qc.invalidateQueries({ queryKey: ['supplier-ledger'] });
    await qc.invalidateQueries({ queryKey: ['cash-balance'] });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;
    try {
      if (isEdit && contact) {
        // 1) Contact details first.
        await updateMut.mutateAsync({
          id: contact.id,
          payload: { name: name.trim(), phone: phone.trim() },
        });
        // 2) Sequentially persist opening balances on unlocked sides.
        // A failure here keeps the modal open with an explicit error —
        // details are saved, the opening is not, nothing is corrupted.
        const sides: { kind: 'customer' | 'supplier'; state: OpeningFormState; locked: boolean }[] = [
          { kind: 'customer', state: customerOpening, locked: customerLocked },
          { kind: 'supplier', state: supplierOpening, locked: supplierLocked },
        ];
        for (const side of sides) {
          const visible = side.kind === 'customer' ? showCustomer : showSupplier;
          if (!visible || side.locked || !side.state.amount.trim()) continue;
          try {
            if (side.kind === 'customer') {
              await postCustomerOpeningBalance(contact.id, toPayload(side.state));
            } else {
              await postSupplierOpeningBalance(contact.id, toPayload(side.state));
            }
          } catch (err) {
            const msg =
              err instanceof ApiError
                ? `تم حفظ بيانات الجهة، لكن فشل حفظ الرصيد الافتتاحي: ${err.message}`
                : 'تم حفظ بيانات الجهة، لكن فشل حفظ الرصيد الافتتاحي';
            setApiError(msg);
            await refreshLedgerCaches();
            return;
          }
        }
        await refreshLedgerCaches();
      } else if (role === 'CUSTOMER') {
        await createCustomer({
          name: name.trim(),
          phone: phone.trim(),
          ...(customerOpening.amount.trim()
            ? { openingBalance: toPayload(customerOpening) }
            : {}),
        });
        await refreshLedgerCaches();
      } else if (role === 'SUPPLIER') {
        await createSupplier({
          name: name.trim(),
          phone: phone.trim(),
          ...(supplierOpening.amount.trim()
            ? { openingBalance: toPayload(supplierOpening) }
            : {}),
        });
        await refreshLedgerCaches();
      } else {
        const created = await createMut.mutateAsync({
          name: name.trim(),
          phone: phone.trim(),
          role,
        });
        if (customerOpening.amount.trim()) {
          await postCustomerOpeningBalance(created.id, toPayload(customerOpening));
        }
        if (supplierOpening.amount.trim()) {
          await postSupplierOpeningBalance(created.id, toPayload(supplierOpening));
        }
        await refreshLedgerCaches();
      }
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'حدث خطأ غير متوقع';
      setApiError(msg);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال'}
        className="scrollbar-premium relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-navy-border/40 bg-navy-900 p-6 text-slate-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">
            {isEdit ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="contact-name" className="mb-1 block text-sm font-medium text-slate-300">
              الاسم <span className="text-rose-400">*</span>
            </label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-xl border bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 ${
                fieldErrors.name ? 'border-rose-500/40' : 'border-navy-border/40'
              }`}
              placeholder="أدخل الاسم"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-rose-400">{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="contact-phone" className="mb-1 block text-sm font-medium text-slate-300">
              الهاتف <span className="text-rose-400">*</span>
            </label>
            <input
              id="contact-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-xl border bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 ${
                fieldErrors.phone ? 'border-rose-500/40' : 'border-navy-border/40'
              }`}
              placeholder="أدخل رقم الهاتف"
              dir="ltr"
            />
            {fieldErrors.phone && <p className="mt-1 text-xs text-rose-400">{fieldErrors.phone}</p>}
          </div>

          <div>
            <label htmlFor="contact-role" className="mb-1 block text-sm font-medium text-slate-300">
              الدور <span className="text-rose-400">*</span>
            </label>
            {isEdit ? (
              <div className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-300">
                {roleLabel(role)}
                <span className="ms-2 text-xs text-slate-500">(لا يمكن تغيير الدور عند التعديل)</span>
              </div>
            ) : (
              <select
                id="contact-role"
                value={role}
                onChange={(e) => setRole(e.target.value as ContactRole)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {showCustomer && (
            <OpeningBalanceSection
              kind="customer"
              value={customerOpening}
              onChange={setCustomerOpening}
              locked={isEdit && customerLocked}
              disabled={isSubmitting}
            />
          )}
          {showSupplier && (
            <OpeningBalanceSection
              kind="supplier"
              value={supplierOpening}
              onChange={setSupplierOpening}
              locked={isEdit && supplierLocked}
              disabled={isSubmitting}
            />
          )}
          {fieldErrors.opening && (
            <p className="text-xs text-rose-400" role="alert">
              {fieldErrors.opening}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/[0.06] disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التغييرات' : 'إضافة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
