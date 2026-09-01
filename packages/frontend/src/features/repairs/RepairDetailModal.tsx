import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useUpdateStatusMutation, useRecordExternalCostMutation, type RepairTicket } from '@/features/repairs/hooks/useRepairs';

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'مستلم',
  DIAGNOSING: 'قيد التشخيص',
  IN_REPAIR: 'قيد الإصلاح',
  READY: 'جاهز',
  DELIVERED: 'تم التسليم',
  CANCELLED: 'ملغى',
};

const PHYSICAL_LABEL: Record<string, string> = {
  SCRATCHES: 'خدوش',
  CRACKED_SCREEN: 'شاشة مكسورة',
  BROKEN_BACK: 'كسر في الهيكل الخلفي',
  WATER_DAMAGE: 'ضرر مائي',
  DENTS: 'انبعاج',
  NONE: 'لا يوجد',
};

const ACCESSORIES_LABEL: Record<string, string> = {
  CHARGER: 'شاحن',
  CABLE: 'كابل',
  EARPHONES: 'سماعات',
  CASE: 'غطاء حماية',
  SIM_CARD: 'شريحة اتصال',
  MEMORY_CARD: 'بطاقة ذاكرة',
  BOX: 'علبة الجهاز',
  NONE: 'لا يوجد',
};

function chipsFromCsv(csv: string | null | undefined, labelMap: Record<string, string>): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function RepairDetailModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { data: ticket, isLoading, isError, error: queryError, refetch } = useQuery<RepairTicket>({
    queryKey: ['repair', ticketId],
    queryFn: () => api.get<RepairTicket>(`/repair/${ticketId}`),
  });
  const updateMut = useUpdateStatusMutation();
  const externalMut = useRecordExternalCostMutation();
  const [newStatus, setNewStatus] = useState('');
  const [actualCost, setActualCost] = useState('');
  const [notes, setNotes] = useState('');
  const [externalCost, setExternalCost] = useState('');
  const [externalNote, setExternalNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative z-10 w-full max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6 text-center text-slate-300">
          جاري التحميل...
        </div>
      </div>
    );
  }

  if (isError) {
    const msg =
      queryError instanceof ApiError
        ? queryError.message
        : queryError instanceof Error
          ? queryError.message
          : 'تعذر تحميل بيانات التذكرة';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative z-10 w-full max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-100">خطأ في التحميل</h3>
            <button type="button" onClick={onClose} className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-300">
              إغلاق
            </button>
          </div>
          <div className="rounded bg-red-500/10 border border-red-500/30 px-3 py-3 text-sm text-red-400">{msg}</div>
          <button type="button" onClick={() => refetch()} className="mt-3 w-full rounded-md bg-amber-500 px-3 py-2 text-sm text-slate-950">
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />
        <div className="relative z-10 w-full max-w-xl rounded-lg border border-slate-800 bg-slate-900 p-6 text-center text-slate-300">
          لا توجد بيانات
        </div>
      </div>
    );
  }

  const isTerminal = ticket!.status === 'DELIVERED' || ticket!.status === 'CANCELLED';

  async function handleStatusUpdate() {
    setError(null);
    try {
      await updateMut.mutateAsync({
        id: ticketId,
        status: newStatus || ticket!.status,
        actualCost: actualCost || undefined,
        notes: notes || undefined,
      });
      await refetch();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'خطأ');
    }
  }

  async function handleExternalCost() {
    setError(null);
    try {
      await externalMut.mutateAsync({ id: ticketId, externalCost, note: externalNote || undefined });
      await refetch();
      setExternalCost('');
      setExternalNote('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'خطأ');
    }
  }

  const hasIntakeData = Boolean(ticket.physicalCondition || ticket.hasPasscode || ticket.accessories);
  const physicalTags = chipsFromCsv(ticket.physicalCondition, PHYSICAL_LABEL);
  const accessoriesTags = chipsFromCsv(ticket.accessories, ACCESSORIES_LABEL);

  const inputCls =
    'w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500';
  const selectCls =
    'w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-slate-100">
            <span className="bg-amber-500/10 text-amber-400 font-mono border border-amber-500/30 rounded px-2 py-1 text-xs">
              {ticket.ticketNumber}
            </span>
            <span>
              {ticket.deviceBrand} {ticket.deviceModel}
            </span>
          </h3>
          <button type="button" onClick={onClose} className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-sm text-slate-300">
            إغلاق
          </button>
        </div>
        {error && <p className="mb-3 rounded bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">{error}</p>}
        <div className="space-y-2 text-sm text-slate-300">
          <p>العميل: {ticket.contact?.name ?? ticket.contactId}</p>
          <p>الجهاز: {ticket.deviceType} — {ticket.deviceBrand} {ticket.deviceModel}</p>
          <p>المشكلة: {ticket.problemDescription}</p>
          <p>
            النوع: {ticket.repairType} | الفني: {ticket.technicianName ?? '—'}
          </p>
          <p>
            الحالة: <span className="rounded bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-300">{STATUS_LABEL[ticket.status]}</span>
          </p>
          <p className="font-mono text-slate-100">
            <span dir="ltr">
              {Number(ticket.estimatedCost).toFixed(2)} د.ج
            </span>{' '}
            مقدرة |{' '}
            <span dir="ltr">
              {Number(ticket.actualCost).toFixed(2)} د.ج
            </span>{' '}
            فعلية |{' '}
            <span dir="ltr">
              {Number(ticket.externalCost).toFixed(2)} د.ج
            </span>{' '}
            خارجية
          </p>
          <p className="font-mono text-slate-100">
            العربون: <span dir="ltr">{Number(ticket.depositAmount).toFixed(2)} د.ج</span> {ticket.depositPaid ? '(مدفوع)' : ''}
          </p>
          {ticket.invoiceNumber && (
            <p>
              رقم الفاتورة: <span className="font-mono font-bold text-slate-100">{ticket.invoiceNumber}</span>
            </p>
          )}
          {ticket.notes && <p>ملاحظات: {ticket.notes}</p>}
        </div>

        {hasIntakeData && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-800/50 p-3">
            <h4 className="text-sm font-semibold text-amber-400 mt-3">حالة الاستلام</h4>
            {physicalTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {physicalTags.map((v) => (
                  <span
                    key={v}
                    className="bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full px-3 py-1 text-xs"
                  >
                    {PHYSICAL_LABEL[v] ?? v}
                  </span>
                ))}
              </div>
            )}
            {ticket.hasPasscode && <p className="text-xs text-rose-400 mt-2">يحتوي على كلمة سر</p>}
            {accessoriesTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {accessoriesTags.map((v) => (
                  <span
                    key={v}
                    className="bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-full px-3 py-1 text-xs"
                  >
                    {ACCESSORIES_LABEL[v] ?? v}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!isTerminal && (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-800 bg-slate-800/30 p-3">
            <h4 className="font-semibold text-slate-100">تحديث الحالة</h4>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={selectCls}>
              <option value="">اختر حالة جديدة</option>
              <option value="RECEIVED">مستلم</option>
              <option value="DIAGNOSING">قيد التشخيص</option>
              <option value="IN_REPAIR">قيد الإصلاح</option>
              <option value="READY">جاهز</option>
              <option value="DELIVERED">تم التسليم</option>
              <option value="CANCELLED">ملغى</option>
            </select>
            <input
              type="text"
              placeholder="التكلفة الفعلية (مطلوبة عند التسليم)"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
            <textarea placeholder="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
            <button
              type="button"
              onClick={handleStatusUpdate}
              disabled={updateMut.isPending}
              className="w-full rounded-md bg-amber-500 px-3 py-2 text-sm text-slate-950 disabled:opacity-50"
            >
              تأكيد تحديث الحالة
            </button>
          </div>
        )}

        {ticket.repairType === 'EXTERNAL' && !isTerminal && (
          <div className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-800/30 p-3">
            <h4 className="font-semibold text-slate-100">تسجيل تكلفة خارجية</h4>
            <input type="text" placeholder="المبلغ" value={externalCost} onChange={(e) => setExternalCost(e.target.value)} className={inputCls} dir="ltr" />
            <input type="text" placeholder="ملاحظة" value={externalNote} onChange={(e) => setExternalNote(e.target.value)} className={inputCls} />
            <button
              type="button"
              onClick={handleExternalCost}
              disabled={externalMut.isPending}
              className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              تسجيل
            </button>
          </div>
        )}

        {isTerminal && <p className="mt-4 rounded bg-slate-800 border border-slate-700 px-3 py-2 text-center text-sm text-slate-400">هذه التذكرة في حالة نهائية ولا يمكن تعديلها</p>}
      </div>
    </div>
  );
}
