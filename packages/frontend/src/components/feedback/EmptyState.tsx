import { Inbox } from 'lucide-react';

type Props = {
  title?: string;
  message?: string;
};

export function EmptyState({ title = 'لا توجد بيانات', message = 'لا توجد عناصر لعرضها حالياً.' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 px-6 py-10 text-center">
      <Inbox className="h-8 w-8 text-slate-500" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <p className="max-w-md text-sm text-slate-400">{message}</p>
    </div>
  );
}
