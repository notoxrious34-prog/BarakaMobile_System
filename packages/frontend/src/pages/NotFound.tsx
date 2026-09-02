import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center font-sans" dir="rtl">
      <div className="flex w-full max-w-lg flex-col items-center gap-6 rounded-xl border border-slate-800 bg-slate-900 px-8 py-12 text-center shadow-lg">
        <p className="font-mono text-7xl font-extrabold tracking-tight text-cyan-500" aria-hidden="true">
          404
        </p>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-100">الصفحة غير موجودة</h1>
          <p className="text-sm text-slate-400">عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
        </div>
        <Link
          to="/"
          className="rounded-md bg-cyan-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          العودة إلى الرئيسية
        </Link>
      </div>
    </div>
  );
}
