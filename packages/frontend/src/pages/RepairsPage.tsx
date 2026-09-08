import { useMemo, useState } from 'react';
import { PackageSearch, Plus } from 'lucide-react';
import { BrandMark } from '@/components/layout/BrandMark';
import {
  useRepairsQuery,
  useRepairMetricsQuery,
  type RepairTicket,
} from '@/features/repairs/hooks/useRepairs';
import { RepairDetailModal } from '@/features/repairs/components/RepairDetailModal';
import { RepairIntakeModal } from '@/features/repairs/components/RepairIntakeModal';
import {
  REPAIR_STATUS_ORDER,
  deviceLabel,
  repairTypeLabel,
  statusBox,
  statusLabel,
} from '@/features/repairs/utils/repairLabels';

const DEVICE_FILTERS = ['', 'PHONE', 'TABLET', 'LAPTOP', 'OTHER'] as const;
const TYPE_FILTERS = ['', 'INTERNAL', 'EXTERNAL'] as const;

function deviceFilterLabel(v: string): string {
  if (v === '') return 'كل الأجهزة';
  return deviceLabel(v);
}

function typeFilterLabel(v: string): string {
  if (v === '') return 'كل الأنواع';
  return repairTypeLabel(v);
}

/**
 * TB-072 Repairs Cockpit — Golden Standard shell: BrandMark header, live
 * metric badges, kanban/high-density table views, omnisearch (ticket,
 * customer, phone, model, technician), status/device/type pills.
 */
export function RepairsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [repairTypeFilter, setRepairTypeFilter] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showIntake, setShowIntake] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'kanban'>('kanban');

  const repairsQ = useRepairsQuery({
    status: statusFilter || undefined,
    repairType: repairTypeFilter || undefined,
  });
  const finMetrics = useRepairMetricsQuery();
  const metricsQ = useRepairsQuery();

  const metrics = useMemo(() => {
    const all = metricsQ.data ?? [];
    const count = (s: string) => all.filter((t) => t.status === s).length;
    return {
      active: all.filter((t) => t.status !== 'DELIVERED' && t.status !== 'CANCELLED').length,
      diagnosing: count('DIAGNOSING'),
      inRepair: count('IN_REPAIR'),
      ready: count('READY'),
    };
  }, [metricsQ.data]);

  const filtered = useMemo(() => {
    let list = repairsQ.data ?? [];
    if (deviceFilter) list = list.filter((t) => t.deviceType === deviceFilter);
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((t) =>
      t.ticketNumber.toLowerCase().includes(s) ||
      (t.contact?.name ?? '').toLowerCase().includes(s) ||
      (t.deviceBrand ?? '').toLowerCase().includes(s) ||
      (t.deviceModel ?? '').toLowerCase().includes(s) ||
      (t.technicianName ?? '').toLowerCase().includes(s),
    );
  }, [repairsQ.data, deviceFilter, search]);

  function openTicket(id: string): void {
    setSelectedId(id);
  }

  function Metric({ label, value, tone }: { label: string; value: number | string; tone: string }) {
    return (
      <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 px-3 py-2">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p dir="ltr" className={`mt-0.5 font-mono text-base font-bold ${tone}`}>{value}</p>
      </div>
    );
  }

  function MoneyMetric({ label, value, tone, suffix }: { label: string; value: string | undefined; tone: string; suffix: string }) {
    return (
      <div className="rounded-xl border border-navy-border/30 bg-navy-900/60 px-3 py-2">
        <p className="text-[11px] text-slate-500">{label}</p>
        <p dir="ltr" className={`mt-0.5 font-mono text-base font-bold ${tone}`}>{value ?? '…'} <span className="text-[10px]">{suffix}</span></p>
      </div>
    );
  }

  function TicketCard({ t }: { t: RepairTicket }) {
    return (
      <button
        type="button"
        onClick={() => openTicket(t.id)}
        className="w-full rounded-xl border border-navy-border/30 bg-navy-950/60 p-2.5 text-right transition-all hover:border-amber-500/40"
      >
        <div className="flex items-center justify-between gap-2">
          <span dir="ltr" className="font-mono text-xs font-bold text-slate-100">{t.ticketNumber}</span>
          <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-bold ${statusBox(t.status)}`}>
            {statusLabel(t.status)}
          </span>
        </div>
        <p className="mt-1 truncate text-[13px] font-semibold text-slate-100">
          {t.deviceBrand} {t.deviceModel}
        </p>
        <p className="truncate text-[11px] text-slate-500">
          {t.contact?.name ?? '—'}
          {t.technicianName ? ` · ${t.technicianName}` : ''}
        </p>
        <p className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-slate-500">{deviceLabel(t.deviceType)}</span>
          <span dir="ltr" className="font-mono font-bold text-amber-400">{t.estimatedCost}</span>
        </p>
      </button>
    );
  }

  return (
    <div dir="rtl" className="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3 font-sans">
      {/* Cockpit header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-100">ورشة الصيانة</h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">تتبع الأجهزة من الاستلام حتى التسليم</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowIntake(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-extrabold text-navy-950 hover:bg-cyan-500"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          استلام جهاز
        </button>
      </div>

      {/* Metric badges */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="تذاكر نشطة" value={metrics.active} tone="text-slate-100" />
        <Metric label="قيد التشخيص" value={metrics.diagnosing} tone="text-amber-400" />
        <Metric label="قيد الإصلاح" value={metrics.inRepair} tone="text-violet-300" />
        <Metric label="جاهزة للاستلام" value={metrics.ready} tone="text-emerald-400" />
      </div>

      {/* Financial badges (TB-119) */}
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
        <MoneyMetric label="صافي أرباح الصيانة (الشهر)" value={finMetrics.data?.monthNetProfit} tone="text-cyan-300" suffix="د.ج" />
        <MoneyMetric label="إيراد الصيانة (الشهر)" value={finMetrics.data?.monthRevenue} tone="text-slate-100" suffix="د.ج" />
        <MoneyMetric label="تكلفة القطع (الشهر)" value={finMetrics.data?.monthPartsCost} tone="text-rose-400" suffix="د.ج" />
        <Metric label="قطع مستهلكة (كمية)" value={finMetrics.data?.consumedPartsQty ?? '…'} tone="text-amber-400" />
      </div>

      {/* Toolbar: view toggle + omnisearch */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border border-navy-border/40 text-xs font-bold">
          <button
            type="button"
            onClick={() => setView('kanban')}
            className={`px-3 py-2 ${view === 'kanban' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            الأعمدة
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={`px-3 py-2 ${view === 'table' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            الجدول
          </button>
        </div>
        <div className="relative min-w-52 flex-1">
          <PackageSearch className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث: رقم التذكرة، العميل، الهاتف، الموديل، الفني…"
            aria-label="بحث شامل"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-2 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex shrink-0 flex-wrap gap-1.5">
        {[{ v: '', l: 'كل الحالات' }, ...REPAIR_STATUS_ORDER.map((s) => ({ v: s, l: statusLabel(s) }))].map((f) => (
          <button
            key={f.v || 'all'}
            type="button"
            onClick={() => setStatusFilter(f.v)}
            className={`h-7 rounded-lg border px-2 py-0.5 text-xs font-bold ${statusFilter === f.v ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-navy-border/40 text-slate-400 hover:text-slate-200'}`}
          >
            {f.l}
          </button>
        ))}
        <span className="mx-1 h-7 w-px bg-navy-border/40" aria-hidden="true" />
        {DEVICE_FILTERS.map((d) => (
          <button
            key={d || 'all-d'}
            type="button"
            onClick={() => setDeviceFilter(d)}
            className={`h-7 rounded-lg border px-2 py-0.5 text-xs font-bold ${deviceFilter === d ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-navy-border/40 text-slate-400 hover:text-slate-200'}`}
          >
            {deviceFilterLabel(d)}
          </button>
        ))}
        <span className="mx-1 h-7 w-px bg-navy-border/40" aria-hidden="true" />
        {TYPE_FILTERS.map((t) => (
          <button
            key={t || 'all-t'}
            type="button"
            onClick={() => setRepairTypeFilter(t)}
            className={`h-7 rounded-lg border px-2 py-0.5 text-xs font-bold ${repairTypeFilter === t ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-navy-border/40 text-slate-400 hover:text-slate-200'}`}
          >
            {typeFilterLabel(t)}
          </button>
        ))}
      </div>

      {/* Board */}
      <div className="min-h-[200px] flex-1">
        {repairsQ.isLoading ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-navy-border/30 bg-navy-800/40" />
            ))}
          </div>
        ) : repairsQ.isError ? (
          <div className="rounded-2xl border border-rose-500/20 bg-navy-900 p-6 text-center">
            <p className="text-sm text-rose-300">تعذر تحميل التذاكر</p>
            <button type="button" onClick={() => repairsQ.refetch()} className="mt-2 rounded-xl bg-rose-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-rose-500">إعادة المحاولة</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <PackageSearch className="h-8 w-8 text-slate-600" aria-hidden="true" />
            <p className="text-sm text-slate-400">لا توجد تذاكر مطابقة</p>
          </div>
        ) : view === 'table' ? (
          <div className="overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900/60">
            <div className="scrollbar-premium overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-border/30 text-xs text-slate-500">
                    <th className="px-3 py-2 text-right font-bold">التذكرة</th>
                    <th className="px-3 py-2 text-right font-bold">الجهاز</th>
                    <th className="px-3 py-2 text-right font-bold">العميل</th>
                    <th className="px-3 py-2 text-right font-bold">الفني</th>
                    <th className="px-3 py-2 text-right font-bold">التقديرية</th>
                    <th className="px-3 py-2 text-right font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} onClick={() => openTicket(t.id)} className="cursor-pointer border-b border-navy-border/20 transition-colors last:border-0 hover:bg-white/[0.03]">
                      <td dir="ltr" className="px-3 py-2 text-left font-mono text-xs font-bold text-slate-100">{t.ticketNumber}</td>
                      <td className="px-3 py-2 text-slate-100">{t.deviceBrand} {t.deviceModel}</td>
                      <td className="px-3 py-2 text-slate-300">{t.contact?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-300">{t.technicianName ?? '—'}</td>
                      <td dir="ltr" className="px-3 py-2 text-left font-mono font-bold text-amber-400">{t.estimatedCost}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusBox(t.status)}`}>
                          {statusLabel(t.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {REPAIR_STATUS_ORDER.filter((s) => !statusFilter || s === statusFilter).map((s) => {
              const col = filtered.filter((t) => t.status === s);
              if (statusFilter === '' && col.length === 0) return null;
              return (
                <div key={s} className="rounded-2xl border border-navy-border/30 bg-navy-900/40 p-2">
                  <p className="mb-2 flex items-center justify-between px-1 text-xs font-bold text-slate-300">
                    {statusLabel(s)}
                    <span dir="ltr" className="font-mono text-slate-500">{col.length}</span>
                  </p>
                  <div className="space-y-2">
                    {col.map((t) => (
                      <TicketCard key={t.id} t={t} />
                    ))}
                    {col.length === 0 && <p className="py-4 text-center text-[11px] text-slate-600">فارغ</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showIntake && (
        <RepairIntakeModal
          onCreated={(id) => {
            setShowIntake(false);
            setSelectedId(id);
          }}
          onClose={() => setShowIntake(false)}
        />
      )}
      {selectedId && (
        <RepairDetailModal ticketId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
