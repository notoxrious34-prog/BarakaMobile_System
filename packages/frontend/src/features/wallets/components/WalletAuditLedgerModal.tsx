import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { X, Printer, Search } from 'lucide-react';
import { useWalletLedgerQuery, type LedgerEntry } from '../hooks/useWallets';
import { FlexyReceipt, type FlexyReceiptData } from './FlexyReceipt';

type Props = {
  open: boolean;
  walletId: string | null;
  onClose: () => void;
};

type Preset = 'today' | 'week' | 'month' | 'all';
type TypeFilter = 'ALL' | 'SALE_DEDUCTION' | 'TOPUP' | 'ADJUSTMENT';

const TYPE_LABEL: Record<string, string> = {
  SALE_DEDUCTION: 'بيع',
  TOPUP: 'شحن',
  ADJUSTMENT: 'تسوية',
  REVERSAL: 'عكس',
};

const TYPE_CLS: Record<string, string> = {
  SALE_DEDUCTION: 'bg-cyan-500/15 text-cyan-300',
  TOPUP: 'bg-emerald-500/15 text-emerald-300',
  ADJUSTMENT: 'bg-violet-500/15 text-violet-300',
  REVERSAL: 'bg-rose-500/15 text-rose-300',
};

function to2dp(raw: string | Decimal): string {
  try {
    const d = raw instanceof Decimal ? raw : new Decimal(raw);
    if (!d.isFinite()) return '0.00';
    return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function presetRange(p: Preset): { startDate?: string; endDate?: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === 'today') return { startDate: iso(now) };
  if (p === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { startDate: iso(from) };
  }
  if (p === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: iso(from) };
  }
  return {};
}

/** Full audit ledger: filters, aggregates ribbon, table, receipt reprint. */
export function WalletAuditLedgerModal({ open, walletId, onClose }: Props) {
  const [preset, setPreset] = useState<Preset>('week');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [serviceId, setServiceId] = useState('');
  const [search, setSearch] = useState('');
  const [receipt, setReceipt] = useState<FlexyReceiptData | null>(null);

  const range = useMemo(() => presetRange(preset), [preset]);
  const { data, isLoading } = useWalletLedgerQuery(
    walletId,
    {
      entryType: typeFilter === 'ALL' ? undefined : typeFilter,
      startDate: range.startDate,
      endDate: range.endDate,
      serviceId: serviceId || undefined,
      search: search.trim() || undefined,
      limit: 200,
    },
    open && !!walletId,
  );
  const entries = data?.entries ?? [];

  const stats = useMemo(() => {
    let count = 0;
    let nominal = new Decimal(0);
    let profit = new Decimal(0);
    let topups = new Decimal(0);
    for (const e of entries) {
      count += 1;
      try {
        if (e.entryType === 'SALE_DEDUCTION') {
          if (e.nominalAmount) nominal = nominal.plus(new Decimal(e.nominalAmount));
          if (e.commissionProfit) profit = profit.plus(new Decimal(e.commissionProfit));
        } else if (e.entryType === 'TOPUP') {
          topups = topups.plus(new Decimal(e.amount));
        }
      } catch {
        /* ignore malformed rows */
      }
    }
    return { count, nominal: to2dp(nominal), profit: to2dp(profit), topups: to2dp(topups) };
  }, [entries]);

  const services = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      if (e.walletService) map.set(e.walletService.id, e.walletService.name);
    }
    return [...map.entries()];
  }, [entries]);

  function reprint(entry: LedgerEntry) {
    setReceipt({
      entryId: entry.id,
      operatorName: entry.walletService?.name ?? 'Flexy',
      beneficiaryPhone: entry.beneficiaryPhone,
      nominalAmount: entry.nominalAmount ?? new Decimal(entry.amount).abs().toFixed(2),
      walletDeductionAmount: new Decimal(entry.amount).abs().toFixed(2),
      commissionProfit: entry.commissionProfit ?? '0.00',
      newWalletBalance: entry.balanceAfter,
      createdAt: entry.createdAt,
    });
    setTimeout(() => window.print(), 350);
  }

  if (!open) return null;

  const presets: Array<{ id: Preset; label: string }> = [
    { id: 'today', label: 'اليوم' },
    { id: 'week', label: 'آخر 7 أيام' },
    { id: 'month', label: 'هذا الشهر' },
    { id: 'all', label: 'الكل' },
  ];
  const types: Array<{ id: TypeFilter; label: string }> = [
    { id: 'ALL', label: 'الكل' },
    { id: 'SALE_DEDUCTION', label: 'مبيعات' },
    { id: 'TOPUP', label: 'شحن' },
    { id: 'ADJUSTMENT', label: 'تسويات' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="السجل الشامل للمحفظة"
        className="scrollbar-premium relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900 text-slate-100 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-navy-border/30 p-4">
          <h2 className="text-base font-extrabold tracking-tight">السجل الشامل للمحفظة</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-navy-border/30 p-3">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              aria-pressed={preset === p.id}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                preset === p.id ? 'bg-amber-500 text-navy-950' : 'border border-navy-border/40 text-slate-400 hover:bg-white/[0.04]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-navy-border/40" aria-hidden="true" />
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(t.id)}
              aria-pressed={typeFilter === t.id}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                typeFilter === t.id ? 'bg-cyan-600 text-white' : 'border border-navy-border/40 text-slate-400 hover:bg-white/[0.04]'
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-navy-border/40" aria-hidden="true" />
          <select
            aria-label="الشبكة"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2 py-1 text-[11px] font-bold text-slate-300"
          >
            <option value="">كل الشبكات</option>
            {services.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <span className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              aria-label="بحث في الملاحظات والهواتف"
              type="text"
              placeholder="بحث: ملاحظة / هاتف…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 py-1 pl-2 pr-7 text-[11px] text-slate-200 placeholder:text-slate-600"
            />
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          {[
            { label: 'عدد العمليات', value: String(stats.count), tone: 'text-slate-100' },
            { label: 'إجمالي المبيعات الإسمية', value: stats.nominal, tone: 'text-cyan-300' },
            { label: 'صافي الأرباح', value: stats.profit, tone: 'text-emerald-300' },
            { label: 'إجمالي الشحن', value: stats.topups, tone: 'text-amber-300' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-navy-border/30 bg-navy-950/50 p-2 text-center">
              <p className="text-[10px] text-slate-400">{s.label}</p>
              <p dir="ltr" className={`mt-0.5 font-mono text-sm font-bold ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="scrollbar-premium mx-3 mb-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-navy-border/20">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-navy-900">
              <tr className="text-slate-400">
                <th className="py-1.5 pr-2 text-right font-bold">التاريخ</th>
                <th className="py-1.5 text-right font-bold">النوع</th>
                <th className="py-1.5 text-right font-bold">الشبكة</th>
                <th className="py-1.5 text-right font-bold">المستفيد</th>
                <th className="py-1.5 text-left font-bold">المبلغ</th>
                <th className="py-1.5 text-left font-bold">الربح</th>
                <th className="py-1.5 text-left font-bold">الرصيد بعد</th>
                <th className="py-1.5" aria-label="طباعة" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-navy-border/20 text-slate-200">
                  <td dir="ltr" className="py-1.5 pr-2 text-right font-mono text-[11px]">
                    {new Date(e.createdAt).toLocaleString('fr-DZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-1.5">
                    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${TYPE_CLS[e.entryType] ?? 'bg-white/10 text-slate-300'}`}>
                      {TYPE_LABEL[e.entryType] ?? e.entryType}
                    </span>
                  </td>
                  <td className="py-1.5">{e.walletService?.name ?? '—'}</td>
                  <td dir="ltr" className="py-1.5 text-right font-mono">{e.beneficiaryPhone ?? '—'}</td>
                  <td dir="ltr" className="py-1.5 text-left font-mono">{e.nominalAmount ?? e.amount}</td>
                  <td dir="ltr" className="py-1.5 text-left font-mono font-bold text-emerald-300">
                    {e.entryType === 'SALE_DEDUCTION' ? `+${e.commissionProfit ?? '0.00'}` : '—'}
                  </td>
                  <td dir="ltr" className="py-1.5 text-left font-mono">{e.balanceAfter}</td>
                  <td className="py-1.5 text-left">
                    {e.entryType === 'SALE_DEDUCTION' && (
                      <button type="button" onClick={() => reprint(e)} aria-label="إعادة طباعة الوصل" className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200">
                        <Printer className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">لا توجد حركات مطابقة.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {receipt && (
        <div className="hidden print:block">
          <FlexyReceipt data={receipt} />
        </div>
      )}
    </div>
  );
}
