import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings2, Wrench, ShieldCheck, X } from 'lucide-react';
import {
  useRepairAlerts,
  useWarrantyAlerts,
  useWatchdogSettings,
  useUpdateWatchdogSettings,
} from '@/features/watchdog/hooks/useWatchdog';
import { useAuth } from '@/features/auth/AuthContext';
import { Skeleton } from '@/components/feedback/Skeleton';
import { EmptyState } from '@/components/feedback/EmptyState';
import type { RepairAlertItem, WarrantyAlertItem } from '@/types/watchdog';

type Tab = 'repairs' | 'warranties';

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-CA');
};

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 ${
        active
          ? 'bg-cyan-600 text-navy-950'
          : 'border border-navy-border/40 text-slate-300 hover:bg-white/[0.06]'
      }`}
    >
      {children}
    </button>
  );
}

function RepairRows({ items }: { items: RepairAlertItem[] }) {
  return (
    <>
      {/* Desktop table */}
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-navy-border/30 text-right text-xs text-slate-400">
            <th className="px-3 py-2 font-bold">رقم التذكرة</th>
            <th className="px-3 py-2 font-bold">العميل</th>
            <th className="px-3 py-2 font-bold">الجهاز</th>
            <th className="px-3 py-2 font-bold">نوع العطل</th>
            <th className="px-3 py-2 font-bold">تاريخ التسليم المتوقع</th>
            <th className="px-3 py-2 font-bold">أيام التأخير</th>
            <th className="px-3 py-2 font-bold">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} className="border-b border-navy-border/20 text-slate-200">
              <td dir="ltr" className="px-3 py-2.5 font-mono">{r.ticketNumber}</td>
              <td className="px-3 py-2.5">{r.customerName}</td>
              <td className="px-3 py-2.5">{r.deviceName}</td>
              <td className="px-3 py-2.5 text-slate-400">{r.faultType}</td>
              <td dir="ltr" className="px-3 py-2.5 font-mono">{fmtDate(r.expectedDate)}</td>
              <td dir="ltr" className="px-3 py-2.5 font-mono font-bold tabular-nums">{r.daysOverdue}</td>
              <td className="px-3 py-2.5">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.severity === 'CRITICAL' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  {r.severity === 'CRITICAL' ? 'حرج' : 'متأخر'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Mobile stacked cards (AD-64) */}
      <div className="grid gap-2.5 md:hidden">
        {items.map((r) => (
          <div key={r.id} className="rounded-2xl border border-navy-border/30 bg-navy-900/60 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span dir="ltr" className="font-mono text-sm font-bold text-slate-100">{r.ticketNumber}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.severity === 'CRITICAL' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>
                {r.severity === 'CRITICAL' ? 'حرج' : 'متأخر'} · <span dir="ltr" className="font-mono tabular-nums">{r.daysOverdue}</span> يوم
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-200">{r.deviceName} — {r.customerName}</p>
            <p className="mt-0.5 text-xs text-slate-400">متوقع: <span dir="ltr" className="font-mono">{fmtDate(r.expectedDate)}</span> · {r.faultType}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function WarrantyRows({ items }: { items: WarrantyAlertItem[] }) {
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-navy-border/30 text-right text-xs text-slate-400">
            <th className="px-3 py-2 font-bold">IMEI</th>
            <th className="px-3 py-2 font-bold">المنتج</th>
            <th className="px-3 py-2 font-bold">العميل</th>
            <th className="px-3 py-2 font-bold">تاريخ البيع</th>
            <th className="px-3 py-2 font-bold">تاريخ انتهاء الضمان</th>
            <th className="px-3 py-2 font-bold">الأيام المتبقية</th>
            <th className="px-3 py-2 font-bold">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.id} className="border-b border-navy-border/20 text-slate-200">
              <td dir="ltr" className="px-3 py-2.5 font-mono">{w.imei}</td>
              <td className="px-3 py-2.5">{w.productName}</td>
              <td className="px-3 py-2.5">{w.customerName}</td>
              <td dir="ltr" className="px-3 py-2.5 font-mono">{fmtDate(w.saleDate)}</td>
              <td dir="ltr" className="px-3 py-2.5 font-mono">{fmtDate(w.warrantyEndDate)}</td>
              <td dir="ltr" className="px-3 py-2.5 font-mono font-bold tabular-nums">{w.daysRemaining}</td>
              <td className="px-3 py-2.5">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${w.status === 'EXPIRED' ? 'bg-slate-500/15 text-slate-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                  {w.status === 'EXPIRED' ? 'منتهي' : 'قريب الانتهاء'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid gap-2.5 md:hidden">
        {items.map((w) => (
          <div key={w.id} className="rounded-2xl border border-navy-border/30 bg-navy-900/60 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span dir="ltr" className="font-mono text-sm font-bold text-slate-100">{w.imei}</span>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${w.status === 'EXPIRED' ? 'bg-slate-500/15 text-slate-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                {w.status === 'EXPIRED' ? 'منتهي' : `متبقٍ ${w.daysRemaining} يوم`}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-slate-200">{w.productName} — {w.customerName}</p>
            <p className="mt-0.5 text-xs text-slate-400">ينتهي: <span dir="ltr" className="font-mono">{fmtDate(w.warrantyEndDate)}</span></p>
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const settingsQ = useWatchdogSettings();
  const updateMut = useUpdateWatchdogSettings();
  const [grace, setGrace] = useState('');
  const [alert, setAlert] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (settingsQ.data) {
      setGrace(String(settingsQ.data.repairGraceDays));
      setAlert(String(settingsQ.data.warrantyAlertDays));
    }
  }, [settingsQ.data]);

  async function save() {
    setMsg(null);
    const g = Number.parseInt(grace, 10);
    const a = Number.parseInt(alert, 10);
    if (!Number.isInteger(g) || g < 1 || !Number.isInteger(a) || a < 1) {
      setMsg({ ok: false, text: 'القيم يجب أن تكون أعداداً صحيحة ≥ 1' });
      return;
    }
    try {
      await updateMut.mutateAsync({ repairGraceDays: g, warrantyAlertDays: a });
      setMsg({ ok: true, text: 'تم حفظ الإعدادات بنجاح' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'فشل الحفظ' });
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-950/80 p-4" role="dialog" aria-modal="true" aria-label="إعدادات المراقبة">
      <div className="w-full max-w-sm rounded-2xl border border-navy-border/40 bg-navy-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-100">إعدادات المراقبة</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-bold text-slate-300">فترة السماح لتأخر الصيانة (بالأيام)</span>
          <input type="number" min={1} value={grace} onChange={(e) => setGrace(e.target.value)} dir="ltr"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-slate-100 outline-none focus:border-cyan-500/50" />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-bold text-slate-300">فترة التنبيه لاقتراب انتهاء الضمان (بالأيام)</span>
          <input type="number" min={1} value={alert} onChange={(e) => setAlert(e.target.value)} dir="ltr"
            className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-slate-100 outline-none focus:border-cyan-500/50" />
        </label>
        {msg && (
          <p role={msg.ok ? 'status' : 'alert'} className={`mb-3 text-xs font-bold ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {msg.text}
          </p>
        )}
        <button type="button" onClick={() => void save()} disabled={updateMut.isPending}
          className="w-full rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50">
          {updateMut.isPending ? 'جاري الحفظ…' : 'حفظ'}
        </button>
      </div>
    </div>
  );
}

export function AlertsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'warranties' ? 'warranties' : 'repairs';
  const repairFilter = params.get('filter') ?? 'all';
  const warrantyFilter = params.get('filter') ?? 'all';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const repairsQ = useRepairAlerts(tab === 'repairs' ? (['all', 'delayed', 'critical'].includes(repairFilter) ? repairFilter : 'all') : 'all');
  const warrantiesQ = useWarrantyAlerts(tab === 'warranties' ? (['all', 'expiring', 'expired'].includes(warrantyFilter) ? warrantyFilter : 'all') : 'all');

  function setTab(t: Tab) {
    setParams(t === 'repairs' ? { tab: 'repairs', filter: 'all' } : { tab: 'warranties', filter: 'all' });
  }
  function setFilter(f: string) {
    setParams({ tab, filter: f });
  }

  const rFilter = ['all', 'delayed', 'critical'].includes(repairFilter) ? repairFilter : 'all';
  const wFilter = ['all', 'expiring', 'expired'].includes(warrantyFilter) ? warrantyFilter : 'all';
  const repairs = repairsQ.data?.items ?? [];
  const warranties = warrantiesQ.data?.items ?? [];
  const loading = tab === 'repairs' ? repairsQ.isLoading : warrantiesQ.isLoading;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold text-slate-100">مركز التنبيهات</h1>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="إعدادات المراقبة"
            className="inline-flex items-center gap-1.5 rounded-xl border border-navy-border/40 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.06]"
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            الإعدادات
          </button>
        )}
      </div>

      <div className="flex gap-2" role="tablist" aria-label="أقسام التنبيهات">
        <button type="button" role="tab" aria-selected={tab === 'repairs'} onClick={() => setTab('repairs')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold ${tab === 'repairs' ? 'bg-cyan-600 text-navy-950' : 'border border-navy-border/40 text-slate-300'}`}>
          <Wrench className="h-4 w-4" aria-hidden="true" />
          تذاكر الصيانة المتأخرة
        </button>
        <button type="button" role="tab" aria-selected={tab === 'warranties'} onClick={() => setTab('warranties')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold ${tab === 'warranties' ? 'bg-cyan-600 text-navy-950' : 'border border-navy-border/40 text-slate-300'}`}>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          الضمانات
        </button>
      </div>

      {tab === 'repairs' ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <FilterBtn active={rFilter === 'all'} onClick={() => setFilter('all')}>الكل</FilterBtn>
            <FilterBtn active={rFilter === 'delayed'} onClick={() => setFilter('delayed')}>متأخر</FilterBtn>
            <FilterBtn active={rFilter === 'critical'} onClick={() => setFilter('critical')}>حرج</FilterBtn>
          </div>
          <div className="rounded-2xl border border-navy-border/30 bg-navy-800/60 p-3">
            {loading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
            ) : repairs.length === 0 ? (
              <EmptyState title="لا توجد صيانة متأخرة" message="كل التذاكر ضمن آجالها — عمل ممتاز" />
            ) : (
              <RepairRows items={repairs} />
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <FilterBtn active={wFilter === 'all'} onClick={() => setFilter('all')}>الكل</FilterBtn>
            <FilterBtn active={wFilter === 'expiring'} onClick={() => setFilter('expiring')}>قريب الانتهاء</FilterBtn>
            <FilterBtn active={wFilter === 'expired'} onClick={() => setFilter('expired')}>منتهي</FilterBtn>
          </div>
          <div className="rounded-2xl border border-navy-border/30 bg-navy-800/60 p-3">
            {loading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
            ) : warranties.length === 0 ? (
              <EmptyState title="لا توجد ضمانات منتهية أو قريبة" message="كل الأجهزة المباعة ضمن فترة الضمان" />
            ) : (
              <WarrantyRows items={warranties} />
            )}
          </div>
        </div>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
