import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  Minus,
  Plus,
  Trash2,
  UserPlus,
  UserSearch,
  Wallet,
  X,
  CheckCircle2,
  Loader2,
  Percent,
  Banknote,
} from 'lucide-react';
import {
  useContactsQuery,
  useCreateContactMutation,
  type Contact,
} from '@/features/contacts/hooks/useContacts';
import { useAccountsByContactQuery } from '@/features/transactions/hooks/useTransactions';
import { to2dp, type PosTicket } from '../hooks/usePosTicket';

export type LastSale = {
  invoiceNumber?: string;
  total: string;
  change: string;
};

type Props = {
  ticket: PosTicket;
  walkinAccountId: string | null;
  walkinError: string | null;
  onCheckout: (accountId: string) => void;
  isSubmitting: boolean;
  apiError: string | null;
  lastSale: LastSale | null;
  onNewSale: () => void;
};

const QUICK_AMOUNTS = ['50', '100', '200', '500', '1000'];

function isNonNegChange(change: string | null): boolean {
  if (change === null) return true;
  try {
    return new Decimal(change).greaterThanOrEqualTo(new Decimal(0));
  } catch {
    return true;
  }
}

export function TicketPanel({
  ticket,
  walkinAccountId,
  walkinError,
  onCheckout,
  isSubmitting,
  apiError,
  lastSale,
  onNewSale,
}: Props) {
  const [useWalkin, setUseWalkin] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);

  const contactsQ = useContactsQuery();
  const createContactMut = useCreateContactMutation();
  const accountsQ = useAccountsByContactQuery(
    !useWalkin && selectedContact ? selectedContact.id : '',
  );

  const customerAccounts = useMemo(
    () => (accountsQ.data ?? []).filter((a) => a.role === 'CUSTOMER'),
    [accountsQ.data],
  );

  // Auto-select the single CUSTOMER account (SaleForm pattern)
  useEffect(() => {
    if (
      !useWalkin &&
      selectedContact &&
      customerAccounts.length === 1 &&
      !selectedAccountId
    ) {
      setSelectedAccountId(customerAccounts[0].id);
    }
  }, [useWalkin, selectedContact, customerAccounts, selectedAccountId]);

  const filteredContacts = useMemo(() => {
    const list = (contactsQ.data ?? []).filter(
      (c) => c.role === 'CUSTOMER' || c.role === 'BOTH',
    );
    const q = contactSearch.trim().toLowerCase();
    if (!q) return list.slice(0, 8);
    return list
      .filter(
        (c) =>
          (c.name ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [contactsQ.data, contactSearch]);

  const activeAccountId = useWalkin ? walkinAccountId : selectedAccountId || null;

  async function handleQuickAdd(): Promise<void> {
    const name = quickName.trim();
    if (name.length < 2) {
      setQuickError('الاسم مطلوب (حرفان على الأقل)');
      return;
    }
    setQuickError(null);
    try {
      const created = await createContactMut.mutateAsync({
        name,
        phone: quickPhone.trim(),
        role: 'CUSTOMER',
      });
      const acc = (created.accounts ?? []).find((a) => a.role === 'CUSTOMER');
      setSelectedContact(created);
      setSelectedAccountId(acc ? acc.id : '');
      setUseWalkin(false);
      setQuickOpen(false);
      setQuickName('');
      setQuickPhone('');
      setContactSearch('');
    } catch (e) {
      setQuickError(e instanceof Error ? e.message : 'فشل إنشاء العميل');
    }
  }

  function handleClear(): void {
    if (ticket.lines.length === 0) return;
    if (window.confirm('إفراغ السلة الحالية؟')) ticket.clear();
  }

  function handleQuickCash(amount: string): void {
    try {
      const cur = ticket.received.trim() === '' ? new Decimal(0) : new Decimal(ticket.received.trim());
      ticket.setReceived(
        cur.plus(new Decimal(amount)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      );
    } catch {
      /* ignore invalid received content */
    }
  }

  const checkoutDisabled =
    !ticket.canCheckout || !activeAccountId || isSubmitting;
  const up = isNonNegChange(ticket.changeDue);
  // Magnitude for the "remaining on customer" case — string op on a 2dp string
  const absChange =
    ticket.changeDue !== null && ticket.changeDue.startsWith('-')
      ? ticket.changeDue.slice(1)
      : (ticket.changeDue ?? '0.00');

  return (
    <section
      aria-label="التذكرة النشطة"
      className="flex h-full min-h-0 flex-col rounded-2xl border border-navy-border/40 bg-navy-900/60 backdrop-blur-md"
    >
      {/* Ticket header — customer */}
      <div className="shrink-0 space-y-2 border-b border-navy-border/30 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">التذكرة النشطة</h2>
          <button
            type="button"
            onClick={handleClear}
            aria-label="إفراغ السلة"
            title="إفراغ السلة"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {useWalkin || !selectedContact ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl border border-cyan-500/25 bg-cyan-500/[0.07] px-3 py-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Wallet className="h-4 w-4 text-cyan-400" aria-hidden="true" />
                عميل نقدي (عام)
              </span>
              {walkinError ? (
                <span className="text-[11px] text-rose-400">{walkinError}</span>
              ) : !walkinAccountId ? (
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> تجهيز…
                </span>
              ) : (
                <span className="text-[11px] text-emerald-400">جاهز</span>
              )}
            </div>
            <div className="relative">
              <UserSearch
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="بحث عن عميل مسجل…"
                aria-label="بحث عن عميل"
                className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-2 pe-9 ps-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors"
              />
              {contactSearch.trim() !== '' && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-navy-border/40 bg-navy-950 shadow-2xl">
                  {filteredContacts.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-500">لا نتائج</p>
                  ) : (
                    filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedContact(c);
                          setSelectedAccountId('');
                          setUseWalkin(false);
                          setContactSearch('');
                        }}
                        className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-right hover:bg-white/[0.05]"
                      >
                        <span className="text-sm text-slate-100">{c.name}</span>
                        <span className="font-mono text-[11px] text-slate-500" dir="ltr">
                          {c.phone ?? '—'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setQuickOpen(true);
                setQuickError(null);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> عميل جديد سريع (اسم + هاتف)
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{selectedContact.name}</p>
              <p className="font-mono text-[11px] text-slate-500" dir="ltr">
                {selectedContact.phone ?? '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedContact(null);
                setSelectedAccountId('');
                setUseWalkin(true);
              }}
              aria-label="العودة للعميل النقدي"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {!useWalkin && selectedContact && (
          <div>
            {accountsQ.isLoading ? (
              <p className="text-[11px] text-slate-500">جاري تحميل الحسابات…</p>
            ) : customerAccounts.length === 0 ? (
              <p className="text-[11px] text-rose-400">لا يوجد حساب عميل لهذا العميل</p>
            ) : customerAccounts.length > 1 ? (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                aria-label="حساب العميل"
                className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-2 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50"
              >
                <option value="">اختر الحساب</option>
                {customerAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id.slice(0, 8)} — {to2dp(a.currentBalance)} د.ج
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        )}
      </div>

      {/* Cart lines */}
      <div className="scrollbar-premium min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {ticket.lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <Banknote className="h-8 w-8 text-slate-700" aria-hidden="true" />
            <p className="text-sm text-slate-400">السلة فارغة — امسح صنفاً أو اضغط عليه</p>
          </div>
        ) : (
          ticket.lines.map((l, i) => (
            <div
              key={l.itemId}
              className="rounded-xl border border-navy-border/30 bg-navy-950/60 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-100">
                  {l.name}
                </p>
                <button
                  type="button"
                  onClick={() => ticket.removeLine(l.itemId)}
                  aria-label={`حذف ${l.name}`}
                  className="rounded-md p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1" dir="ltr">
                  <button
                    type="button"
                    onClick={() => ticket.increment(l.itemId)}
                    aria-label="زيادة الكمية"
                    className="rounded-md border border-navy-border/40 p-1 text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={String(l.quantity)}
                    onChange={(e) => ticket.setQuantity(l.itemId, e.target.value)}
                    aria-label={`كمية ${l.name}`}
                    className="w-11 rounded-md border border-navy-border/40 bg-navy-900 px-1 py-1 text-center font-mono text-sm text-slate-100 outline-none focus:border-cyan-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => ticket.decrement(l.itemId)}
                    aria-label="إنقاص الكمية"
                    className="rounded-md border border-navy-border/40 p-1 text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <div className="text-left">
                  <span dir="ltr" className="font-mono text-sm font-bold text-slate-100">
                    {ticket.lineTotals[i] ?? '0.00'}
                  </span>
                  <span className="block font-mono text-[11px] text-slate-500" dir="ltr">
                    {l.unitPrice} × {l.quantity}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Financial summary */}
      <div className="shrink-0 space-y-2 border-t border-navy-border/30 p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">المجموع الفرعي</span>
          <span dir="ltr" className="font-mono font-bold text-slate-100">
            {ticket.subtotal} د.ج
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-navy-border/40 text-xs font-bold">
            <button
              type="button"
              onClick={() => ticket.setDiscountType('FIXED')}
              className={`px-2.5 py-1.5 ${ticket.discountType === 'FIXED' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              مبلغ
            </button>
            <button
              type="button"
              onClick={() => ticket.setDiscountType('PERCENT')}
              className={`px-2.5 py-1.5 ${ticket.discountType === 'PERCENT' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              %
            </button>
          </div>
          <div className="relative flex-1">
            <Percent
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600"
              aria-hidden="true"
            />
            <input
              type="text"
              inputMode="decimal"
              value={ticket.discountValue}
              onChange={(e) => ticket.setDiscountValue(e.target.value)}
              placeholder={ticket.discountType === 'FIXED' ? 'خصم (د.ج)' : 'خصم (%)'}
              aria-label="الخصم"
              className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 py-1.5 pe-2 ps-7 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-xs placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
              dir="ltr"
            />
          </div>
          <span dir="ltr" className="shrink-0 font-mono text-sm font-bold text-amber-400">
            {ticket.discountAmount !== '0.00' ? `−${ticket.discountAmount}` : ''}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2">
          <span className="text-sm font-bold text-slate-100">المجموع الكلي</span>
          <span dir="ltr" className="font-mono text-2xl font-bold text-amber-400">
            {ticket.grandTotal} <span className="font-sans text-xs font-medium">د.ج</span>
          </span>
        </div>

        {/* Quick cash */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => ticket.setReceived(ticket.grandTotal)}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-xs font-bold text-emerald-400 hover:bg-emerald-500/20"
          >
            Exact
          </button>
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => handleQuickCash(a)}
              className="rounded-lg border border-navy-border/40 bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
            >
              +{a}
            </button>
          ))}
          <button
            type="button"
            onClick={() => ticket.setReceived('')}
            className="rounded-lg border border-navy-border/40 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-300"
          >
            مسح
          </button>
        </div>
        <input
          type="text"
          inputMode="decimal"
          value={ticket.received}
          onChange={(e) => ticket.setReceived(e.target.value)}
          placeholder="المبلغ المستلم (د.ج)"
          aria-label="المبلغ المستلم"
          className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-xs placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
          dir="ltr"
        />

        {ticket.changeDue === null ? (
          <p className="rounded-xl border border-dashed border-navy-border/40 px-3 py-2 text-center text-xs text-slate-500">
            أدخل المبلغ المستلم لحساب الباقي
          </p>
        ) : (
          <div
            className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
              up
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : 'border-amber-500/30 bg-amber-500/10'
            }`}
            role="status"
          >
            <span className={`text-sm font-bold ${up ? 'text-emerald-300' : 'text-amber-300'}`}>
              {up ? 'المتبقي للعميل' : 'الباقي على العميل'}
            </span>
            <span
              dir="ltr"
              className={`font-mono text-xl font-bold ${up ? 'text-emerald-400' : 'text-amber-400'}`}
            >
              {up ? ticket.changeDue : absChange} د.ج
            </span>
          </div>
        )}

        {apiError && (
          <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300" role="alert">
            {apiError}
          </p>
        )}

        {lastSale ? (
          <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> تم تسجيل البيع
            </p>
            {lastSale.invoiceNumber && (
              <p className="font-mono text-xs text-slate-400" dir="ltr">{lastSale.invoiceNumber}</p>
            )}
            <p dir="ltr" className="font-mono text-lg font-bold text-emerald-400">
              {lastSale.total} د.ج
            </p>
            <button
              type="button"
              onClick={onNewSale}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-emerald-500"
            >
              بيع جديد (F1)
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => activeAccountId && onCheckout(activeAccountId)}
            disabled={checkoutDisabled}
            className="w-full rounded-xl bg-gradient-to-l from-emerald-600 to-emerald-500 px-4 py-3 text-base font-extrabold text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-500 hover:to-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {isSubmitting ? 'جاري التسجيل…' : `إتمام البيع · ${ticket.grandTotal} د.ج`}
          </button>
        )}
      </div>

      {/* Quick-add customer modal */}
      {quickOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setQuickOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="عميل جديد سريع"
        >
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-navy-border/40 bg-navy-900 p-4">
            <h3 className="text-sm font-bold text-slate-100">عميل جديد سريع</h3>
            <input
              type="text"
              autoFocus
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuickOpen(false);
                if (e.key === 'Enter') void handleQuickAdd();
              }}
              placeholder="الاسم *"
              aria-label="اسم العميل"
              className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
            />
            <input
              type="text"
              value={quickPhone}
              onChange={(e) => setQuickPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuickOpen(false);
                if (e.key === 'Enter') void handleQuickAdd();
              }}
              placeholder="الهاتف (اختياري)"
              aria-label="هاتف العميل"
              className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
              dir="ltr"
            />
            {quickError && <p className="text-xs text-rose-400" role="alert">{quickError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleQuickAdd()}
                disabled={createContactMut.isPending}
                className="flex-1 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50"
              >
                {createContactMut.isPending ? 'جاري الإنشاء…' : 'إنشاء واختيار'}
              </button>
              <button
                type="button"
                onClick={() => setQuickOpen(false)}
                className="rounded-xl border border-navy-border/40 px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.05]"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
