import { useEffect } from 'react';
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, Search, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { AdminSubNav } from './AdminSubNav';
import { GlobalSearch } from '../search/GlobalSearch';
import { useUiStore } from '@/store/ui.store';
import { PILLAR_NAV_ITEMS } from './navConfig';
import { api } from '@/lib/api';

type CashBalance = { currentBalance: string };
type RepairTicket = { status: string };

function useCashBalance() {
  return useQuery<CashBalance>({
    queryKey: ['cash-balance'],
    queryFn: () => api.get<CashBalance>('/cash/balance'),
    staleTime: 30_000,
  });
}

function useActiveRepairsCount() {
  return useQuery<RepairTicket[]>({
    queryKey: ['repairs', null],
    queryFn: () => api.get<RepairTicket[]>('/repair'),
    staleTime: 30_000,
    select: (data) =>
      // Trick to keep pipeline count without breaking type: return raw array
      data as unknown as RepairTicket[],
  });
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const openMobile = useUiStore((s) => s.openMobileNav);
  const closeMobile = useUiStore((s) => s.closeMobileNav);

  const cashQ = useCashBalance();
  const repairsQ = useActiveRepairsCount();

  const activeRepairsCount = (() => {
    const list = (repairsQ.data as unknown as RepairTicket[] | undefined) ?? [];
    if (!Array.isArray(list)) return 0;
    const active = list.filter((r) => !['DELIVERED', 'CANCELLED'].includes(r.status));
    return active.length;
  })();

  const cashBalance = cashQ.data?.currentBalance ?? null;

  // Close drawer on route change
  useEffect(() => {
    closeMobile();
  }, [location.pathname, closeMobile]);

  // Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMobile();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, closeMobile]);

  // Body scroll lock
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  // Global F2 → POS new operation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        navigate('/pos');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const showAdminSubNav = location.pathname.startsWith('/admin');

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col min-w-0 bg-slate-950">
        {/* TopBar h-16 — desktop + mobile unified height */}
        <header className="hidden md:flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 shrink-0 gap-4">
          {/* Brand + Search */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-600 text-sm font-bold text-white shrink-0">
              ب
            </div>
            <span className="hidden lg:block text-sm font-semibold text-slate-100 shrink-0">
              BarakaMobile
            </span>
            <div className="w-full max-w-md">
              <GlobalSearch />
            </div>
          </div>

          {/* Live indicators + CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Cash Balance pill — live */}
            <div
              className="hidden lg:inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400"
              title="الرصيد النقدي الحالي"
              aria-live="polite"
            >
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" aria-hidden="true" />
              <span>الصندوق:</span>
              <span dir="ltr" className="font-mono">
                {cashQ.isLoading ? '...' : cashBalance !== null ? `${Number(cashBalance).toFixed(2)} د.ج` : '--'}
              </span>
            </div>

            {/* Active Repairs badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400"
              title="الإصلاحات النشطة"
            >
              <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
              <span className="hidden sm:inline">الإصلاحات النشطة</span>
              <span dir="ltr" className="font-mono">
                {repairsQ.isLoading ? '...' : String(activeRepairsCount)}
              </span>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={() => navigate('/pos')}
              className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              عملية جديدة
              <span className="hidden lg:inline rounded bg-cyan-700 px-1.5 py-0.5 text-xs font-mono">F2</span>
            </button>
          </div>
        </header>

        {/* Mobile TopBar — h-16 too */}
        <header className="flex md:hidden h-16 items-center justify-between border-b border-slate-800 bg-slate-900 px-3 shrink-0">
          <button
            type="button"
            onClick={openMobile}
            aria-label="فتح القائمة"
            className="inline-flex items-center justify-center rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 min-h-11 min-w-11"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-600 text-sm font-bold text-white">ب</div>
            <span className="text-sm font-semibold text-slate-100">BarakaMobile</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full bg-cyan-500/10 px-2 py-1 text-xs font-mono text-cyan-400 border border-cyan-500/20"
              dir="ltr"
            >
              {cashQ.isLoading ? '...' : cashBalance !== null ? Number(cashBalance).toFixed(2) : '--'}
            </span>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('mobile-search-trigger');
                el?.click();
              }}
              aria-label="بحث"
              className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 min-h-11 min-w-11"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Admin Sub-Navigation */}
        {showAdminSubNav && <AdminSubNav />}

        <main className="flex-1 min-w-0 bg-slate-950 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" dir="rtl" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={closeMobile} aria-hidden="true" />
          <div className="relative z-50 flex max-w-xs w-full flex-col bg-slate-900 border-l border-slate-800 shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-slate-800 px-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-600 text-sm font-bold text-white">ب</div>
                <span className="text-sm font-semibold text-slate-100">BarakaMobile</span>
              </div>
              <button
                type="button"
                onClick={closeMobile}
                aria-label="إغلاق القائمة"
                className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 min-h-11 min-w-11"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 p-2 overflow-y-auto" aria-label="التنقل الرئيسي">
              {PILLAR_NAV_ITEMS.map((item) => {
                const isActive =
                  item.to === '/'
                    ? location.pathname === '/'
                    : location.pathname === item.to || location.pathname.startsWith(item.to + '/');
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    aria-label={item.label}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors min-h-11 ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-500'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                    }`}
                    onClick={closeMobile}
                  >
                    <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
            <div className="border-t border-slate-800 p-3">
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  navigate('/pos');
                }}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                عملية جديدة
                <span className="rounded bg-cyan-700 px-1.5 py-0.5 text-xs font-mono">F2</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
