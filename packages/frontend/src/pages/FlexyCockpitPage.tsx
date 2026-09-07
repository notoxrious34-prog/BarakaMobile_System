import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Zap, Printer, RotateCcw, AlertTriangle, Wallet } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useWalletsQuery, useWalletDetailsQuery, useWalletLedgerQuery, useFlexySaleMutation, type LedgerEntry } from '@/features/wallets/hooks/useWallets';
import { WalletTopupModal } from '@/features/wallets/components/WalletTopupModal';
import { FlexyReceipt, type FlexyReceiptData } from '@/features/wallets/components/FlexyReceipt';

const PRESETS = ['100', '200', '300', '500', '1000', '2000'];
const PHONE_RE = /^0[567]\d{8}$/;
const PREFIX_TO_OPERATOR: Array<{ prefix: string; match: string }> = [
  { prefix: '07', match: 'djezzy' },
  { prefix: '06', match: 'mobilis' },
  { prefix: '05', match: 'ooredoo' },
];

function to2dp(raw: string | Decimal): string {
  try {
    const d = raw instanceof Decimal ? raw : new Decimal(raw);
    if (!d.isFinite()) return '0.00';
    return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function ratePct(rate: string): string {
  try {
    return new Decimal(rate).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FlexyCockpitPage() {
  const { data: wallets } = useWalletsQuery(true);
  const saleMut = useFlexySaleMutation();

  const [walletId, setWalletId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const [topupOpen, setTopupOpen] = useState(false);
  const [receipt, setReceipt] = useState<FlexyReceiptData | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeWallets = useMemo(() => (wallets ?? []).filter((w) => w.isActive), [wallets]);
  const { data: details } = useWalletDetailsQuery(walletId || null, true);
  const services = useMemo(() => (details?.services ?? []).filter((s) => s.isActive), [details]);
  const balance = details?.currentBalance ?? '0.00';

  const day = todayISO();
  const { data: ledger } = useWalletLedgerQuery(walletId || null, { startDate: day, limit: 100 }, !!walletId);
  const salesToday = useMemo(() => (ledger?.entries ?? []).filter((e) => e.entryType === 'SALE_DEDUCTION'), [ledger]);

  // Default wallet: first active FLEXY.
  useEffect(() => {
    if (!walletId && activeWallets.length > 0) {
      const def = activeWallets.find((w) => w.type === 'FLEXY') ?? activeWallets[0];
      setWalletId(def.id);
    }
  }, [walletId, activeWallets]);

  // Reset service when wallet changes.
  useEffect(() => {
    setServiceId('');
  }, [walletId]);

  // Auto-select operator from DZ prefix (manual card click overrides afterwards).
  function handlePhone(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
    const rule = PREFIX_TO_OPERATOR.find((r) => digits.startsWith(r.prefix));
    if (rule && digits.length >= 2) {
      const match = services.find((s) => s.name.toLowerCase().includes(rule.match));
      if (match) setServiceId(match.id);
    }
  }

  const selectedService = services.find((s) => s.id === serviceId) ?? null;

  const preview = useMemo(() => {
    try {
      if (!selectedService || amount.trim() === '') return null;
      const nominal = new Decimal(amount.trim());
      if (!nominal.isFinite() || nominal.lte(0)) return null;
      const rate = new Decimal(selectedService.commissionRate);
      const deduction = nominal.times(new Decimal(1).minus(rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const profit = nominal.minus(deduction);
      const bal = new Decimal(balance);
      const shortfall = deduction.minus(bal);
      return {
        nominal: to2dp(nominal),
        deduction: to2dp(deduction),
        profit: to2dp(profit),
        blocked: deduction.gt(bal),
        shortfall: shortfall.gt(0) ? to2dp(shortfall) : '0.00',
      };
    } catch {
      return null;
    }
  }, [selectedService, amount, balance]);

  const stats = useMemo(() => {
    let count = 0;
    let volume = new Decimal(0);
    let profit = new Decimal(0);
    for (const e of salesToday) {
      count += 1;
      try {
        if (e.nominalAmount) volume = volume.plus(new Decimal(e.nominalAmount));
        if (e.commissionProfit) profit = profit.plus(new Decimal(e.commissionProfit));
      } catch {
        /* ignore malformed legacy rows */
      }
    }
    return { count, volume: to2dp(volume), profit: to2dp(profit) };
  }, [salesToday]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const health = useMemo(() => {
    try {
      const b = new Decimal(balance);
      if (b.lte(0)) return { label: 'حرج / نافد', cls: 'border-rose-500/40 bg-rose-500/10 text-rose-300' };
      if (b.lte(2000)) return { label: 'منخفض', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300' };
      return { label: 'آمن', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' };
    } catch {
      return { label: '—', cls: 'border-navy-border/40 bg-navy-950/60 text-slate-400' };
    }
  }, [balance]);

  function validate(): string | null {
    if (!walletId) return 'اختر المحفظة أولاً';
    if (!selectedService) return 'اختر الشبكة (Djezzy / Mobilis / Ooredoo)';
    try {
      const n = new Decimal(amount.trim());
      if (!n.isFinite() || n.lte(0)) return 'مبلغ الشحن يجب أن يكون رقمًا موجبًا';
    } catch {
      return 'مبلغ الشحن غير صالح';
    }
    if (phone.trim() !== '' && !PHONE_RE.test(phone.trim())) return 'رقم الهاتف يجب أن يكون 10 أرقام (05/06/07)';
    if (preview?.blocked) return `الرصيد غير كافٍ لإتمام العملية (العجز: ${preview.shortfall} د.ج)`;
    return null;
  }

  async function handleExecute() {
    const err = validate();
    if (err) {
      setToast({ type: 'error', message: err });
      return;
    }
    try {
      const res = await saleMut.mutateAsync({
        walletId,
        walletServiceId: serviceId,
        nominalAmount: to2dp(amount.trim()),
        beneficiaryPhone: phone.trim() || undefined,
      });
      const data: FlexyReceiptData = {
        entryId: res.entryId,
        operatorName: selectedService?.name ?? '',
        beneficiaryPhone: res.beneficiaryPhone,
        nominalAmount: res.nominalAmount,
        walletDeductionAmount: res.walletDeductionAmount,
        commissionProfit: res.commissionProfit,
        newWalletBalance: res.newWalletBalance,
        createdAt: new Date().toISOString(),
      };
      setReceipt(data);
      setToast({ type: 'success', message: `تم الشحن — الربح ${res.commissionProfit} د.ج` });
      setAmount('');
      setPhone('');
      if (autoPrint) setTimeout(() => window.print(), 350);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'فشلت العملية';
      setToast({ type: 'error', message: msg });
    }
  }

  function reprint(entry: LedgerEntry) {
    setReceipt({
      entryId: entry.id,
      operatorName: entry.walletService?.name ?? 'Flexy',
      beneficiaryPhone: entry.beneficiaryPhone,
      nominalAmount: entry.nominalAmount ?? '0.00',
      walletDeductionAmount: new Decimal(entry.amount).abs().toFixed(2),
      commissionProfit: entry.commissionProfit ?? '0.00',
      newWalletBalance: entry.balanceAfter,
      createdAt: entry.createdAt,
    });
    setTimeout(() => window.print(), 350);
  }

  function resetAll() {
    setServiceId('');
    setPhone('');
    setAmount('');
    setReceipt(null);
  }

  return (
    <div dir="rtl" className="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3 font-sans">
      {/* Pulse bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-navy-border/40 bg-navy-900 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Zap className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-extrabold tracking-tight text-slate-100">فليكسي <span className="font-mono text-[10px] text-slate-500">F3</span></h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span dir="ltr" className="font-mono text-lg font-extrabold text-slate-100">{to2dp(balance)} د.ج</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${health.cls}`}>{health.label}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="المحفظة"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            className="rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-xs font-bold text-slate-200"
          >
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setTopupOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-extrabold text-navy-950 hover:bg-amber-400"
          >
            <Wallet className="h-4 w-4" aria-hidden="true" />
            شحن المحفظة
          </button>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Operations console */}
        <section className="flex flex-col gap-3 rounded-2xl border border-navy-border/40 bg-navy-900 p-4">
          <h2 className="text-sm font-extrabold text-slate-100">وحدة العمليات</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {services.map((s) => {
              const active = s.id === serviceId;
              const color = s.networkBrandColor ?? '#38bdf8';
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setServiceId(s.id)}
                  aria-pressed={active}
                  className={`rounded-2xl border p-3 text-right transition-all ${
                    active
                      ? 'border-transparent bg-white/[0.06] shadow-lg'
                      : 'border-navy-border/30 bg-navy-950/50 hover:bg-white/[0.04]'
                  }`}
                  style={active ? { boxShadow: `0 0 0 2px ${color}, 0 0 24px ${color}55`, borderColor: color } : undefined}
                >
                  <span className="inline-block rounded-lg px-2 py-0.5 text-[11px] font-extrabold text-white" style={{ backgroundColor: color }}>
                    {s.name}
                  </span>
                  <span dir="ltr" className="mt-1.5 block font-mono text-sm font-bold text-emerald-300">{ratePct(s.commissionRate)}%</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">عمولة الشبكة</span>
                </button>
              );
            })}
            {services.length === 0 && (
              <p className="text-xs text-slate-500">لا توجد خدمات مفعّلة — اشحن المحفظة أو فعّل خدمة أولاً.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="flexy-phone" className="mb-1 block text-xs font-bold text-slate-300">رقم المستفيد (اختياري / 05-06-07)</label>
              <input
                id="flexy-phone"
                type="text"
                inputMode="numeric"
                dir="ltr"
                placeholder="06XXXXXXXX"
                value={phone}
                onChange={(e) => handlePhone(e.target.value)}
                className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label htmlFor="flexy-amount" className="mb-1 block text-xs font-bold text-slate-300">المبلغ (د.ج)</label>
              <input
                id="flexy-amount"
                type="text"
                inputMode="decimal"
                dir="ltr"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleExecute(); }}
                className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-300 hover:bg-white/[0.06]"
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 rounded-lg border border-navy-border/40 bg-navy-950/60 px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:bg-white/[0.06]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              مسح
            </button>
          </div>

          {preview && (
            <div className="grid grid-cols-1 gap-2 rounded-2xl border border-navy-border/30 bg-navy-950/50 p-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-500/20 bg-white/[0.03] p-2.5">
                <p className="text-[11px] text-slate-400">المستلم من الزبون</p>
                <p dir="ltr" className="mt-0.5 text-left font-mono text-base font-bold text-slate-100">{preview.nominal} د.ج</p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2.5">
                <p className="text-[11px] text-slate-400">المخصوم من المحفظة</p>
                <p dir="ltr" className="mt-0.5 text-left font-mono text-base font-bold text-cyan-300">{preview.deduction} د.ج</p>
              </div>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2.5">
                <p className="text-[11px] text-slate-400">صافي الربح الفوري</p>
                <p dir="ltr" className="mt-0.5 text-left font-mono text-base font-bold text-emerald-300">{preview.profit} د.ج</p>
              </div>
            </div>
          )}
          {preview?.blocked && (
            <p role="alert" className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              الرصيد غير كافٍ لإتمام العملية (العجز: {preview.shortfall} د.ج)
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-slate-300">
              <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
              طباعة الوصل تلقائياً
            </label>
            <button
              type="button"
              onClick={handleExecute}
              disabled={saleMut.isPending || !preview || preview.blocked}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-extrabold text-navy-950 hover:bg-emerald-400 disabled:opacity-40"
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              {saleMut.isPending ? 'جارٍ التنفيذ…' : 'تأكيد العملية وشحن الرصيد [Enter]'}
            </button>
          </div>
        </section>

        {/* History & pulse */}
        <section className="flex flex-col gap-3 rounded-2xl border border-navy-border/40 bg-navy-900 p-4">
          <h2 className="text-sm font-extrabold text-slate-100">عمليات اليوم</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-navy-border/30 bg-navy-950/50 p-2.5 text-center">
              <p className="text-[11px] text-slate-400">عدد العمليات</p>
              <p className="mt-0.5 font-mono text-base font-bold text-slate-100">{stats.count}</p>
            </div>
            <div className="rounded-xl border border-navy-border/30 bg-navy-950/50 p-2.5 text-center">
              <p className="text-[11px] text-slate-400">إجمالي المبيعات د.ج</p>
              <p dir="ltr" className="mt-0.5 font-mono text-base font-bold text-cyan-300">{stats.volume}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2.5 text-center">
              <p className="text-[11px] text-slate-400">إجمالي الأرباح د.ج</p>
              <p dir="ltr" className="mt-0.5 font-mono text-base font-bold text-emerald-300">{stats.profit}</p>
            </div>
          </div>
          <div className="scrollbar-premium -mx-1 max-h-[420px] overflow-y-auto px-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-navy-900">
                <tr className="text-slate-400">
                  <th className="py-1.5 text-right font-bold">الوقت</th>
                  <th className="py-1.5 text-right font-bold">الشبكة</th>
                  <th className="py-1.5 text-right font-bold">المستفيد</th>
                  <th className="py-1.5 text-left font-bold">المبلغ</th>
                  <th className="py-1.5 text-left font-bold">الربح</th>
                  <th className="py-1.5" aria-label="طباعة" />
                </tr>
              </thead>
              <tbody>
                {salesToday.map((e) => (
                  <tr key={e.id} className="border-t border-navy-border/20 text-slate-200">
                    <td dir="ltr" className="py-1.5 text-right font-mono">{new Date(e.createdAt).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-1.5">
                      <span
                        className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-extrabold text-white"
                        style={{ backgroundColor: e.walletService?.networkBrandColor ?? '#475569' }}
                      >
                        {e.walletService?.name ?? '—'}
                      </span>
                    </td>
                    <td dir="ltr" className="py-1.5 text-right font-mono">{e.beneficiaryPhone ?? '—'}</td>
                    <td dir="ltr" className="py-1.5 text-left font-mono">{e.nominalAmount ?? to2dp(new Decimal(e.amount).abs())}</td>
                    <td dir="ltr" className="py-1.5 text-left font-mono font-bold text-emerald-300">+{e.commissionProfit ?? '0.00'}</td>
                    <td className="py-1.5 text-left">
                      <button type="button" onClick={() => reprint(e)} aria-label="إعادة طباعة الوصل" className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200">
                        <Printer className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {salesToday.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">لا توجد عمليات اليوم بعد.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <WalletTopupModal open={topupOpen} onClose={() => setTopupOpen(false)} />
      {receipt && (
        <div className="hidden print:block">
          <FlexyReceipt data={receipt} />
        </div>
      )}
    </div>
  );
}
