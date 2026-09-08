import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { createClaim } from './serialsApi';

type Props = {
  deviceId: string;
  imei?: string;
  onClose: () => void;
  onCreated?: (claimId: string) => void;
};

export function WarrantyClaimModal({ deviceId, imei, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => createClaim({ deviceSerialId: deviceId, imei, customerName: name.trim(), customerPhone: phone.trim(), reportedIssue: issue.trim() }),
    onSuccess: (c) => {
      setCreated(c.claimNumber);
      qc.invalidateQueries({ queryKey: ['serials'] });
      onCreated?.(c.id);
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذر تسجيل المطالبة'),
  });

  const inputCls = 'rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-500/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4" role="dialog" aria-modal="true" aria-label="مطالبة ضمان">
      <div className="w-full max-w-sm space-y-2 rounded-2xl border border-violet-500/30 bg-navy-900 p-4">
        <h3 className="text-sm font-extrabold text-violet-200">تسجيل مطالبة ضمان</h3>
        {created ? (
          <>
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm font-extrabold text-emerald-300">
              تم التسجيل — <bdi className="font-mono">{created}</bdi>
            </p>
            <button type="button" onClick={onClose} className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white">إغلاق</button>
          </>
        ) : (
          <>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الزبون…" className={`${inputCls} w-full`} />
            <input type="text" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="هاتف الزبون…" className={`${inputCls} w-full font-mono`} />
            <input type="text" value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="العطل المبلّغ عنه…" className={`${inputCls} w-full`} />
            {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={mut.isPending} onClick={() => mut.mutate()} className="flex-1 rounded-xl bg-violet-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-violet-500 disabled:opacity-40">
                {mut.isPending ? '…' : 'تسجيل المطالبة'}
              </button>
              <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-navy-border/40 px-3 py-2 text-xs text-slate-300">إلغاء</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
