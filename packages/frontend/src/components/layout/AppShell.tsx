import { useEffect } from 'react';
import { Outlet, useLocation, NavLink } from 'react-router-dom';
import { Menu, X, Search } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { GlobalSearch } from '../search/GlobalSearch';
import { useUiStore } from '@/store/ui.store';
import { NAV_ITEMS } from './navConfig';

export function AppShell() {
  const location = useLocation();
  const mobileOpen = useUiStore((s) => s.mobileNavOpen);
  const openMobile = useUiStore((s) => s.openMobileNav);
  const closeMobile = useUiStore((s) => s.closeMobileNav);

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

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col min-w-0 bg-slate-950">
        {/* TopBar - md hidden pattern inverted: desktop header hidden on mobile, mobile bar hidden on desktop */}
        {/* Desktop header with centered search */}
        <header className="hidden md:flex h-14 items-center justify-center border-b border-slate-800 bg-slate-900 px-4">
          <div className="w-full max-w-md">
            <GlobalSearch />
          </div>
        </header>

        {/* Mobile TopBar */}
        <header className="flex md:hidden h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-3 shrink-0">
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
          <div className="flex items-center">
            {/* GlobalSearch collapsed to icon on mobile - trigger via custom event */}
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

        <main className="flex-1 min-w-0 bg-slate-950 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden" dir="rtl" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={closeMobile} aria-hidden="true" />
          <div className="relative z-50 flex max-w-xs w-full flex-col bg-slate-900 border-l border-slate-800 shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-800 px-3">
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
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors min-h-11 ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-500'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                    }`
                  }
                  onClick={closeMobile}
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
