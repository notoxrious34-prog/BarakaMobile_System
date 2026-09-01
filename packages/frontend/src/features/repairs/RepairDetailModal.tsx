import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useUpdateStatusMutation, useRecordExternalCostMutation, type RepairTicket } from '@/features/repair/hooks/useRepairs';

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
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative z-10 w-full max-w-xl rounded-lg border bg-white p-6 text-center">جاري التحميل...</div>
      </div>
    );
  }

  if (isError) {
    const msg = queryError instanceof ApiError ? queryError.message : queryError instanceof Error ? queryError.message : 'تعذر تحميل بيانات التذكرة';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative z-10 w-full max-w-xl rounded-lg border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">خطأ في التحميل</h3>
            <button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">إغلاق</button>
          </div>
          <div className="rounded bg-red-50 px-3 py-3 text-sm text-red-700">{msg}</div>
          <button type="button" onClick={() => refetch()} className="mt-3 w-full rounded-md bg-zinc-900 px-3 py-2 text-sm text-white">إعادة المحاولة</button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative z-10 w-full max-w-xl rounded-lg border bg-white p-6 text-center">لا توجد بيانات</div>
      </div>
    );
  }

  const isTerminal = ticket!.status === 'DELIVERED' || ticket!.status === 'CANCELLED';

  async function handleStatusUpdate() {
    setError(null);
    try {
      await updateMut.mutateAsync({ id: ticketId, status: newStatus || ticket!.status, actualCost: actualCost || undefined, notes: notes || undefined });
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{ticket.ticketNumber} — {ticket.deviceBrand} {ticket.deviceModel}</h3>
          <button type="button" onClick={onClose} className="rounded border px-3 py-1 text-sm">إغلاق</button>
        </div>
        {error && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-2 text-sm">
          <p>العميل: {ticket.contact?.name ?? ticket.contactId}</p>
          <p>الجهاز: {ticket.deviceType} — {ticket.deviceBrand} {ticket.deviceModel}</p>
          <p>المشكلة: {ticket.problemDescription}</p>
          <p>النوع: {ticket.repairType} | الفني: {ticket.technicianName ?? '—'}</p>
          <p>الحالة: <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLOR[ticket.status]}`}>{STATUS_LABEL[ticket.status]}</span></p>
          <p>التكلفة المقدرة: {Number(ticket.estimatedCost).toFixed(2)} د.ج | الفعلية: {Number(ticket.actualCost).toFixed(2)} د.ج | الخارجية: {Number(ticket.externalCost).toFixed(2)} د.ج</p>
          <p>العربون: {Number(ticket.depositAmount).toFixed(2)} د.ج {ticket.depositPaid ? '(مدفوع)' : ''}</p>
          {ticket.invoiceNumber && <p>رقم الفاتورة: <span className="font-mono font-bold">{ticket.invoiceNumber}</span></p>}
          {ticket.notes && <p>ملاحظات: {ticket.notes}</p>}
        </div>

        {!isTerminal && (
          <div className="mt-4 space-y-3 rounded-lg border p-3">
            <h4 className="font-semibold">تحديث الحالة</h4>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">اختر حالة جديدة</option>
              <option value="RECEIVED">مستلم</option>
              <option value="DIAGNOSING">قيد التشخيص</option>
              <option value="IN_REPAIR">قيد الإصلاح</option>
              <option value="READY">جاهز</option>
              <option value="DELIVERED">تم التسليم</option>
              <option value="CANCELLED">ملغى</option>
            </select>
            <input type="text" placeholder="التكلفة الفعلية (مطلوبة عند التسليم)" value={actualCost} onChange={(e) => setActualCost(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" dir="ltr" />
            <textarea placeholder="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border px-3 py-2 text-sm" />
            <button type="button" onClick={handleStatusUpdate} disabled={updateMut.isPending} className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50">تأكيد تحديث الحالة</button>
          </div>
        )}

        {ticket.repairType === 'EXTERNAL' && !isTerminal && (
          <div className="mt-4 space-y-2 rounded-lg border p-3">
            <h4 className="font-semibold">تسجيل تكلفة خارجية</h4>
            <input type="text" placeholder="المبلغ" value={externalCost} onChange={(e) => setExternalCost(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" dir="ltr" />
            <input type="text" placeholder="ملاحظة" value={externalNote} onChange={(e) => setExternalNote(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
            <button type="button" onClick={handleExternalCost} disabled={externalMut.isPending} className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm text-white disabled:opacity-50">تسجيل</button>
          </div>
        )}

        {isTerminal && <p className="mt-4 rounded bg-zinc-100 px-3 py-2 text-center text-sm text-zinc-600">هذه التذكرة في حالة نهائية ولا يمكن تعديلها</p>}
      </div>
    </div>
  );
}
