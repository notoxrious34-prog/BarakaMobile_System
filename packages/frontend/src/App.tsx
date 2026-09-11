import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { ContactsPage } from '@/pages/ContactsPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { PosPage } from '@/pages/PosPage';
import { RepairsPage } from '@/pages/RepairsPage';
import { FlexyCockpitPage } from '@/pages/FlexyCockpitPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFound } from '@/pages/NotFound';
import { CatalogPage } from '@/pages/admin/CatalogPage';
import { StockCountPage } from '@/pages/StockCountPage';
import { FinancePage } from '@/pages/admin/FinancePage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { SerialsPage } from '@/pages/SerialsPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { AuthGate } from '@/features/auth/UserWidget';
import { RequireCapability } from '@/components/RequireCapability';
import { ImeiLookupHost } from '@/features/serials/ImeiLookupHost';

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
    </AuthGate>
  );
}
