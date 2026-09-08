import { Lock, ArrowLeftRight } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth, type Role } from '@/features/auth/AuthContext';
import { PinLockScreen } from '@/features/auth/PinLockScreen';

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

/** Topbar operator widget: avatar + role badge + lock/switch actions. */
export function UserWidget() {
  const { user, lock, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 sm:flex" title={user.username}>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold text-white"
          style={{ background: user.avatarColor ?? '#0891b2' }}
        >
          {initials(user.displayName)}
        </span>
        <span className="text-right leading-tight">
          <span className="block max-w-28 truncate text-xs font-bold text-slate-100">{user.displayName}</span>
          <span className="block text-[10px] text-slate-500">[{ROLE_LABEL[user.role]}]</span>
        </span>
      </div>
      <button
        type="button"
        onClick={lock}
        title="قفل الشاشة (تبديل سريع للمشغّل)"
        aria-label="قفل الشاشة"
        className="rounded-xl border border-navy-border/40 p-2 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={logout}
        title="تسجيل الخروج"
        aria-label="تسجيل الخروج"
        className="rounded-xl border border-navy-border/40 p-2 text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
      >
        <Lock className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Gate wrapper: locked session → full-screen PIN pad (no reload switching). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, locked, lock } = useAuth();

  // Ctrl+L / F12 → instant lock for fast operator switching.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey && e.key.toLowerCase() === 'l') || e.key === 'F12') {
        e.preventDefault();
        lock();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lock]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-950">
        <p className="text-sm text-slate-500">جاري التحقق من الجلسة…</p>
      </div>
    );
  }
  if (locked) return <PinLockScreen />;
  return <>{children}</>;
}
