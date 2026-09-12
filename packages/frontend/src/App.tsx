import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { PosPage } from '@/pages/PosPage';
import { NotFound } from '@/pages/NotFound';
import { AuthGate } from '@/features/auth/UserWidget';
import { RequireCapability } from '@/components/RequireCapability';
import { ImeiLookupHost } from '@/features/serials/ImeiLookupHost';
import { Loading } from '@/components/feedback/Loading';

// TASK-BRIEF-002 Stream 1: non-critical routed pages are lazy-loaded to
// reduce the initial bundle. AppShell/Dashboard/PosPage/AuthGate/guards/
// NotFound stay eager (shell + landing + auth infra per the brief).
const ContactsPage = lazy(() => import('@/pages/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const TransactionsPage = lazy(() => import('@/pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage })));
const RepairsPage = lazy(() => import('@/pages/RepairsPage').then((m) => ({ default: m.RepairsPage })));
const FlexyCockpitPage = lazy(() => import('@/pages/FlexyCockpitPage').then((m) => ({ default: m.FlexyCockpitPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const CatalogPage = lazy(() => import('@/pages/admin/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const StockCountPage = lazy(() => import('@/pages/StockCountPage').then((m) => ({ default: m.StockCountPage })));
const FinancePage = lazy(() => import('@/pages/admin/FinancePage').then((m) => ({ default: m.FinancePage })));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage').then((m) => ({ default: m.UsersPage })));
const SerialsPage = lazy(() => import('@/pages/SerialsPage').then((m) => ({ default: m.SerialsPage })));
const AlertsPage = lazy(() => import('@/pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));

function SerialsRoute() {
  const navigate = useNavigate();
  return (
    <SerialsPage
      onRepairTicket={(p) => {
        try {
          window.sessionStorage.setItem('bm_repair_prefill', JSON.stringify(p));
        } catch {
          /* referral lost — repairs still opens */
        }
        navigate('/repairs');
      }}
    />
  );
}

export default function App() {
  return (
    <AuthGate>
    <ImeiLookupHost />
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route element={<AppShell />}>
        {/* 4-Pillar primary routes */}
        <Route index element={<Dashboard />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="repairs" element={<RepairsPage />} />
        <Route path="flexy" element={<FlexyCockpitPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="watchdog" element={<Navigate to="/alerts" replace />} />

        {/* Admin pillar */}
        <Route path="admin">
          <Route index element={<Navigate to="contacts" replace />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="stock-count" element={<StockCountPage />} />
          <Route path="finance" element={<RequireCapability capability="canViewProfits"><FinancePage /></RequireCapability>} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="reports" element={<RequireCapability capability="canViewProfits"><ReportsPage /></RequireCapability>} />
          <Route path="users" element={<RequireCapability capability="canManageUsers"><UsersPage /></RequireCapability>} />
          <Route path="serials" element={<SerialsRoute />} />
        </Route>

        {/* Standalone settings — renders directly in AppShell, never under AdminLayout (TB-139).
            DIRECTIVE-004: hosts backup schedules — admin-only. */}
        <Route path="settings" element={<RequireCapability capability="canAccessBackups"><SettingsPage /></RequireCapability>} />

        {/* Legacy redirects — backwards compatibility */}
        <Route path="transactions" element={<Navigate to="/admin/transactions" replace />} />
        <Route path="contacts" element={<Navigate to="/admin/contacts" replace />} />
        <Route path="inventory" element={<Navigate to="/admin/catalog" replace />} />
        <Route path="services" element={<Navigate to="/admin/catalog" replace />} />
        <Route path="treasury" element={<Navigate to="/admin/finance" replace />} />
        <Route path="expenses" element={<Navigate to="/admin/finance" replace />} />
        <Route path="reports" element={<Navigate to="/admin/reports" replace />} />
        <Route path="admin/settings" element={<Navigate to="/settings" replace />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
    </AuthGate>
  );
}
