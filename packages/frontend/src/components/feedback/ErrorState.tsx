import { AlertTriangle } from 'lucide-react';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ title = 'حدث خطأ', message = 'تعذر تحميل البيانات. حاول مرة أخرى.', onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 px-6 py-8 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-red-800">{title}</h3>
      <p className="max-w-md text-sm text-red-700">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
