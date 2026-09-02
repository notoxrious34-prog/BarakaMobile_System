import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  Wrench,
  Receipt,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useUiStore } from '@/store/ui.store';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/contacts', label: 'جهات الاتصال', icon: Users },
  { to: '/inventory', label: 'المخزون', icon: Package },
  { to: '/services', label: 'الخدمات', icon: Wrench },
  { to: '/transactions', label: 'المعاملات', icon: Receipt },
  { to: '/repairs', label: 'الإصلاحات', icon: Wrench },
  { to: '/treasury', label: 'الخزينة', icon: Wallet },
  { to: '/expenses', label: 'المصاريف', icon: CreditCard },
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
];

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={`flex shrink-0 flex-col bg-slate-900 border-slate-800 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      } border-l`}
      aria-label="الشريط الجانبي"
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-900 px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-600 text-sm font-bold text-white">
          ب
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight text-slate-100">BarakaMobile</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="التنقل الرئيسي">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={collapsed ? item.label : undefined}
            aria-label={item.label}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse control */}
      <div className="border-t border-slate-800 p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
          title={collapsed ? 'توسيع' : 'طي'}
          className="flex w-full items-center justify-center rounded-md px-3 py-2 text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
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
