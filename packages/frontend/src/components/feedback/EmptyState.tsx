import { Inbox } from 'lucide-react';

type Props = {
  title?: string;
  message?: string;
};

export function EmptyState({ title = 'لا توجد بيانات', message = 'لا توجد عناصر لعرضها حالياً.' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center">
      <Inbox className="h-8 w-8 text-zinc-400" aria-hidden="true" />
      <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
      <p className="max-w-md text-sm text-zinc-500">{message}</p>
    </div>
  );
}
