const HINTS: Array<{ keys: string; label: string }> = [
  { keys: 'F1', label: 'بحث' },
  { keys: 'F2', label: 'دفع سريع' },
  { keys: 'Esc', label: 'إلغاء' },
  { keys: 'Enter', label: 'إضافة SKU' },
];

export function PosShortcutsBar() {
  return (
    <footer
      aria-label="اختصارات الكاشير"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-navy-border/40 bg-navy-900/60 px-4 py-2 backdrop-blur-md"
    >
      {HINTS.map((h) => (
        <span key={h.keys} className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <kbd
            dir="ltr"
            className="rounded-md border border-navy-border/40 bg-navy-950/80 px-1.5 py-0.5 font-mono text-[11px] font-bold text-cyan-300"
          >
            {h.keys}
          </kbd>
          {h.label}
        </span>
      ))}
    </footer>
  );
}
