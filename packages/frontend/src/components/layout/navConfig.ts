import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Wrench,
  Shield,
  Users,
  Package,
  ClipboardList,
  Smartphone,
  Zap,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  shortcut?: string;
  /** Shown only to ADMIN operators (Users, Backups). */
  adminOnly?: boolean;
};

// 4-Pillar Primary Navigation (AD-57) + Flexy operations module (TB-108)
export const PILLAR_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/pos', label: 'نقطة البيع', icon: Receipt, shortcut: 'F2' },
  { to: '/repairs', label: 'الإصلاحات', icon: Wrench },
  { to: '/flexy', label: 'فليكسي', icon: Zap, shortcut: 'F3' },
  { to: '/admin', label: 'الإدارة', icon: Shield },
];

// Admin Sub-Navigation (TB-130: 7 operational tabs; TB-139: Settings lives
// standalone at /settings, reachable from the sidebar system section)
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: '/admin/contacts', label: 'جهات الاتصال', icon: Users },
  { to: '/admin/catalog', label: 'الكتالوج', icon: Package },
  { to: '/admin/stock-count', label: 'الجرد', icon: ClipboardList },
  { to: '/admin/finance', label: 'المالية', icon: Wallet },
  { to: '/admin/transactions', label: 'المعاملات', icon: Receipt },
  { to: '/admin/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/admin/serials', label: 'الأجهزة والـ IMEI', icon: Smartphone },
];

// System & Administration — pinned sidebar bottom section (TB-130)
export const SYSTEM_NAV_ITEMS: NavItem[] = [
  { to: '/settings', label: 'الإعدادات', icon: Settings },
  { to: '/admin/users', label: 'المستخدمون', icon: Users, adminOnly: true },
];

// Finance sub-tabs
export const FINANCE_SUB_TABS = [
  { id: 'cash', label: 'الصندوق النقدي', icon: Wallet },
  { id: 'expenses', label: 'المصاريف', icon: CreditCard },
] as const;

// Catalog sub-tabs
export const CATALOG_SUB_TABS = [
  { id: 'products', label: 'المنتجات والمخزون', icon: Package },
  { id: 'services', label: 'الخدمات', icon: Zap },
] as const;

// Legacy — kept for backwards compat, do not use in new shell
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
