import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { CheckCircle2, XCircle } from 'lucide-react';

type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export function Dashboard() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">مرحباً بك في BarakaMobile</h1>
        <p className="mt-1 text-sm text-zinc-600">لوحة التحكم الرئيسية لإدارة نشاطك التجاري</p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-zinc-800">حالة الاتصال بالخادم</h2>

        {isLoading || isFetching ? (
          <Loading text="جاري التحقق من الاتصال..." />
        ) : isError ? (
          <ErrorState
            title="الخادم غير متصل"
            message={
              error instanceof Error
                ? `تعذر الاتصال بالخادم: ${error.message}`
                : 'تعذر الاتصال بالخادم. تأكد من أن الخادم يعمل على المنفذ 3001.'
            }
            onRetry={() => refetch()}
          />
        ) : data ? (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-emerald-800">متصل</p>
              <p className="text-sm text-emerald-700">
                الخادم يعمل بنجاح — الخدمة: <span className="font-mono">{data.service}</span>
              </p>
              <p className="text-xs text-emerald-600">
                الحالة: {data.status} · {new Date(data.timestamp).toLocaleString('ar-DZ')}
              </p>
              <pre className="mt-2 overflow-auto rounded bg-white p-3 text-xs text-zinc-700" dir="ltr">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
            <XCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <p className="text-sm text-amber-800">لا توجد بيانات للعرض.</p>
          </div>
        )}
      </section>
    </div>
  );
}
