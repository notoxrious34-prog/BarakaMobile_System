import { NavLink, useLocation } from 'react-router-dom';
import { ADMIN_NAV_ITEMS } from './navConfig';
import { useAuth } from '@/features/auth/AuthContext';

export function AdminSubNav() {
  const { pathname } = useLocation();
  const { capabilities } = useAuth();

  // Only render when inside /admin/*
  if (!pathname.startsWith('/admin')) return null;
  const visible = ADMIN_NAV_ITEMS.filter((i) => !i.adminOnly || capabilities.canManageUsers);

  return (
    <div className="border-b border-navy-border/30 bg-navy-900/80 backdrop-blur-md px-4" dir="rtl">
      <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="التنقل الإداري">
        {visible.map((item) => {
          const isActive =
            pathname === item.to ||
            (item.to !== '/admin' && pathname.startsWith(item.to));
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-navy-border/30'
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
