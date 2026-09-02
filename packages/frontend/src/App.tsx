import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { ContactsPage } from '@/pages/ContactsPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { RepairsPage } from '@/pages/RepairsPage';
import { TreasuryPage } from '@/pages/TreasuryPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFound } from '@/pages/NotFound';
import { CatalogPage } from '@/pages/admin/CatalogPage';
import { FinancePage } from '@/pages/admin/FinancePage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* 4-Pillar primary routes */}
        <Route index element={<Dashboard />} />
        <Route path="pos" element={<TransactionsPage />} />
        <Route path="repairs" element={<RepairsPage />} />

        {/* Admin pillar */}
        <Route path="admin">
          <Route index element={<Navigate to="contacts" replace />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Legacy redirects — backwards compatibility */}
        <Route path="transactions" element={<Navigate to="/pos" replace />} />
        <Route path="contacts" element={<Navigate to="/admin/contacts" replace />} />
        <Route path="inventory" element={<Navigate to="/admin/catalog" replace />} />
        <Route path="services" element={<Navigate to="/admin/catalog" replace />} />
        <Route path="treasury" element={<Navigate to="/admin/finance" replace />} />
        <Route path="expenses" element={<Navigate to="/admin/finance" replace />} />
        <Route path="reports" element={<Navigate to="/admin/reports" replace />} />
        <Route path="settings" element={<Navigate to="/admin/settings" replace />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
