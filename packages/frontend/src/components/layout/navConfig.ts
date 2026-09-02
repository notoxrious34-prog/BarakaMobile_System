import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  Zap,
  Wrench,
  Receipt,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/contacts', label: 'جهات الاتصال', icon: Users },
  { to: '/inventory', label: 'المخزون', icon: Package },
  { to: '/services', label: 'الخدمات', icon: Zap },
  { to: '/transactions', label: 'المعاملات', icon: Receipt },
  { to: '/repairs', label: 'الإصلاحات', icon: Wrench },
  { to: '/treasury', label: 'الخزينة', icon: Wallet },
  { to: '/expenses', label: 'المصاريف', icon: CreditCard },
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
];
