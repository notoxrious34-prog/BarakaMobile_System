type Props = { className?: string };

export function Skeleton({ className }: Props) {
  return <div className={`animate-pulse rounded-md bg-slate-800 ${className ?? ''}`} aria-hidden="true" />;
}
