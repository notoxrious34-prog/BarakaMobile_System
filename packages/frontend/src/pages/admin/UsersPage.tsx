import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, KeyRound, Power } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth, type Role } from '@/features/auth/AuthContext';

type User = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  avatarColor: string | null;
  lastLoginAt: string | null;
};

const ROLES: { value: Role; label: string }[] = [
  { value: 'ADMIN', label: 'مدير — صلاحيات كاملة' },
  { value: 'CASHIER', label: 'كاشير — مبيعات وزبائن وصيانة استلام' },
  { value: 'TECHNICIAN', label: 'فني — ورشة الصيانة وقطع الغيار' },
];

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  CASHIER: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  TECHNICIAN: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

async function fetchUsers(): Promise<User[]> {
  return api.get<User[]>('/users');
}

export function UsersPage() {
  const { capabilities } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('CASHIER');
  const [error, setError] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');

  const usersQ = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });

  const createMut = useMutation({
    mutationFn: () => api.post<User>('/users', { username: username.trim(), displayName: displayName.trim(), pin, role }),
    onSuccess: () => { setShowCreate(false); setUsername(''); setDisplayName(''); setPin(''); setError(null); refresh(); },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذر إنشاء المستخدم'),
  });
  const toggleMut = useMutation({
    mutationFn: (u: User) => api.post<User>(`/users/${u.id}/active`, { isActive: !u.isActive }),
    onSuccess: () => { refresh(); },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذر تغيير الحالة'),
  });
  const pinMut = useMutation({
    mutationFn: () => api.post(`/users/${pinTarget!.id}/reset-pin`, { newPin }),
    onSuccess: () => { setPinTarget(null); setNewPin(''); setError(null); },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : 'تعذر تغيير الـ PIN'),
  });

  if (!capabilities.canManageUsers) {
    return (
      <div dir="rtl" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
        <p className="text-sm font-bold text-rose-300">إدارة المستخدمين للمدراء فقط</p>
      </div>
    );
  }

  const inputCls = 'rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50';

  return (
    <div dir="rtl" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold text-slate-100">المستخدمون والصلاحيات</h2>
        <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-extrabold text-navy-950 hover:bg-cyan-500">
          <Plus className="h-4 w-4" /> إضافة مستخدم جديد
        </button>
      </div>
      {error && <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300" role="alert">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60">
        <div className="scrollbar-premium overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-navy-border/30 text-xs text-slate-400">
                <th className="px-3 py-2 text-right">المستخدم</th>
                <th className="px-3 py-2 text-right">الدور</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">آخر دخول</th>
                <th className="px-3 py-2 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {(usersQ.data ?? []).map((u) => (
                <tr key={u.id} className="border-b border-navy-border/20 last:border-0">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: u.avatarColor ?? '#0891b2' }}>
                        {u.displayName.slice(0, 2)}
                      </span>
                      <span>
                        <span className="block text-xs font-bold text-slate-100">{u.displayName}</span>
                        <span dir="ltr" className="block font-mono text-[10px] text-slate-500">@{u.username}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2"><span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${ROLE_BADGE[u.role]}`}>{u.role === 'ADMIN' ? 'مدير' : u.role === 'CASHIER' ? 'كاشير' : 'فني'}</span></td>
                  <td className="px-3 py-2 text-xs text-slate-300">{u.isActive ? 'نشط' : 'موقوف'}</td>
                  <td className="px-3 py-2 text-xs text-slate-500" dir="ltr">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar-DZ') : '—'}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => toggleMut.mutate(u)} disabled={u.username === 'admin'} title={u.username === 'admin' ? 'المدير الأساسي محمي' : 'تفعيل/إيقاف'} className="rounded-md p-1.5 text-slate-400 hover:bg-white/[0.06] disabled:opacity-30">
                        <Power className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => { setPinTarget(u); setNewPin(''); }} title="تغيير الـ PIN" className="rounded-md p-1.5 text-amber-400 hover:bg-amber-500/10">
                        <KeyRound className="h-4 w-4" />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4" role="dialog" aria-modal="true" aria-label="مستخدم جديد">
          <div className="w-full max-w-sm space-y-2 rounded-2xl border border-navy-border/40 bg-navy-900 p-4">
            <h3 className="text-sm font-extrabold text-slate-100">إضافة مستخدم جديد</h3>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="الاسم المعروض…" className={`${inputCls} w-full`} />
            <input type="text" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username…" className={`${inputCls} w-full font-mono`} />
            <input type="password" dir="ltr" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="PIN (4-6 أرقام)…" className={`${inputCls} w-full font-mono`} />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={`${inputCls} w-full`}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <div className="flex gap-2">
              <button type="button" disabled={createMut.isPending} onClick={() => createMut.mutate()} className="flex-1 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-40">إنشاء</button>
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-navy-border/40 px-3 py-2 text-xs text-slate-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {pinTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4" role="dialog" aria-modal="true" aria-label="تغيير PIN">
          <div className="w-full max-w-sm space-y-2 rounded-2xl border border-navy-border/40 bg-navy-900 p-4">
            <h3 className="text-sm font-extrabold text-slate-100">تغيير PIN — {pinTarget.displayName}</h3>
            <input type="password" dir="ltr" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="PIN جديد (4-6 أرقام)…" className={`${inputCls} w-full font-mono`} />
            <div className="flex gap-2">
              <button type="button" disabled={pinMut.isPending || !/^\d{4,6}$/.test(newPin)} onClick={() => pinMut.mutate()} className="flex-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-extrabold text-navy-950 hover:bg-amber-500 disabled:opacity-40">حفظ</button>
              <button type="button" onClick={() => setPinTarget(null)} className="flex-1 rounded-xl border border-navy-border/40 px-3 py-2 text-xs text-slate-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
