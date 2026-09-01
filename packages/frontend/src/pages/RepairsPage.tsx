import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useRepairsQuery, useCreateRepairMutation, type RepairTicket } from '@/features/repairs/hooks/useRepairs';
import { RepairDetailModal } from '@/features/repairs/RepairDetailModal';

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'مستلم',
  DIAGNOSING: 'قيد التشخيص',
  IN_REPAIR: 'قيد الإصلاح',
  READY: 'جاهز',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغى',
};

const KANBAN_ORDER: { status: string; label: string }[] = [
  { status: 'RECEIVED', label: 'مستلم' },
  { status: 'DIAGNOSING', label: 'قيد التشخيص' },
  { status: 'IN_REPAIR', label: 'قيد الإصلاح' },
  { status: 'READY', label: 'جاهز' },
  { status: 'DELIVERED', label: 'تم التسليم' },
  { status: 'CANCELLED', label: 'ملغى' },
];

type Contact = { id: string; name: string; role: string };

const PHYSICAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'SCRATCHES', label: 'خدوش' },
  { value: 'CRACKED_SCREEN', label: 'شاشة مكسورة' },
  { value: 'BROKEN_BACK', label: 'كسر في الهيكل الخلفي' },
  { value: 'WATER_DAMAGE', label: 'ضرر مائي' },
  { value: 'DENTS', label: 'انبعاج' },
  { value: 'NONE', label: 'لا يوجد' },
];

const ACCESSORIES_OPTIONS: { value: string; label: string }[] = [
  { value: 'CHARGER', label: 'شاحن' },
  { value: 'CABLE', label: 'كابل' },
  { value: 'EARPHONES', label: 'سماعات' },
  { value: 'CASE', label: 'غطاء حماية' },
  { value: 'SIM_CARD', label: 'شريحة اتصال' },
  { value: 'MEMORY_CARD', label: 'بطاقة ذاكرة' },
  { value: 'BOX', label: 'علبة الجهاز' },
  { value: 'NONE', label: 'لا يوجد' },
];

export function RepairsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [repairTypeFilter, setRepairTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'kanban'>('table');

  const repairsQ = useRepairsQuery({
    status: statusFilter || undefined,
    repairType: repairTypeFilter || undefined,
  });

  const filtered = (repairsQ.data ?? []).filter((t) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (
      t.ticketNumber.toLowerCase().includes(s) ||
      t.deviceBrand.toLowerCase().includes(s) ||
      t.deviceModel.toLowerCase().includes(s) ||
      (t.contact?.name ?? '').toLowerCase().includes(s)
    );
  });

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 p-4 font-sans space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">الإصلاحات</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
        >
          تذكرة جديدة
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setView('table')}
          className={
            view === 'table'
              ? 'rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/40 px-4 py-2 text-sm'
              : 'rounded-md bg-slate-800 text-slate-400 border border-slate-700 px-4 py-2 text-sm'
          }
        >
          عرض الجدول
        </button>
        <button
          type="button"
          onClick={() => setView('kanban')}
          className={
            view === 'kanban'
              ? 'rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/40 px-4 py-2 text-sm'
              : 'rounded-md bg-slate-800 text-slate-400 border border-slate-700 px-4 py-2 text-sm'
          }
        >
          عرض الأعمدة
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">كل الحالات</option>
          <option value="RECEIVED">مستلم</option>
          <option value="DIAGNOSING">قيد التشخيص</option>
          <option value="IN_REPAIR">قيد الإصلاح</option>
          <option value="READY">جاهز</option>
          <option value="DELIVERED">تم التسليم</option>
          <option value="CANCELLED">ملغى</option>
        </select>
        <select
          value={repairTypeFilter}
          onChange={(e) => setRepairTypeFilter(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">كل الأنواع</option>
          <option value="INTERNAL">داخلي</option>
          <option value="EXTERNAL">خارجي</option>
        </select>
        <input
          type="text"
          placeholder="بحث: رقم التذكرة أو الجهاز"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
      </div>

      {view === 'table' ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-3 py-2 text-right">التذكرة</th>
                  <th className="px-3 py-2 text-right">الجهاز</th>
                  <th className="px-3 py-2 text-right">العميل</th>
                  <th className="px-3 py-2 text-right">الحالة</th>
                  <th className="px-3 py-2 text-right">النوع</th>
                  <th className="px-3 py-2 text-left">التكلفة المقدرة</th>
                  <th className="px-3 py-2 text-right">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-slate-800">
                    <td className="px-3 py-2">
                      <span className="bg-amber-500/10 text-amber-400 font-mono border border-amber-500/30 rounded px-2 py-1 text-xs">
                        {t.ticketNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {t.deviceBrand} {t.deviceModel}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{t.contact?.name ?? t.contactId}</td>
                    <td className="px-3 py-2">
                      <span className="rounded px-2 py-0.5 text-xs bg-slate-800 text-slate-300 border border-slate-700">
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded px-2 py-0.5 text-xs bg-slate-800 text-slate-300 border border-slate-700">
                        {t.repairType === 'INTERNAL' ? 'داخلي' : t.repairType === 'EXTERNAL' ? 'خارجي' : t.repairType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-left font-mono text-slate-100" dir="ltr">
                      {Number(t.estimatedCost).toFixed(2)} د.ج
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
                      >
                        تفاصيل
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      لا توجد تذاكر
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KANBAN_ORDER.map((col) => {
            const colTickets = filtered.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="min-w-[220px] bg-slate-900 rounded-xl border border-slate-800 p-3 flex-shrink-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-200">{col.label}</span>
                  <span className="text-xs text-slate-500">{colTickets.length}</span>
                </div>
                {colTickets.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="bg-slate-800 rounded-lg p-2 mt-2 cursor-pointer hover:bg-slate-700"
                  >
                    <span className="bg-amber-500/10 text-amber-400 font-mono border border-amber-500/30 rounded px-2 py-1 text-xs">
                      {t.ticketNumber}
                    </span>
                    <p className="text-xs text-slate-300 mt-1">
                      {t.deviceBrand} {t.deviceModel}
                    </p>
                    <p className="text-xs text-slate-500">{t.contact?.name ?? t.contactId}</p>
                  </div>
                ))}
                {colTickets.length === 0 && <p className="mt-2 text-center text-xs text-slate-500">—</p>}
              </div>
            );
          })}
        </div>
      )}

      {showForm && <RepairForm onClose={() => setShowForm(false)} />}
      {selectedId && <RepairDetailModal ticketId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function RepairForm({ onClose }: { onClose: () => void }) {
  const createMut = useCreateRepairMutation();
  const { data: contacts } = useQuery<Contact[]>({ queryKey: ['contacts'], queryFn: () => api.get<Contact[]>('/contacts') });
  const [contactId, setContactId] = useState('');
  const [deviceType, setDeviceType] = useState('PHONE');
  const [deviceBrand, setDeviceBrand] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [repairType, setRepairType] = useState('INTERNAL');
  const [technicianName, setTechnicianName] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [physicalCondition, setPhysicalCondition] = useState<string[]>([]);
  const [hasPasscode, setHasPasscode] = useState(false);
  const [accessories, setAccessories] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  const customerContacts = contacts?.filter((c) => c.role === 'CUSTOMER' || c.role === 'BOTH') ?? [];

  function togglePhysical(value: string) {
    setPhysicalCondition((prev) => {
      if (value === 'NONE') {
        if (prev.includes('NONE')) return [];
        return ['NONE'];
      }
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      const next = prev.filter((v) => v !== 'NONE');
      return [...next, value];
    });
  }

  function toggleAccessories(value: string) {
    setAccessories((prev) => {
      if (value === 'NONE') {
        if (prev.includes('NONE')) return [];
        return ['NONE'];
      }
      if (prev.includes(value)) return prev.filter((v) => v !== value);
      const next = prev.filter((v) => v !== 'NONE');
      return [...next, value];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!contactId || !deviceBrand || !deviceModel || !problemDescription) {
      setApiError('جميع الحقول المطلوبة يجب ملؤها');
      return;
    }
    const physicalStr = physicalCondition.length > 0 ? physicalCondition.join(',') : undefined;
    const accessoriesStr = accessories.length > 0 ? accessories.join(',') : undefined;
    try {
      await createMut.mutateAsync({
        contactId,
        deviceType,
        deviceBrand,
        deviceModel,
        problemDescription,
        repairType,
        technicianName: technicianName || undefined,
        estimatedCost: estimatedCost || undefined,
        depositAmount: depositAmount || undefined,
        notes: notes || undefined,
        physicalCondition: physicalStr,
        hasPasscode,
        accessories: accessoriesStr,
      });
      onClose();
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  const inputCls = 'w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500';
  const selectCls = 'w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-6">
        <h3 className="mb-4 text-base font-semibold text-slate-100">تذكرة إصلاح جديدة</h3>
        {apiError && <p className="mb-3 rounded bg-red-500/10 px-3 py-2 text-sm text-red-400 border border-red-500/30">{apiError}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={selectCls}>
            <option value="">اختر العميل</option>
            {customerContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.role})
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
              <option value="PHONE">هاتف</option>
              <option value="TABLET">تابلت</option>
              <option value="LAPTOP">لابتوب</option>
              <option value="OTHER">أخرى</option>
            </select>
            <select value={repairType} onChange={(e) => setRepairType(e.target.value)} className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100">
              <option value="INTERNAL">داخلي</option>
              <option value="EXTERNAL">خارجي</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="الماركة *" value={deviceBrand} onChange={(e) => setDeviceBrand(e.target.value)} className={inputCls} />
            <input type="text" placeholder="الموديل *" value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} className={inputCls} />
          </div>
          <textarea
            placeholder="وصف المشكلة *"
            value={problemDescription}
            onChange={(e) => setProblemDescription(e.target.value)}
            rows={2}
            className={inputCls}
          />
          <input type="text" placeholder="اسم الفني (اختياري)" value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="التكلفة المقدرة" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className={inputCls} dir="ltr" />
            <input type="text" placeholder="العربون" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className={inputCls} dir="ltr" />
          </div>
          {depositAmount && <p className="text-xs text-slate-500">سيتم تسجيل العربون كدفعة نقدية فور إنشاء التذكرة</p>}
          <textarea
            placeholder="ملاحظات (اختياري)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
          />

          <div>
            <h4 className="text-sm font-semibold text-amber-400 mt-4 mb-2">حالة الجهاز عند الاستلام</h4>
            <div className="flex flex-wrap gap-2">
              {PHYSICAL_OPTIONS.map((opt) => {
                const selected = physicalCondition.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => togglePhysical(opt.value)}
                    className={
                      selected
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full px-3 py-1 text-xs'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 rounded-full px-3 py-1 text-xs'
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-300 mt-3">
              <input type="checkbox" checked={hasPasscode} onChange={(e) => setHasPasscode(e.target.checked)} className="rounded border-slate-700" />
              يحتوي على كلمة سر
            </label>

            <div className="flex flex-wrap gap-2 mt-3">
              {ACCESSORIES_OPTIONS.map((opt) => {
                const selected = accessories.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleAccessories(opt.value)}
                    className={
                      selected
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full px-3 py-1 text-xs'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 rounded-full px-3 py-1 text-xs'
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300">
              إلغاء
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm text-slate-950 disabled:opacity-50"
            >
              {createMut.isPending ? '...' : 'إنشاء'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
