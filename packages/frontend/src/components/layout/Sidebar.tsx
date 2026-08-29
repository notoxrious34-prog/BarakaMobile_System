import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  Wrench,
  Receipt,
  BarChart3,
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
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
];

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={`flex shrink-0 flex-col border-zinc-200 bg-white transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      } border-l`}
      aria-label="الشريط الجانبي"
    >
      {/* Brand */}
      <div className="flex h-14 items-center gap-3 border-b border-zinc-200 px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-sm font-bold text-white">
          ب
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight text-zinc-900">BarakaMobile</span>
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
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
              } ${collapsed ? 'justify-center' : ''}`
            }
          >
            <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse control */}
      <div className="border-t border-zinc-200 p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'طي الشريط الجانبي'}
          title={collapsed ? 'توسيع' : 'طي'}
          className="flex w-full items-center justify-center rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
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
