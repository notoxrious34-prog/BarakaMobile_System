import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { GlobalSearch } from '../search/GlobalSearch';

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col min-w-0">
        <header className="flex h-14 items-center justify-center border-b border-zinc-200 bg-white px-4">
          <div className="w-full max-w-md">
            <GlobalSearch />
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
