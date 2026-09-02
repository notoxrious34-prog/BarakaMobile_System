import { AlertTriangle } from 'lucide-react';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ title = 'حدث خطأ', message = 'تعذر تحميل البيانات. حاول مرة أخرى.', onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-6 py-8 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-rose-400" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-rose-400">{title}</h3>
      <p className="max-w-md text-sm text-rose-300/80">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
