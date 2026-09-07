import { useState } from 'react';
import Decimal from 'decimal.js';
import { Plus, Check, X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  useWalletDetailsQuery,
  usePatchServiceMutation,
  useAddServiceMutation,
  usePatchWalletMutation,
} from '../hooks/useWallets';

const COLOR_PRESETS = ['#E30613', '#00A651', '#ED1C24', '#0055A5', '#7C3AED', '#F59E0B', '#0EA5E9'];

function to2dp(raw: string): string {
  try {
    const d = new Decimal(raw);
    if (!d.isFinite()) return '0.00';
    return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function rateToPct(rate: string): string {
  try {
    return new Decimal(rate).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

function pctToRate(pct: string): string | null {
  try {
    const p = new Decimal(pct);
    if (!p.isFinite() || p.lt(0) || p.gt(100)) return null;
    return p.div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
  } catch {
    return null;
  }
}

/**
 * Shared wallet services manager: commission edits, active toggles,
 * add-service form, low-balance threshold. Embedded in SettingsPage and
 * wrapped by WalletServicesModal in the Flexy cockpit.
 */
export function WalletServicesPanel({ walletId }: { walletId: string | null }) {
  const { data: details } = useWalletDetailsQuery(walletId, !!walletId);
  const patchMut = usePatchServiceMutation();
  const addMut = useAddServiceMutation();
  const walletMut = usePatchWalletMutation();

  const [editingRate, setEditingRate] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRatePct, setNewRatePct] = useState('');
  const [newColor, setNewColor] = useState(COLOR_PRESETS[3]);
  const [threshold, setThreshold] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!walletId) {
    return <p className="text-xs text-slate-500">اختر محفظة لعرض خدماتها.</p>;
  }
  const services = (details?.services ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const busy = patchMut.isPending || addMut.isPending || walletMut.isPending;

  function flash(type: 'success' | 'error', text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  }

  async function saveRate(serviceId: string) {
    if (!walletId) return;
    const raw = (editingRate[serviceId] ?? '').trim();
    const rate = pctToRate(raw);
    if (rate === null) {
      flash('error', 'النسبة يجب أن تكون بين 0 و 100');
      return;
    }
    try {
      await patchMut.mutateAsync({ walletId, serviceId, commissionRate: rate });
      setEditingRate((m) => {
        const next = { ...m };
        delete next[serviceId];
        return next;
      });
      flash('success', 'تم تحديث العمولة');
    } catch (e) {
      flash('error', e instanceof ApiError ? e.message : 'فشل التحديث');
    }
  }

  async function toggleActive(serviceId: string, current: boolean) {
    if (!walletId) return;
    try {
      await patchMut.mutateAsync({ walletId, serviceId, isActive: !current });
    } catch (e) {
      flash('error', e instanceof ApiError ? e.message : 'فشل التحديث');
    }
  }

  async function handleAdd() {
    if (!walletId) return;
    if (!newName.trim()) {
      flash('error', 'أدخل اسم الخدمة');
      return;
    }
    const rate = pctToRate(newRatePct.trim());
    if (rate === null) {
      flash('error', 'النسبة يجب أن تكون بين 0 و 100');
      return;
    }
    try {
      await addMut.mutateAsync({ walletId, name: newName.trim(), commissionRate: rate, networkBrandColor: newColor });
      setNewName('');
      setNewRatePct('');
      setShowAdd(false);
      flash('success', 'تمت إضافة الخدمة');
    } catch (e) {
      flash('error', e instanceof ApiError ? e.message : 'فشلت الإضافة');
    }
  }

  async function saveThreshold() {
    if (!walletId || threshold === null) return;
    try {
      const v = new Decimal(threshold);
      if (!v.isFinite() || v.lt(0)) {
        flash('error', 'الحد يجب أن يكون رقمًا موجبًا');
        return;
      }
      await walletMut.mutateAsync({ walletId, lowBalanceThreshold: to2dp(threshold) });
      setThreshold(null);
      flash('success', 'تم تحديث حد التنبيه');
    } catch (e) {
      flash('error', e instanceof ApiError ? e.message : 'فشل التحديث');
    }
  }

  const inputCls =
    'rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600';

  return (
    <div className="flex flex-col gap-3">
      {msg && (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-xs font-bold ${
            msg.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {services.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-navy-border/30 bg-navy-950/50 p-2.5"
          >
            <span
              className="inline-block h-6 w-6 shrink-0 rounded-lg border border-white/10"
              style={{ backgroundColor: s.networkBrandColor ?? '#475569' }}
              aria-hidden="true"
            />
            <span className="min-w-24 flex-1 text-sm font-bold text-slate-100">{s.name}</span>
            {editingRate[s.id] !== undefined ? (
              <span className="flex items-center gap-1" dir="ltr">
                <input
                  aria-label={`عمولة ${s.name} بالنسبة`}
                  type="text"
                  inputMode="decimal"
                  value={editingRate[s.id]}
                  onChange={(e) => setEditingRate((m) => ({ ...m, [s.id]: e.target.value }))}
                  className={`w-20 rounded-lg border border-amber-500/40 bg-navy-950 px-2 py-1 font-mono text-xs text-slate-100`}
                />
                <span className="text-xs text-slate-400">%</span>
                <button
                  type="button"
                  onClick={() => saveRate(s.id)}
                  disabled={busy}
                  aria-label="حفظ العمولة"
                  className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRate((m) => {
                    const next = { ...m };
                    delete next[s.id];
                    return next;
                  })}
                  aria-label="إلغاء"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setEditingRate((m) => ({ ...m, [s.id]: rateToPct(s.commissionRate) }))}
                title="تعديل العمولة"
                dir="ltr"
                className="rounded-lg border border-navy-border/40 bg-navy-950/60 px-2.5 py-1 font-mono text-xs font-bold text-emerald-300 hover:bg-white/[0.06]"
              >
                {rateToPct(s.commissionRate)}%
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={s.isActive}
              aria-label={`تفعيل ${s.name}`}
              onClick={() => toggleActive(s.id, s.isActive)}
              disabled={busy}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                s.isActive ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${s.isActive ? 'right-0.5' : 'left-0.5'}`}
              />
            </button>
          </div>
        ))}
      </div>

      {!showAdd ? (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-navy-border/50 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/[0.04]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          إضافة خدمة جديدة
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-navy-border/30 bg-navy-950/50 p-3">
          <input
            aria-label="اسم الخدمة"
            type="text"
            placeholder="مثال: Idoom 4G"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={inputCls}
          />
          <div className="flex gap-2">
            <input
              aria-label="العمولة بالنسبة المئوية"
              type="text"
              inputMode="decimal"
              dir="ltr"
              placeholder="2.0 %"
              value={newRatePct}
              onChange={(e) => setNewRatePct(e.target.value)}
              className={`${inputCls} flex-1 font-mono`}
            />
            <input
              aria-label="لون الشبكة"
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-navy-border/40 bg-navy-950/60 p-1"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                aria-label={`اللون ${c}`}
                className={`h-6 w-6 rounded-lg border ${newColor === c ? 'border-white' : 'border-white/10'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-xl border border-navy-border/40 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/[0.06]"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={busy}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              إضافة الخدمة
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="flex-1 min-w-40">
          <label htmlFor="wallet-threshold" className="mb-1 block text-xs font-bold text-slate-300">
            حد التنبيه للرصيد المنخفض (د.ج)
          </label>
          <input
            id="wallet-threshold"
            type="text"
            inputMode="decimal"
            dir="ltr"
            placeholder={details ? to2dp(details.lowBalanceThreshold) : '2000.00'}
            value={threshold ?? ''}
            onChange={(e) => setThreshold(e.target.value)}
            className={`${inputCls} w-full font-mono`}
          />
        </div>
        <button
          type="button"
          onClick={saveThreshold}
          disabled={busy || threshold === null}
          className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-extrabold text-navy-950 hover:bg-amber-400 disabled:opacity-50"
        >
          حفظ الحد
        </button>
      </div>
    </div>
  );
}
