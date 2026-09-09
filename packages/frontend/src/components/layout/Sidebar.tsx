import { NavLink, useLocation } from 'react-router-dom';
import { ChevronsRight } from 'lucide-react';
import { useUiStore } from '@/store/ui.store';
import { PILLAR_NAV_ITEMS, SYSTEM_NAV_ITEMS, type NavItem } from './navConfig';
import { BrandMark } from './BrandMark';
import { useAuth } from '@/features/auth/AuthContext';

function SideItem({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const isActive =
    item.to === '/'
      ? pathname === '/'
      : pathname === item.to || pathname.startsWith(item.to + '/');
  const tip = item.shortcut ? `${item.label} [${item.shortcut}]` : item.label;
  return (
    <div className="group relative">
      <NavLink
        to={item.to}
        end={item.to === '/'}
        aria-label={item.label}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 min-h-11 border ${
          isActive
            ? 'bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 text-cyan-400 border-cyan-500/30 border-r-2 border-r-cyan-500 shadow-lg shadow-cyan-500/10'
            : 'text-slate-400 border-transparent hover:bg-white/[0.04] hover:text-slate-100 hover:border-navy-border/30'
        } ${collapsed ? 'justify-center' : 'justify-start'}`}
      >
        <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && item.shortcut && (
          <kbd dir="ltr" className="ms-auto rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-400">
            {item.shortcut}
          </kbd>
        )}
        {collapsed && <span className="sr-only">{item.label}</span>}
      </NavLink>
      {/* Floating tooltip in collapsed mode (RTL: opens to the left of the rail) */}
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-navy-border/40 bg-navy-950 px-2.5 py-1.5 text-xs font-bold text-slate-100 shadow-xl group-hover:inline-flex"
        >
          {tip}
          {item.shortcut && (
            <kbd dir="ltr" className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-300">
              {item.shortcut}
            </kbd>
          )}
        </span>
      )}
    </div>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { capabilities } = useAuth();
  const systemItems = SYSTEM_NAV_ITEMS.filter((i) => !i.adminOnly || capabilities.canManageUsers);

  return (
    <aside
      className={`hidden md:flex shrink-0 flex-col bg-gradient-to-b from-navy-900 to-navy-950 border-l border-navy-border/40 transition-all duration-300 ease-in-out font-sans ${
        collapsed ? 'w-16' : 'w-60'
      }`}
      aria-label="الشريط الجانبي"
    >
      <div className="flex h-16 items-center gap-3 border-b border-navy-border/40 bg-navy-900 px-3">
        <BrandMark className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight text-slate-100">
            BarakaMobile
          </span>
        )}
      </div>

      {/* Operational top section */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="التنقل الرئيسي">
        {PILLAR_NAV_ITEMS.map((item) => (
          <SideItem key={item.to} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </nav>

      {/* System & Administration — pinned bottom section (TB-130) */}
      <div className="shrink-0 border-t border-border/40 mx-2 my-2" aria-hidden="true" />
      <nav className="shrink-0 px-2 pb-1" aria-label="النظام والإدارة">
        {systemItems.map((item) => (
          <SideItem key={item.to} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </nav>

      <div className="shrink-0 border-t border-navy-border/40 p-2">
        <div className="rounded-2xl border border-navy-border/30 bg-white/[0.03] p-1.5">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
            title={collapsed ? 'توسيع' : 'طي'}
            className="flex w-full items-center justify-center rounded-xl px-3 py-2 text-slate-400 hover:bg-white/[0.06] hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950 min-h-11 transition-colors border border-transparent hover:border-navy-border/20"
          >
            <ChevronsRight
              className={`h-5 w-5 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}
              aria-hidden="true"
            />
            {!collapsed && <span className="ms-3 flex-1 text-right text-sm">طي الشريط</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
