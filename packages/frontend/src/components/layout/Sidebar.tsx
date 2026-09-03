import { NavLink, useLocation } from 'react-router-dom';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useUiStore } from '@/store/ui.store';
import { PILLAR_NAV_ITEMS } from './navConfig';
import { BrandMark } from './BrandMark';

export function Sidebar() {
  const { pathname } = useLocation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={`hidden md:flex shrink-0 flex-col bg-gradient-to-b from-navy-900 to-navy-950 border-navy-border/40 transition-all duration-200 font-sans ${
        collapsed ? 'md:w-16 lg:w-16' : 'md:w-16 lg:w-60'
      } border-l ${collapsed ? '' : 'lg:border-l'}`}
      aria-label="الشريط الجانبي"
    >
      <div className="flex h-16 items-center gap-3 border-b border-navy-border/40 bg-navy-900 px-3">
        <BrandMark className="h-9 w-9" />
        {!collapsed && (
          <span className="hidden lg:block truncate text-sm font-semibold tracking-tight text-slate-100">
            BarakaMobile
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="التنقل الرئيسي">
        {PILLAR_NAV_ITEMS.map((item) => {
          const isActive =
            item.to === '/'
              ? pathname === '/'
              : pathname === item.to || pathname.startsWith(item.to + '/');
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              aria-label={item.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all min-h-11 border ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 text-cyan-400 border-cyan-500/30 border-r-2 border-r-cyan-500 shadow-lg shadow-cyan-500/10'
                  : 'text-slate-400 border-transparent hover:bg-white/[0.04] hover:text-slate-100 hover:border-navy-border/30'
              } ${collapsed ? 'justify-center lg:justify-start' : 'lg:justify-start justify-center'}`}
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className={`${collapsed ? 'hidden lg:hidden' : 'hidden lg:inline'} truncate`}>
                {item.label}
              </span>
              {collapsed && <span className="lg:hidden sr-only">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="hidden lg:block border-t border-navy-border/40 p-2">
        <div className="rounded-2xl border border-navy-border/30 bg-white/[0.03] p-1.5">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
            title={collapsed ? 'توسيع' : 'طي'}
            className="flex w-full items-center justify-center rounded-xl px-3 py-2 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 min-h-11 transition-colors border border-transparent hover:border-navy-border/20"
          >
            {collapsed ? (
              <PanelRightClose className="h-5 w-5" aria-hidden="true" />
            ) : (
              <>
                <PanelRightOpen className="h-5 w-5" aria-hidden="true" />
                <span className="ms-3 flex-1 text-right text-sm">طي الشريط</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
