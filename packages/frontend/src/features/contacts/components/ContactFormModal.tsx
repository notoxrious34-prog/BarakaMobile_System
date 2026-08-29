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
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      {/* dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال'}
        className="relative z-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            {isEdit ? 'تعديل جهة الاتصال' : 'إضافة جهة اتصال'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {apiError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="contact-name" className="mb-1 block text-sm font-medium text-zinc-700">
              الاسم <span className="text-red-500">*</span>
            </label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 ${
                fieldErrors.name ? 'border-red-500' : 'border-zinc-300'
              }`}
              placeholder="أدخل الاسم"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="contact-phone" className="mb-1 block text-sm font-medium text-zinc-700">
              الهاتف <span className="text-red-500">*</span>
            </label>
            <input
              id="contact-phone"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 ${
                fieldErrors.phone ? 'border-red-500' : 'border-zinc-300'
              }`}
              placeholder="أدخل رقم الهاتف"
              dir="ltr"
            />
            {fieldErrors.phone && <p className="mt-1 text-xs text-red-600">{fieldErrors.phone}</p>}
          </div>

          <div>
            <label htmlFor="contact-role" className="mb-1 block text-sm font-medium text-zinc-700">
              الدور <span className="text-red-500">*</span>
            </label>
            {isEdit ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                {ROLE_LABEL[role]}
                <span className="ms-2 text-xs text-zinc-500">(لا يمكن تغيير الدور عند التعديل)</span>
              </div>
            ) : (
              <select
                id="contact-role"
                value={role}
                onChange={(e) => setRole(e.target.value as ContactRole)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
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
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الحفظ...' : isEdit ? 'حفظ التغييرات' : 'إضافة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
