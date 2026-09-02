type Props = { text?: string };

export function Loading({ text = 'جاري التحميل...' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400" role="status" aria-busy="true" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" aria-hidden="true" />
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}
