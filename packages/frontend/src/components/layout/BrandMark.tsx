import brandEmblem from '@/assets/brand/baraka-emblem.png';

export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <img
      src={brandEmblem}
      alt="بركة موبايل"
      draggable={false}
      className={`${className} shrink-0 rounded-lg object-contain`}
    />
  );
}
