import { useState, useRef, useEffect } from 'react';
import { Plus, Search, ScanLine, Printer, CheckCircle, XCircle } from 'lucide-react';
import { Loading } from '@/components/feedback/Loading';
import { ErrorState } from '@/components/feedback/ErrorState';
import { EmptyState } from '@/components/feedback/EmptyState';
import {
  useStockCountsQuery,
  useStockCountQuery,
  useCreateStockCountMutation,
  useScanStockCountMutation,
  useReconcileStockCountMutation,
  useCancelStockCountMutation,
  useVarianceFilter,
  netVariance,
  useScanBeep,
  type VarianceFilter,
} from '@/features/inventory/hooks/useStockCount';

const FILTER_TABS: { value: VarianceFilter; label: string }[] = [
  { value: 'ALL', label: 'جميع المواد' },
  { value: 'DIFF', label: 'المواد ذات الفروقات' },
  { value: 'DEFICIT', label: 'نقص مخزني' },
  { value: 'SURPLUS', label: 'فائض مخزني' },
  { value: 'MATCHED', label: 'المطابقة تماماً' },
];

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'مسودة', cls: 'text-slate-400 border-slate-500/30 bg-slate-500/10' },
  IN_PROGRESS: { label: 'جارية', cls: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
  COMPLETED: { label: 'مكتملة', cls: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  CANCELLED: { label: 'ملغاة', cls: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.DRAFT;
  return <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}

export function StockCountPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  return activeId ? (
    <StockCountWorkspace sessionId={activeId} onBack={() => setActiveId(null)} />
  ) : (
    <StockCountHub onOpen={setActiveId} />
  );
}

function StockCountHub({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: sessions, isLoading, isError, error, refetch } = useStockCountsQuery();
  const createMut = useCreateStockCountMutation();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-slate-100">الجرد الدوري للمخزون</h2>
      </div>

      <div className="rounded-2xl border border-navy-border/40 bg-navy-900/60 p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-200">بدء جلسة جرد جديدة</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: جرد نهاية الشهر"
            className="flex-1 rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات (اختياري)"
            className="flex-1 rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
          />
          <button
            type="button"
            disabled={name.trim() === '' || createMut.isPending}
            onClick={() => createMut.mutate(
              { name: name.trim(), notes: notes.trim() || undefined },
              { onSuccess: (d) => { setName(''); setNotes(''); onOpen(d.id); } },
            )}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-cyan-500 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> بدء الجرد (شامل)
          </button>
        </div>
        {createMut.isError && <p className="mt-2 text-xs text-rose-400">{(createMut.error as Error).message}</p>}
      </div>

      {isLoading ? <Loading /> : isError ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : !sessions || sessions.length === 0 ? (
        <EmptyState title="لا توجد جلسات جرد بعد" message="ابدأ أول جلسة جرد شامل من الأعلى" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60">
          <div className="scrollbar-premium overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-navy-border/30 text-xs text-slate-400">
                  <th className="px-3 py-2 text-right">رقم الجلسة</th>
                  <th className="px-3 py-2 text-right">الاسم</th>
                  <th className="px-3 py-2 text-right">التاريخ</th>
                  <th className="px-3 py-2 text-right">الفارق الكمي</th>
                  <th className="px-3 py-2 text-right">الأثر المالي (د.ج)</th>
                  <th className="px-3 py-2 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer border-b border-navy-border/20 hover:bg-white/[0.03]">
                    <td dir="ltr" className="px-3 py-2 font-mono text-xs text-cyan-300">{s.sessionNumber}</td>
                    <td className="px-3 py-2 font-bold text-slate-200">{s.name}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{new Date(s.startedAt).toLocaleDateString('ar-DZ')}</td>
                    <td dir="ltr" className={`px-3 py-2 font-mono text-xs font-bold ${s.totalDiscrepancyQty < 0 ? 'text-rose-400' : s.totalDiscrepancyQty > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{s.totalDiscrepancyQty}</td>
                    <td dir="ltr" className="px-3 py-2 font-mono text-xs text-slate-300">{s.totalFinancialVariance}</td>
                    <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StockCountWorkspace({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const { data: session, isLoading, isError, error, refetch } = useStockCountQuery(sessionId);
  const scanMut = useScanStockCountMutation(sessionId);
  const reconcileMut = useReconcileStockCountMutation();
  const cancelMut = useCancelStockCountMutation();
  const beep = useScanBeep();
  const { filter, setFilter, search, setSearch, filtered } = useVarianceFilter(session?.items);
  const [scanInput, setScanInput] = useState('');
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);
  const [confirmReconcile, setConfirmReconcile] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scanRef.current?.focus(); }, [sessionId]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  const net = netVariance(session?.items);
  const netNegative = net.trim().startsWith('-');
  const netPositive = !netNegative && !/^0(\.00)?$/.test(net.trim());
  const counted = session?.items.filter((r) => r.countedQuantity > 0).length ?? 0;
  const total = session?.items.length ?? 0;
  const open = session?.status === 'IN_PROGRESS' || session?.status === 'DRAFT';

  const submitScan = (raw: string) => {
    const code = raw.trim();
    if (!code || !open) return;
    scanMut.mutate(
      { sku: code, quantityDelta: 1 },
      {
        onSuccess: () => { beep(true); setFlash('ok'); setScanInput(''); scanRef.current?.focus(); },
        onError: () => { beep(false); setFlash('err'); },
      },
    );
  };

  if (isLoading) return <Loading />;
  if (isError || !session) return <ErrorState message={(error as Error)?.message ?? 'تعذر تحميل الجلسة'} onRetry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} className="rounded-xl border border-navy-border/40 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40">→ رجوع للجلسات</button>
        <h2 className="text-base font-extrabold text-slate-100">{session.name}</h2>
        <span dir="ltr" className="font-mono text-xs text-cyan-300">{session.sessionNumber}</span>
        <StatusBadge status={session.status} />
        <div className="ms-auto flex gap-2">
          <span className="rounded-xl border border-navy-border/40 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">
            المجرودة: <bdi className="font-mono font-bold text-slate-100">{counted}/{total}</bdi>
          </span>
          <span className={`rounded-xl border px-3 py-1.5 text-xs ${netNegative ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : netPositive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-navy-border/40 bg-white/[0.03] text-slate-300'}`}>
            صافي الفارق المالي: <bdi className="font-mono font-bold">{net} د.ج</bdi>
          </span>
        </div>
      </div>

      {open && (
        <div className={`rounded-2xl border p-3 transition-colors ${flash === 'ok' ? 'border-emerald-500/60 bg-emerald-500/[0.08]' : flash === 'err' ? 'border-rose-500/60 bg-rose-500/[0.08]' : 'border-cyan-500/25 bg-cyan-500/[0.04]'}`}>
          <label className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-300"><ScanLine className="h-4 w-4" /> إدخال سريع بالباركود / SKU (Enter للترحيل +1)</label>
          <input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitScan(scanInput); }}
            placeholder="امسح أو اكتب الـ SKU ثم Enter…"
            dir="ltr"
            autoFocus
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50"
          />
          {scanMut.isError && <p className="mt-1 text-xs text-rose-400">{(scanMut.error as Error).message}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {FILTER_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setFilter(t.value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${filter === t.value ? 'bg-cyan-600 text-white' : 'border border-navy-border/40 text-slate-400 hover:border-cyan-500/40'}`}
          >
            {t.label}
          </button>
        ))}
        <div className="relative ms-auto">
          <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم / SKU…"
            className="rounded-xl border border-navy-border/40 bg-navy-950/60 py-1.5 pe-8 ps-3 text-xs text-slate-100 outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60">
        <div className="scrollbar-premium max-h-[50vh] overflow-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="sticky top-0 bg-navy-900">
              <tr className="border-b border-navy-border/30 text-xs text-slate-400">
                <th className="px-3 py-2 text-right">الباركود / SKU</th>
                <th className="px-3 py-2 text-right">المنتج</th>
                <th className="px-3 py-2 text-right">رصيد النظام</th>
                <th className="px-3 py-2 text-right">المحسوب فعلياً</th>
                <th className="px-3 py-2 text-right">الفارق</th>
                <th className="px-3 py-2 text-right">التكلفة</th>
                <th className="px-3 py-2 text-right">القيمة المالية</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-navy-border/20">
                  <td dir="ltr" className="px-3 py-1.5 font-mono text-xs text-slate-400">{r.inventoryItem.sku ?? '—'}</td>
                  <td className="px-3 py-1.5 font-bold text-slate-200">{r.inventoryItem.name}</td>
                  <td dir="ltr" className="px-3 py-1.5 font-mono text-xs text-slate-300">{r.expectedQuantity}</td>
                  <td className="px-3 py-1.5">
                    {open ? (
                      <CountCell
                        value={r.countedQuantity}
                        onCommit={(v) => scanMut.mutate({ inventoryItemId: r.inventoryItemId, exactQuantity: v })}
                      />
                    ) : (
                      <span dir="ltr" className="font-mono text-xs text-slate-200">{r.countedQuantity}</span>
                    )}
                  </td>
                  <td dir="ltr" className={`px-3 py-1.5 font-mono text-xs font-bold ${r.differenceQuantity < 0 ? 'text-rose-400' : r.differenceQuantity > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {r.differenceQuantity > 0 ? `+${r.differenceQuantity}` : r.differenceQuantity}
                  </td>
                  <td dir="ltr" className="px-3 py-1.5 font-mono text-xs text-slate-400">{r.unitCost}</td>
                  <td dir="ltr" className={`px-3 py-1.5 font-mono text-xs ${r.varianceValue.trim().startsWith('-') ? 'text-rose-400' : /^0(\.00)?$/.test(r.varianceValue.trim()) ? 'text-slate-500' : 'text-emerald-400'}`}>{r.varianceValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-xl border border-navy-border/40 px-4 py-2 text-xs font-bold text-slate-200 hover:border-cyan-500/40">
          <Printer className="h-4 w-4" /> طباعة تقرير الفروقات
        </button>
        {open && (
          <>
            <button
              type="button"
              onClick={() => setConfirmReconcile(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-500"
            >
              <CheckCircle className="h-4 w-4" /> اعتماد وتسوية المخزون
            </button>
            <button
              type="button"
              disabled={cancelMut.isPending}
              onClick={() => { if (window.confirm('إلغاء جلسة الجرد؟ لن يمس المخزون.')) cancelMut.mutate(session.id); }}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
            >
              <XCircle className="h-4 w-4" /> إلغاء الجلسة
            </button>
          </>
        )}
      </div>
      {(reconcileMut.isError || cancelMut.isError) && (
        <p className="text-xs text-rose-400">{((reconcileMut.error ?? cancelMut.error) as Error).message}</p>
      )}

      {confirmReconcile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="تأكيد التسوية">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-navy-900 p-4">
            <h3 className="text-sm font-extrabold text-amber-300">تحذير: تسوية نهائية للمخزون</h3>
            <p className="mt-2 text-xs leading-6 text-slate-300">
              سيتم اعتماد الكميات المحسوبة فعلياً بدل الأرصدة الرقمية، وتقييد حركات تسوية (ADJUSTMENT) لكل مادة ذات فارق.
              الصافي المالي: <bdi className="font-mono font-bold">{net} د.ج</bdi>. لا يمكن التراجع بعد الاعتماد.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={reconcileMut.isPending}
                onClick={() => reconcileMut.mutate(session.id, { onSuccess: () => setConfirmReconcile(false) })}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-40"
              >
                {reconcileMut.isPending ? 'جاري التسوية…' : 'تأكيد الاعتماد'}
              </button>
              <button type="button" onClick={() => setConfirmReconcile(false)} className="flex-1 rounded-xl border border-navy-border/40 px-3 py-2 text-xs text-slate-300">تراجع</button>
            </div>
          </div>
        </div>
      )}

      <div id="stock-count-report" className="hidden print:block">
        <h3>محضر جرد وتسوية مخزون</h3>
        <p>الجلسة: {session.sessionNumber} — {session.name} — {new Date(session.startedAt).toLocaleString('ar-DZ')}</p>
        <p>الصافي الكمي: {session.totalDiscrepancyQty} — الصافي المالي: {net} د.ج</p>
        <table>
          <thead><tr><th>المنتج</th><th>SKU</th><th>النظام</th><th>الفعلي</th><th>الفارق</th><th>القيمة</th></tr></thead>
          <tbody>
            {(session.items ?? []).filter((r) => r.differenceQuantity !== 0).map((r) => (
              <tr key={r.id}>
                <td>{r.inventoryItem.name}</td><td>{r.inventoryItem.sku ?? '—'}</td>
                <td>{r.expectedQuantity}</td><td>{r.countedQuantity}</td>
                <td>{r.differenceQuantity}</td><td>{r.varianceValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>توقيع مسؤول الجرد: ـــــــــ توقيع إدارة المحل: ـــــــــ</p>
      </div>
    </div>
  );
}

function CountCell({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const v = Number(text.trim());
        if (text.trim() !== String(value) && Number.isInteger(v) && v >= 0) onCommit(v);
        else setText(String(value));
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-20 rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-1 font-mono text-xs text-slate-100 outline-none focus:border-cyan-500/50"
    />
  );
}
