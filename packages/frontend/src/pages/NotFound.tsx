import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">الصفحة غير موجودة</h1>
      <p className="text-sm text-zinc-600">عذراً، الصفحة التي تبحث عنها غير موجودة.</p>
      <Link
        to="/"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        العودة إلى الرئيسية
      </Link>
    </div>
  );
}
