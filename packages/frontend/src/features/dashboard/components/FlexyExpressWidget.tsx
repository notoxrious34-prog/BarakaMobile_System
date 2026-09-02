import { useNavigate } from 'react-router-dom';

export function FlexyExpressWidget() {
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-slate-900 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <span aria-hidden>⚡</span>
        </span>
        <h2 className="text-sm font-semibold text-cyan-400">فليكسي إكسبريس</h2>
        <span className="mr-auto rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-300">قريباً</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        تعبئة الرصيد وبيع الأرصدة متاحة عبر مركز الخدمات. أنشئ خدمة فليكسي من صفحة الخدمات وتابعها كأي خدمة رقمية.
      </p>
      <button
        type="button"
        onClick={() => navigate('/services')}
        className="mt-3 w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      >
        الذهاب إلى الخدمات
      </button>
    </div>
  );
}
