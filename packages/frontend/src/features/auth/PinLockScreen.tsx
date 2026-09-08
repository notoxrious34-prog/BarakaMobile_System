import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Delete, Lock, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type Role } from './AuthContext';

type Operator = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  avatarColor: string | null;
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'مدير',
  CASHIER: 'كاشير',
  TECHNICIAN: 'فني',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).trim() || '?';
}

export function PinLockScreen() {
  const { loginWithPin } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Operator | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const operatorsQ = useQuery<Operator[]>({
    queryKey: ['auth', 'operators'],
    queryFn: () => api.get<Operator[]>('/auth/operators'),
    staleTime: 30000,
    retry: 1,
  });

  const bootstrapMut = useMutation({
    mutationFn: () => api.post<{ success: boolean; message: string }>('/auth/bootstrap-admin', {}),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['auth', 'operators'] }).then(() => {
        // Auto-select the freshly provisioned admin so 0000 works immediately.
        const ops = qc.getQueryData<Operator[]>(['auth', 'operators']) ?? [];
        const admin = ops.find((o) => o.username === 'admin') ?? ops[0];
        if (admin) setSelected(admin);
      });
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذرت التهيئة'),
  });

  useEffect(() => {
    const ops = operatorsQ.data ?? [];
    if (!selected && ops.length > 0) setSelected(ops[0] ?? null);
  }, [operatorsQ.data, selected]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selected, busy]);

  function press(d: string) {
    setError(null);
    setPin((p) => (p.length >= 6 ? p : p + d));
  }

  async function submit(): Promise<void> {
    if (!selected || busy || pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithPin(pin, selected.username);
      setPin('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'فشل تسجيل الدخول');
      setShake((s) => s + 1);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (pin.length >= 4 && selected) {
      const t = window.setTimeout(() => void submit(), 350);
      return () => window.clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  return (
    <div dir="rtl" className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-950 p-4" role="dialog" aria-modal="true" aria-label="شاشة القفل">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-navy-border/40 bg-navy-900/80 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-slate-100">الشاشة مقفلة</h2>
          <p className="text-xs text-slate-500">اختر المشغّل وأدخل الـ PIN للمتابعة</p>
        </div>

        {operatorsQ.isLoading ? (
          <p className="text-xs text-slate-500">جاري تحميل المشغّلين…</p>
        ) : operatorsQ.isError || (operatorsQ.data ?? []).length === 0 ? (
          <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-100">تهيئة النظام لأول مرة</h3>
            <p className="text-xs leading-5 text-slate-400">
              لم يتم العثور على مشغلين في قاعدة البيانات. انقر أدناه لإنشاء حساب المدير الافتراضي.
            </p>
            <button
              type="button"
              disabled={bootstrapMut.isPending}
              onClick={() => bootstrapMut.mutate()}
              className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-amber-500 disabled:opacity-40"
            >
              {bootstrapMut.isPending ? 'جاري التهيئة…' : 'تهيئة حساب المدير الافتراضي (PIN: 0000)'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {(operatorsQ.data ?? []).map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => { setSelected(op); setPin(''); setError(null); }}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${selected?.id === op.id ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-navy-border/40 hover:border-cyan-500/30'}`}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold text-white"
                  style={{ background: op.avatarColor ?? '#0891b2' }}
                >
                  {initials(op.displayName)}
                </span>
                <span className="text-right">
                  <span className="block text-xs font-bold text-slate-100">{op.displayName}</span>
                  <span className="block text-[10px] text-slate-500">[{ROLE_LABEL[op.role]}]</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div key={shake} className={shake > 0 ? 'animate-[shake_0.3s_ease]' : undefined}>
          <div dir="ltr" className="flex items-center justify-center gap-2" aria-label="PIN">
            {Array.from({ length: Math.max(4, pin.length, 4) }).map((_, i) => (
              <span
                key={i}
                className={`h-3.5 w-3.5 rounded-full border ${i < pin.length ? 'border-cyan-400 bg-cyan-400' : 'border-slate-600'}`}
              />
            ))}
          </div>
        </div>

        <div dir="ltr" className="mx-auto grid max-w-[240px] grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                if (k === 'C') setPin('');
                else if (k === '⌫') setPin((p) => p.slice(0, -1));
                else press(k);
              }}
              className="flex h-12 items-center justify-center rounded-xl border border-navy-border/40 bg-white/[0.03] text-lg font-bold text-slate-100 hover:border-cyan-500/40 active:bg-cyan-500/10"
              aria-label={k === '⌫' ? 'مسح' : k === 'C' ? 'تصفير' : `رقم ${k}`}
            >
              {k === '⌫' ? <Delete className="h-5 w-5" /> : k}
            </button>
          ))}
        </div>

        {error && <p className="text-xs font-bold text-rose-400" role="alert">{error}</p>}
        {busy && <p className="text-xs text-slate-500">جاري التحقق…</p>}
      </div>
      <style>{`@keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }`}</style>
    </div>
  );
}
