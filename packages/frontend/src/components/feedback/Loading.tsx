type Props = { text?: string };

export function Loading({ text = 'جاري التحميل...' }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-zinc-600" role="status" aria-busy="true" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden="true" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
