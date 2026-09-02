import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  useCreateContactMutation,
  useUpdateContactMutation,
  type Contact,
  type ContactRole,
} from '../hooks/useContacts';

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

const ROLE_LABEL: Record<ContactRole, string> = {
  SUPPLIER: 'مورد',
  CUSTOMER: 'عميل',
  BOTH: 'مورد وعميل',
};

export function ContactFormModal({ open, onClose, contact }: Props) {
  const isEdit = !!contact;
  const createMut = useCreateContactMutation();
  const updateMut = useUpdateContactMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<ContactRole>('CUSTOMER');
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (contact) {
        setName(contact.name);
        setPhone(contact.phone ?? '');
        setRole(contact.role);
      } else {
        setName('');
        setPhone('');
        setRole('CUSTOMER');
      }
      setFieldErrors({});
      setApiError(null);
    }
  }, [open, contact]);

  if (!open) return null;

  const isSubmitting = createMut.isPending || updateMut.isPending;

  function validate(): boolean {
    const errs: typeof fieldErrors = {};
    if (!name.trim()) errs.name = 'الاسم مطلوب';
    if (!phone.trim()) errs.phone = 'الهاتف مطلوب';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;
    try {
      if (isEdit && contact) {
        await updateMut.mutateAsync({
          id: contact.id,
          payload: { name: name.trim(), phone: phone.trim() },
        });
      } else {
        await createMut.mutateAsync({
          name: name.trim(),
          phone: phone.trim(),
          role,
        });
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال'}
        className="relative z-10 w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">
            {isEdit ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400" role="alert">
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
              className={`w-full rounded-md border bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 ${
                fieldErrors.name ? 'border-rose-500/40' : 'border-slate-700'
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
              className={`w-full rounded-md border bg-slate-800/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 ${
                fieldErrors.phone ? 'border-rose-500/40' : 'border-slate-700'
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
              <div className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
                {ROLE_LABEL[role]}
                <span className="ms-2 text-xs text-slate-500">(لا يمكن تغيير الدور عند التعديل)</span>
              </div>
            ) : (
              <select
                id="contact-role"
                value={role}
                onChange={(e) => setRole(e.target.value as ContactRole)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التغييرات' : 'إضافة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
