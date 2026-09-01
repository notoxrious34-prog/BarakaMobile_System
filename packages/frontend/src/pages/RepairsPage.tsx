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

const STATUS_COLOR: Record<string, string> = {
  RECEIVED: 'bg-blue-100 text-blue-700',
  DIAGNOSING: 'bg-yellow-100 text-yellow-700',
  IN_REPAIR: 'bg-orange-100 text-orange-700',
  READY: 'bg-green-100 text-green-700',
  DELIVERED: 'bg-zinc-200 text-zinc-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const REPAIR_TYPE_LABEL: Record<string, string> = {
  INTERNAL: 'داخلي',
  EXTERNAL: 'خارجي',
};

const REPAIR_TYPE_COLOR: Record<string, string> = {
  INTERNAL: 'bg-indigo-100 text-indigo-700',
  EXTERNAL: 'bg-purple-100 text-purple-700',
};

type Contact = { id: string; name: string; role: string };

export function RepairsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [repairTypeFilter, setRepairTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">الإصلاحات</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          تذكرة جديدة
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-zinc-200 bg-white p-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm">
          <option value="">كل الحالات</option>
          <option value="RECEIVED">مستلم</option>
          <option value="DIAGNOSING">قيد التشخيص</option>
          <option value="IN_REPAIR">قيد الإصلاح</option>
          <option value="READY">جاهز</option>
          <option value="DELIVERED">تم التسليم</option>
          <option value="CANCELLED">ملغى</option>
        </select>
        <select value={repairTypeFilter} onChange={(e) => setRepairTypeFilter(e.target.value)} className="rounded-md border px-3 py-1.5 text-sm">
          <option value="">كل الأنواع</option>
          <option value="INTERNAL">داخلي</option>
          <option value="EXTERNAL">خارجي</option>
        </select>
        <input
          type="text"
          placeholder="بحث: رقم التذكرة أو الجهاز"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-zinc-500">
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
                <tr key={t.id} className="border-b">
                  <td className="px-3 py-2">
                    <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-mono">{t.ticketNumber}</span>
                  </td>
                  <td className="px-3 py-2">{t.deviceBrand} {t.deviceModel}</td>
                  <td className="px-3 py-2">{t.contact?.name ?? t.contactId}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[t.status] ?? 'bg-zinc-100'}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${REPAIR_TYPE_COLOR[t.repairType] ?? 'bg-zinc-100'}`}>{REPAIR_TYPE_LABEL[t.repairType] ?? t.repairType}</span>
                  </td>
                  <td className="px-3 py-2 text-left" dir="ltr">{Number(t.estimatedCost).toFixed(2)} د.ج</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setSelectedId(t.id)} className="rounded-md border px-3 py-1 text-xs hover:bg-zinc-50">
                      تفاصيل
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-zinc-500">لا توجد تذاكر</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
  const [apiError, setApiError] = useState<string | null>(null);

  const customerContacts = contacts?.filter((c) => c.role === 'CUSTOMER' || c.role === 'BOTH') ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    if (!contactId || !deviceBrand || !deviceModel || !problemDescription) {
      setApiError('جميع الحقول المطلوبة يجب ملؤها');
      return;
    }
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
      });
      onClose();
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-white p-6">
        <h3 className="mb-4 text-base font-semibold">تذكرة إصلاح جديدة</h3>
        {apiError && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{apiError}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
            <option value="">اختر العميل</option>
            {customerContacts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.role})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={deviceType} onChange={(e) => setDeviceType(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              <option value="PHONE">هاتف</option>
              <option value="TABLET">تابلت</option>
              <option value="LAPTOP">لابتوب</option>
              <option value="OTHER">أخرى</option>
            </select>
            <select value={repairType} onChange={(e) => setRepairType(e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              <option value="INTERNAL">داخلي</option>
              <option value="EXTERNAL">خارجي</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="الماركة *" value={deviceBrand} onChange={(e) => setDeviceBrand(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
            <input type="text" placeholder="الموديل *" value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} className="rounded-md border px-3 py-2 text-sm" />
          </div>
          <textarea placeholder="وصف المشكلة *" value={problemDescription} onChange={(e) => setProblemDescription(e.target.value)} rows={2} className="w-full rounded-md border px-3 py-2 text-sm" />
          <input type="text" placeholder="اسم الفني (اختياري)" value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="التكلفة المقدرة" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className="rounded-md border px-3 py-2 text-sm" dir="ltr" />
            <input type="text" placeholder="العربون" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className="rounded-md border px-3 py-2 text-sm" dir="ltr" />
          </div>
          {depositAmount && <p className="text-xs text-zinc-500">سيتم تسجيل العربون كدفعة نقدية فور إنشاء التذكرة</p>}
          <textarea placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border px-3 py-2 text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm">إلغاء</button>
            <button type="submit" disabled={createMut.isPending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50">{createMut.isPending ? '...' : 'إنشاء'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

