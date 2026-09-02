import { NavLink, useLocation } from 'react-router-dom';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useUiStore } from '@/store/ui.store';
import { PILLAR_NAV_ITEMS } from './navConfig';

export function Sidebar() {
  const { pathname } = useLocation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={`hidden md:flex shrink-0 flex-col bg-slate-900 border-slate-800 transition-all duration-200 ${
        collapsed ? 'md:w-16 lg:w-16' : 'md:w-16 lg:w-64'
      } border-l ${collapsed ? '' : 'lg:border-l'}`}
      aria-label="الشريط الجانبي"
    >
      <div className="flex h-16 items-center gap-3 border-b border-slate-800 bg-slate-900 px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-600 text-sm font-bold text-white">
          ب
        </div>
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
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors min-h-11 ${
                isActive
                  ? 'bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-500'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
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

      <div className="hidden lg:block border-t border-slate-800 p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
          title={collapsed ? 'توسيع' : 'طي'}
          className="flex w-full items-center justify-center rounded-md px-3 py-2 text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 min-h-11"
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
    </aside>
  );
}
