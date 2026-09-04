import { useMemo, useRef, useState } from 'react';
import { PackageSearch, ScanBarcode, X } from 'lucide-react';
import type { Item } from '@/features/inventory/hooks/useInventory';
import { to2dp, type AddResult } from '../hooks/usePosTicket';
import { playScanError, playScanSuccess } from '../utils/posAudio';

type Props = {
  items: Item[] | undefined;
  isLoading: boolean;
  onAdd: (item: Item, qty?: number) => AddResult | void;
  /** Structural ref type — accepts useRef<HTMLInputElement>(null) under React 18 types */
  searchRef: { current: HTMLInputElement | null };
};

/** Multiplier prefix: `3*SKU`, `3xSKU`, `3XSKU` (optional spaces). */
const MULT_RE = /^(\d+)\s*[xX*]\s*(.+)$/;

/**
 * Right panel (60%) — unified barcode/search input + high-density product grid.
 * Barcode path: exact SKU match (or `N*SKU` quantity prefix) adds instantly.
 * Category pills are intentionally deferred: Item has no category field and
 * the backend is frozen (AD-58) — pills arrive in Phase 2 with the migration.
 */
export function CatalogPanel({ items, isLoading, onAdd, searchRef }: Props) {
  const [query, setQuery] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const errorTimer = useRef<number | null>(null);

  const activeItems = useMemo(
    () => (items ?? []).filter((i) => i.isActive),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return activeItems;
    return activeItems.filter(
      (it) =>
        (it.name ?? '').toLowerCase().includes(q) ||
        (it.sku ?? '').toLowerCase().includes(q),
    );
  }, [activeItems, query]);

  function flash(id: string): void {
    setFlashId(id);
    window.setTimeout(() => {
      setFlashId((cur) => (cur === id ? null : cur));
    }, 350);
  }

  function showScanError(msg: string): void {
    setScanError(msg);
    playScanError();
    searchRef.current?.select();
    if (errorTimer.current !== null) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setScanError(null), 2500);
  }

  function addScanned(item: Item, qty: number): void {
    const stock = typeof item.currentStock === 'number' ? item.currentStock : 999999;
    if (stock <= 0 || stock < qty) {
      showScanError('الكمية غير متوفرة في المخزون');
      return;
    }
    const res = onAdd(item, qty);
    if (res === 'blocked') {
      showScanError('الكمية غير متوفرة في المخزون');
      return;
    }
    if (res === 'capped') {
      showScanError('الكمية تجاوزت المخزون — أُضيف المتاح فقط');
      flash(item.id);
      setQuery('');
      searchRef.current?.focus();
      return;
    }
    playScanSuccess();
    flash(item.id);
    setQuery('');
    searchRef.current?.focus();
  }

  function handleSubmit(): void {
    const raw = query.trim();
    if (raw === '') return;
    // Quantity prefix: "3*SKU" / "3xSKU" / "3XSKU"
    let qty = 1;
    let code = raw;
    const m = raw.match(MULT_RE);
    if (m) {
      qty = Math.max(1, Number.parseInt(m[1], 10) || 1);
      code = m[2].trim();
      if (code === '') {
        showScanError('الباركود غير مسجل');
        return;
      }
    }
    const lowered = code.toLowerCase();
    const exactSku = activeItems.find(
      (it) => (it.sku ?? '').toLowerCase() === lowered,
    );
    if (exactSku) {
      addScanned(exactSku, qty);
      return;
    }
    const exactName = activeItems.find(
      (it) => (it.name ?? '').toLowerCase() === lowered,
    );
    if (exactName) {
      addScanned(exactName, qty);
      return;
    }
    // Single visible filtered match → auto-add (scanner-friendly).
    const q = lowered;
    const visible = activeItems.filter(
      (it) =>
        (it.name ?? '').toLowerCase().includes(q) ||
        (it.sku ?? '').toLowerCase().includes(q),
    );
    if (visible.length === 1) {
      addScanned(visible[0], qty);
      return;
    }
    showScanError('الباركود غير مسجل');
  }

  function clear(): void {
    setQuery('');
    searchRef.current?.focus();
  }

  return (
    <section
      aria-label="كتالوج الأصناف"
      className="flex flex-col rounded-2xl border border-navy-border/40 bg-navy-900/60 backdrop-blur-md"
    >
      {/* Search / barcode bar */}
      <div className="shrink-0 border-b border-navy-border/30 p-2">
        <div className="relative">
          <ScanBarcode
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                clear();
              }
            }}
            placeholder="باركود / بحث بالاسم أو SKU…"
            autoFocus
            aria-label="باركود أو بحث عن صنف"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-2.5 pe-9 ps-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label="مسح البحث"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {query === '' && (
            <kbd
              dir="ltr"
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded border border-navy-border bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] text-amber-400"
            >
              F1
            </kbd>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-500">
            مسح دقيق لـ SKU يضيف الصنف فوراً · صيغة الكمية: <span dir="ltr" className="font-mono">3*SKU</span>
          </p>
          <span
            className={`flex shrink-0 items-center gap-1 text-[10px] font-bold ${focused ? 'text-emerald-400' : 'text-slate-500'}`}
            title="حالة الماسح"
          >
            <span className="relative flex h-2 w-2">
              {focused && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${focused ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            </span>
            {focused ? 'الماسح متصل' : 'الماسح جاهز'}
          </span>
        </div>
        {scanError && (
          <p className="mt-1 text-[11px] font-bold text-rose-400" role="alert">
            {scanError}
          </p>
        )}
      </div>

      {/* Product grid — expansive, breathes with the page */}
      <div className="min-h-[200px] p-3">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-xl border border-navy-border/30 bg-navy-800/40"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <PackageSearch className="h-8 w-8 text-slate-600" aria-hidden="true" />
            <p className="text-sm text-slate-400">لا توجد أصناف مطابقة</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((it) => {
              const stock = typeof it.currentStock === 'number' ? it.currentStock : 999999;
              const out = stock <= 0;
              const low = !out && stock <= 2;
              return (
                <button
                  key={it.id}
                  type="button"
                  disabled={out}
                  onClick={() => {
                    onAdd(it);
                    flash(it.id);
                  }}
                  className={`group flex min-h-28 flex-col justify-between gap-1 rounded-xl border bg-navy-950/60 p-2.5 text-right transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 motion-reduce:transition-none ${
                    out
                      ? 'cursor-not-allowed border-navy-border/20 opacity-45'
                      : flashId === it.id
                        ? 'border-cyan-400/60 bg-cyan-500/10'
                        : 'border-navy-border/30 hover:-translate-y-0.5 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/10 active:translate-y-0'
                  }`}
                  aria-label={out ? `${it.name} — نفذ المخزون` : `إضافة ${it.name} إلى السلة`}
                >
                  <span className="block truncate text-[13px] font-semibold text-slate-100">
                    {it.name}
                  </span>
                  {it.sku && (
                    <span className="block truncate font-mono text-[11px] text-slate-500" dir="ltr">
                      {it.sku}
                    </span>
                  )}
                  <span className="flex items-center justify-between gap-1">
                    <span dir="ltr" className="font-mono text-base font-extrabold text-emerald-400">
                      {to2dp(it.sellingPrice ?? '0')}
                    </span>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 font-mono text-[11px] ${
                        out
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                          : low
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {out ? 'نفذ' : stock > 9999 ? 'متوفر' : low ? `${stock} منخفض` : `${stock} متوفر`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
