import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { User, UserSearch, X } from 'lucide-react';
import {
  useContactsQuery,
  type Contact,
} from '@/features/contacts/hooks/useContacts';
import { useAccountsByContactQuery } from '@/features/transactions/hooks/useTransactions';
import { useCreateRepairMutation } from '../hooks/useRepairs';
import { useRepairFaultTypes } from '@/features/watchdog/hooks/useWatchdog';
import { WALKIN_NAME } from '@/features/pos/hooks/useWalkinAccount';
import {
  ACCESSORY_PRESETS,
  CONDITION_PRESETS,
  toggleCsv,
} from '../utils/repairLabels';
import { to2dp } from '@/features/pos/hooks/usePosTicket';

type Props = {
  onCreated: (id: string) => void;
  onClose: () => void;
  initial?: { contactId?: string; brand?: string; model?: string; imei?: string };
};

function validMoney(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return '0.00';
  try {
    const d = new Decimal(t);
    if (d.lessThan(new Decimal(0))) return null;
    return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return null;
  }
}

/**
 * TB-072 fast device intake — walk-in or registered customer, Decimal money,
 * IMEI folded into notes (schema has no IMEI column — AD-58).
 */
export function RepairIntakeModal({ onCreated, onClose, initial }: Props) {
  const contactsQ = useContactsQuery();
  const createMut = useCreateRepairMutation();

  const [useWalkin, setUseWalkin] = useState(!initial?.contactId);
  const [contact, setContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [deviceType, setDeviceType] = useState('PHONE');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [imei, setImei] = useState(initial?.imei ?? '');
  const [problem, setProblem] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [accessories, setAccessories] = useState<string[]>([]);
  const [technician, setTechnician] = useState('');
  const [repairType, setRepairType] = useState('INTERNAL');
  const [estimated, setEstimated] = useState('');
  const [deposit, setDeposit] = useState('');
  const [faultTypeId, setFaultTypeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const faultTypesQ = useRepairFaultTypes();

  // SLA auto-estimate: selecting a fault type pre-fills the due date
  // (creation + defaultDays); technician may override manually before submit.
  function onFaultTypeChange(id: string): void {
    setFaultTypeId(id);
    if (!id) return;
    const ft = (faultTypesQ.data ?? []).find((f) => f.id === id);
    if (!ft) return;
    const d = new Date(Date.now() + ft.defaultDays * 86_400_000);
    setDueDate(d.toISOString().slice(0, 10));
  }

  const walkinContact = useMemo(
    () => (contactsQ.data ?? []).find((c) => c.name === WALKIN_NAME) ?? null,
    [contactsQ.data],
  );

  // IMEI-desk referral: preselect the registered customer once loaded.
  useEffect(() => {
    if (initial?.contactId && !contact) {
      const found = (contactsQ.data ?? []).find((c) => c.id === initial.contactId);
      if (found) setContact(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactsQ.data, initial?.contactId]);

  const activeContact: Contact | null = useWalkin ? walkinContact : contact;
  const accountsQ = useAccountsByContactQuery(
    !useWalkin && contact ? contact.id : '',
  );
  const hasCustomerAccount =
    useWalkin ||
    (accountsQ.data ?? []).some((a) => a.role === 'CUSTOMER');

  const candidates = useMemo(() => {
    const list = contactsQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 6);
    return list
      .filter(
        (c) =>
          (c.name ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [contactsQ.data, search]);

  const depositNum = (() => {
    try {
      return new Decimal(deposit.trim() === '' ? '0' : deposit.trim());
    } catch {
      return new Decimal(0);
    }
  })();

  async function submit(): Promise<void> {
    setError(null);
    const contactId = activeContact?.id;
    if (!contactId) {
      setError(
        useWalkin
          ? 'حساب العميل النقدي غير جاهز — افتح نقطة البيع مرة واحدة أولاً أو اختر عميلاً مسجلاً'
          : 'اختر العميل أولاً',
      );
      return;
    }
    if (brand.trim().length < 2 || model.trim().length < 2) {
      setError('الماركة والموديل مطلوبان');
      return;
    }
    if (problem.trim().length < 3) {
      setError('صف العطل باختصار (3 أحرف على الأقل)');
      return;
    }
    const est = validMoney(estimated);
    const dep = validMoney(deposit);
    if (est === null || dep === null) {
      setError('المبالغ غير صالحة (أرقام موجبة فقط)');
      return;
    }
    const noteParts: string[] = [];
    if (imei.trim()) noteParts.push(`IMEI: ${imei.trim()}`);
    if (conditions.length > 0) noteParts.push(`الحالة: ${conditions.join(',')}`);
    if (accessories.length > 0) noteParts.push(`ملحقات: ${accessories.join(',')}`);
    try {
      const created = await createMut.mutateAsync({
        contactId,
        deviceType,
        deviceBrand: brand.trim(),
        deviceModel: model.trim(),
        problemDescription: problem.trim(),
        repairType,
        technicianName: technician.trim() || undefined,
        repairFaultTypeId: faultTypeId || undefined,
        estimatedCompletionDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : undefined,
        estimatedCost: to2dp(est),
        depositAmount: to2dp(dep),
        notes: noteParts.length > 0 ? noteParts.join(' | ') : undefined,
        physicalCondition: conditions.length > 0 ? conditions.join(',') : undefined,
        accessories: accessories.length > 0 ? accessories.join(',') : undefined,
      });
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل إنشاء التذكرة');
    }
  }

  function chip(
    active: boolean,
    label: string,
    onClick: () => void,
  ): React.ReactNode {
    return (
      <button
        key={label}
        type="button"
        onClick={onClick}
        className={`h-7 rounded-lg border px-2 py-0.5 text-xs font-bold ${
          active
            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
            : 'border-navy-border/40 text-slate-400 hover:text-slate-200'
        }`}
      >
        {label}
      </button>
    );
  }

  const inputCls =
    'w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="استلام جهاز جديد"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
        <div className="flex shrink-0 items-center justify-between border-b border-navy-border/30 p-3">
          <h3 className="text-sm font-bold text-slate-100">استلام جهاز جديد</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="scrollbar-premium min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {/* Customer */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUseWalkin(true)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${
                  useWalkin
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                    : 'border-navy-border/40 text-slate-400'
                }`}
              >
                <User className="h-3.5 w-3.5" aria-hidden="true" /> عميل نقدي
              </button>
              <button
                type="button"
                onClick={() => setUseWalkin(false)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${
                  !useWalkin
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                    : 'border-navy-border/40 text-slate-400'
                }`}
              >
                <UserSearch className="h-3.5 w-3.5" aria-hidden="true" /> عميل مسجل
              </button>
            </div>
            {!useWalkin && (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الهاتف..."
                  aria-label="بحث عن عميل"
                  className={inputCls}
                />
                {contact ? (
                  <button
                    type="button"
                    onClick={() => setContact(null)}
                    className="flex w-full items-center justify-between rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-slate-100"
                  >
                    <span>{contact.name}</span>
                    <span className="font-mono text-[11px] text-slate-400" dir="ltr">
                      {contact.phone ?? ''}
                    </span>
                  </button>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-navy-border/40">
                    {candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setContact(c)}
                        className="flex w-full items-center justify-between border-b border-navy-border/20 px-3 py-2 text-right last:border-0 hover:bg-white/[0.05]"
                      >
                        <span className="text-sm text-slate-100">{c.name}</span>
                        <span className="font-mono text-[11px] text-slate-500" dir="ltr">
                          {c.phone ?? '—'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {depositNum.greaterThan(new Decimal(0)) && !hasCustomerAccount && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300" role="alert">
                تنبيه: العربون يتطلب حساب عميل — العميل المحدد بلا حساب CUSTOMER وسيرفض الخادم العملية
              </p>
            )}
          </div>

          {/* Device */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              aria-label="نوع الجهاز"
              className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            >
              <option value="PHONE">هاتف</option>
              <option value="TABLET">تابلت</option>
              <option value="LAPTOP">حاسوب محمول</option>
              <option value="OTHER">جهاز آخر</option>
            </select>
            <select
              value={repairType}
              onChange={(e) => setRepairType(e.target.value)}
              aria-label="نوع الإصلاح"
              className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            >
              <option value="INTERNAL">داخلي (الورشة)</option>
              <option value="EXTERNAL">خارجي</option>
            </select>
            <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="الماركة *" aria-label="الماركة" className={inputCls} />
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="الموديل *" aria-label="الموديل" className={inputCls} />
            <input type="text" value={imei} onChange={(e) => setImei(e.target.value)} placeholder="IMEI / Serial (اختياري)" aria-label="الرقم التسلسلي" className={`${inputCls} font-mono`} dir="ltr" />
            <input type="text" value={technician} onChange={(e) => setTechnician(e.target.value)} placeholder="الفني (اختياري)" aria-label="الفني" className={inputCls} />
          </div>

          {/* SLA: fault type + estimated delivery (TB-127) */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={faultTypeId}
              onChange={(e) => onFaultTypeChange(e.target.value)}
              aria-label="نوع العطل"
              className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
            >
              <option value="">نوع العطل (اختياري)</option>
              {(faultTypesQ.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.faultTypeName} — {f.defaultDays} أيام
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              placeholder="تاريخ التسليم المتوقع"
              aria-label="تاريخ التسليم المتوقع"
              className={`${inputCls} font-mono`}
              dir="ltr"
            />
          </div>
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="وصف العطل *"
            aria-label="وصف العطل"
            rows={2}
            className={`${inputCls} resize-none`}
          />

          {/* Chips */}
          <div>
            <p className="mb-1 text-[11px] font-bold text-slate-400">الحالة الفيزيائية</p>
            <div className="flex flex-wrap gap-1">
              {CONDITION_PRESETS.map((c) =>
                chip(conditions.includes(c.value), c.label, () =>
                  setConditions((prev) => toggleCsv(prev, c.value)),
                ),
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-bold text-slate-400">الملحقات المستلمة</p>
            <div className="flex flex-wrap gap-1">
              {ACCESSORY_PRESETS.map((c) =>
                chip(accessories.includes(c.value), c.label, () =>
                  setAccessories((prev) => toggleCsv(prev, c.value)),
                ),
              )}
            </div>
          </div>

          {/* Money */}
          <div className="grid grid-cols-2 gap-2">
            <input type="text" inputMode="decimal" value={estimated} onChange={(e) => setEstimated(e.target.value)} placeholder="التكلفة التقديرية (د.ج)" aria-label="التكلفة التقديرية" className={`${inputCls} font-mono`} dir="ltr" />
            <input type="text" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="العربون المقدم (د.ج)" aria-label="العربون" className={`${inputCls} font-mono`} dir="ltr" />
          </div>

          {error && (
            <p className="text-xs font-bold text-rose-400" role="alert">{error}</p>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={createMut.isPending}
            className="w-full rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50"
          >
            {createMut.isPending ? 'جاري إنشاء التذكرة…' : 'إنشاء التذكرة'}
          </button>
        </div>
      </div>
    </div>
  );
}
