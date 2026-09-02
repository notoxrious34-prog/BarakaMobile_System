import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { GlobalSearch } from '../search/GlobalSearch';

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col min-w-0 bg-slate-950">
        <header className="flex h-14 items-center justify-center border-b border-slate-800 bg-slate-900 px-4">
          <div className="w-full max-w-md">
            <GlobalSearch />
          </div>
        </header>
        <main className="flex-1 min-w-0 bg-slate-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
