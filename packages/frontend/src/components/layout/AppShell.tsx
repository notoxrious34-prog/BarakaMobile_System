import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X, Search, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { Sidebar } from './Sidebar';
import { BrandMark } from './BrandMark';
import { AdminSubNav } from './AdminSubNav';
import { NotificationBell } from './NotificationBell';
import { BottomStatusBar } from './BottomStatusBar';
import { WindowControls, toggleWindowMaximize } from './WindowControls';
import { UserWidget } from '@/features/auth/UserWidget';
import { GlobalSearch } from '../search/GlobalSearch';
import { CommandPalette } from '../CommandPalette';
import { useUiStore } from '@/store/ui.store';
import { PILLAR_NAV_ITEMS } from './navConfig';
import { api } from '@/lib/api';
import { useRepairSummary } from '@/features/repairs/hooks/useRepairs';

type CashBalance = { currentBalance: string };

function useCashBalance() {
  return useQuery<CashBalance>({
    queryKey: ['cash-balance'],
    queryFn: () => api.get<CashBalance>('/cash/balance'),
    staleTime: 30_000,
  });
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const openMobile = useUiStore((s) => s.openMobileNav);
  const closeMobile = useUiStore((s) => s.closeMobileNav);

  const cashQ = useCashBalance();
  const summaryQ = useRepairSummary();

  // AD-70: header capsule consumes openTotal — zero local recomputation.
  const activeRepairsCount = summaryQ.data?.openTotal ?? 0;

  const cashBalance = cashQ.data?.currentBalance ?? null;

  const formattedCash = (() => {
    if (cashBalance === null) return null;
    try {
      return new Decimal(cashBalance ?? '0').toFixed(2);
    } catch {
      return '0.00';
    }
  })();

  // Command palette state
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Flash/glow when cash balance changes (decimal.js comparison)
  const prevCashRef = useRef<string | null>(null);
  const [cashFlash, setCashFlash] = useState(false);
  useEffect(() => {
    if (cashBalance === null || cashQ.isLoading) return;
    const prev = prevCashRef.current;
    if (prev !== null) {
      try {
        const changed = !new Decimal(prev).equals(new Decimal(cashBalance));
        if (changed) {
          setCashFlash(true);
          const t = window.setTimeout(() => setCashFlash(false), 900);
          return () => window.clearTimeout(t);
        }
      } catch {
        if (prev !== cashBalance) {
          setCashFlash(true);
          const t = window.setTimeout(() => setCashFlash(false), 900);
          return () => window.clearTimeout(t);
        }
      }
    }
    prevCashRef.current = cashBalance;
  }, [cashBalance, cashQ.isLoading]);
  useEffect(() => {
    if (cashBalance !== null) prevCashRef.current = cashBalance;
  }, [cashBalance]);

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

  // Global F2 → POS new operation (no-op while already on the cockpit —
  // the cockpit's own F2 handler owns checkout there)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        if (location.pathname !== '/pos') navigate('/pos');
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (location.pathname !== '/flexy') navigate('/flexy');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, location.pathname]);

  // Global Ctrl+K / Cmd+K → Command palette
  useEffect(() => {
    function onPaletteKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onPaletteKey);
    return () => window.removeEventListener('keydown', onPaletteKey);
  }, []);

  const showAdminSubNav = location.pathname.startsWith('/admin');

  return (
    <div className="flex min-h-screen bg-navy-950 text-slate-100">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col min-w-0 bg-navy-950">
        {/* Command Center header — tri-zone luxury layout (TB-131, frameless drag) */}
        <header
          className="hidden md:flex h-16 items-center border-b border-cyan-500/10 bg-navy-900/95 backdrop-blur-md pe-0 ps-4 shrink-0 gap-4 app-drag"
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest('[data-nodrag]')) return;
            toggleWindowMaximize();
          }}
        >
          {/* Zone 1 (RTL start): omnibar search */}
          <div className="flex items-center flex-1 min-w-0 max-w-md app-no-drag" onClick={() => setPaletteOpen(true)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setPaletteOpen(true); }} aria-label="فتح لوحة الأوامر" data-nodrag>
            <GlobalSearch />
          </div>

          {/* Zone 2 (center): live financial + operational HUD */}
          <div className="hidden xl:flex items-center gap-2 shrink-0 app-no-drag" data-nodrag>
            {/* Cash Balance pill — emerald navy */}
            <div
              className={`hidden lg:inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg transition-all duration-300 ${
                cashFlash
                  ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300 shadow-emerald-400/30 ring-2 ring-emerald-400/20'
                  : 'border-emerald-400/25 bg-emerald-950/55 text-emerald-400 shadow-emerald-500/10'
              }`}
              title="الرصيد النقدي الحالي"
              aria-live="polite"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow shadow-emerald-400/50" aria-hidden="true" />
              <span>الصندوق:</span>
              <span dir="ltr" className="font-mono">
                {cashQ.isLoading ? '...' : formattedCash !== null ? `${formattedCash} د.ج` : '--'}
              </span>
            </div>

            {/* Active Repairs badge — amber navy */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-950/55 px-3 py-1.5 text-xs font-medium text-amber-400 shadow-lg shadow-amber-500/10"
              title="الإصلاحات النشطة"
            >
              <span className="h-2 w-2 rounded-full bg-amber-400 shadow shadow-amber-400/50" aria-hidden="true" />
              <span className="hidden sm:inline">الإصلاحات النشطة</span>
              <span dir="ltr" className="font-mono tabular-nums">
                {summaryQ.isLoading ? '...' : String(activeRepairsCount)}
              </span>
            </div>
          </div>

          {/* Zone 3 (RTL end): actions, profile, window controls */}
          <div className="ms-auto flex items-center gap-3 shrink-0 app-no-drag" data-nodrag>
            {/* CTA — cyan gradient with dark glow */}
            <button
              type="button"
              onClick={() => navigate('/pos')}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 shadow-lg shadow-cyan-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 transition-colors"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              عملية جديدة
              {location.pathname !== '/pos' && (
                <span className="hidden lg:inline rounded bg-navy-950/20 px-1.5 py-0.5 text-xs font-mono tabular-nums text-navy-950">F2</span>
              )}
            </button>
            <NotificationBell />
            <UserWidget />
            <span className="h-6 w-px bg-navy-border/40" aria-hidden="true" />
            <WindowControls />
          </div>
        </header>

        {/* Mobile TopBar — h-16 navy */}
        <header className="flex md:hidden h-16 items-center justify-between border-b border-cyan-500/10 bg-navy-900/95 backdrop-blur-md px-3 shrink-0">
          <button
            type="button"
            onClick={openMobile}
            aria-label="فتح القائمة"
            className="inline-flex items-center justify-center rounded-md p-2 text-slate-300 hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 min-h-11 min-w-11"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <span className="text-sm font-semibold text-slate-100">BarakaMobile</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <UserWidget />
            <span
              className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-950/55 px-2 py-1 text-xs font-mono text-emerald-400"
              dir="ltr"
            >
              {cashQ.isLoading ? '...' : formattedCash !== null ? formattedCash : '--'}
            </span>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="بحث"
              className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 min-h-11 min-w-11"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Admin Sub-Navigation */}
        {showAdminSubNav && <AdminSubNav />}

        <main className="flex-1 min-w-0 bg-navy-950 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>

        {/* Backup health footer (TB-129) */}
        <BottomStatusBar />
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" dir="rtl" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={closeMobile} aria-hidden="true" />
          <div className="relative z-50 flex max-w-xs w-full flex-col bg-gradient-to-b from-navy-900 to-navy-950 border-l border-navy-border/40 shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-navy-border/40 px-3">
              <div className="flex items-center gap-2">
                <BrandMark className="h-8 w-8" />
                <span className="text-sm font-semibold text-slate-100">BarakaMobile</span>
              </div>
              <button
                type="button"
                onClick={closeMobile}
                aria-label="إغلاق القائمة"
                className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100 min-h-11 min-w-11"
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
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors min-h-11 border ${
                      isActive
                        ? 'bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 text-cyan-400 border-cyan-500/30 border-r-2 border-r-cyan-500 shadow-lg shadow-cyan-500/10'
                        : 'text-slate-400 border-transparent hover:bg-white/[0.04] hover:text-slate-100'
                    }`}
                    onClick={closeMobile}
                  >
                    <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
            <div className="border-t border-navy-border/40 p-3">
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  navigate('/pos');
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 shadow-lg shadow-cyan-500/25"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                عملية جديدة
                {location.pathname !== '/pos' && (
                  <span className="rounded bg-navy-950/20 px-1.5 py-0.5 text-xs font-mono">F2</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
