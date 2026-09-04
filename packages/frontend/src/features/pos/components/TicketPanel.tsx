import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import {
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  User,
  UserPlus,
  UserSearch,
  X,
  CheckCircle2,
  Percent,
} from 'lucide-react';
import { arPlural } from '@/lib/arPlural';
import {
  useContactsQuery,
  useCreateContactMutation,
  type Contact,
} from '@/features/contacts/hooks/useContacts';
import { useAccountsByContactQuery } from '@/features/transactions/hooks/useTransactions';
import { to2dp, type PosTicket } from '../hooks/usePosTicket';
import type { ParkedCustomer } from '../hooks/useParkedTickets';
import { PosReceiptModal, type ReceiptData } from './PosReceiptModal';
import { playCheckoutSuccess } from '../utils/posAudio';

export type LastSale = {
  invoiceNumber?: string;
  total: string;
  change: string;
};

type Props = {
  ticket: PosTicket;
  walkinAccountId: string | null;
  /** Resolves to the invoice number on success, null on failure */
  onCheckout: (accountId: string) => Promise<{ invoiceNumber?: string } | null>;
  isSubmitting: boolean;
  apiError: string | null;
  lastSale: LastSale | null;
  onNewSale: () => void;
  /** Parked-ticket restore signal from the cockpit header */
  restoreSignal: { nonce: number; customer: ParkedCustomer } | null;
  /** Reports current customer snapshot up (for parking + receipts) */
  onCustomerSnapshot?: (s: {
    label: string;
    customer: ParkedCustomer;
    accountId: string | null;
  }) => void;
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
  onCheckout,
  isSubmitting,
  apiError,
  lastSale,
  onNewSale,
  restoreSignal,
  onCustomerSnapshot,
}: Props) {
  const [useWalkin, setUseWalkin] = useState(true);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);

  const contactsQ = useContactsQuery();
  const createContactMut = useCreateContactMutation();
  const accountsQ = useAccountsByContactQuery(
    !useWalkin && selectedContact ? selectedContact.id : '',
  );

  // Parked-ticket restore: apply the stored customer alongside cart lines
  useEffect(() => {
    if (!restoreSignal) return;
    const c = restoreSignal.customer;
    if (c.kind === 'walkin') {
      setSelectedContact(null);
      setSelectedAccountId('');
      setUseWalkin(true);
    } else {
      setSelectedContact({
        id: c.contactId,
        name: c.name,
        phone: c.phone,
        role: 'CUSTOMER',
        isActive: true,
        createdAt: '',
        accounts: [],
      });
      setSelectedAccountId(c.accountId);
      setUseWalkin(false);
    }
  }, [restoreSignal]);

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

  // Report customer snapshot up so the cockpit can park/restore accurately
  useEffect(() => {
    onCustomerSnapshot?.({
      label: useWalkin || !selectedContact ? 'عميل نقدي (عام)' : selectedContact.name,
      customer:
        useWalkin || !selectedContact
          ? { kind: 'walkin' }
          : {
              kind: 'contact',
              contactId: selectedContact.id,
              name: selectedContact.name,
              phone: selectedContact.phone,
              accountId: selectedAccountId,
            },
      accountId: activeAccountId,
    });
  }, [
    useWalkin,
    selectedContact,
    selectedAccountId,
    activeAccountId,
    onCustomerSnapshot,
  ]);

  function selectWalkin(): void {
    setSelectedContact(null);
    setSelectedAccountId('');
    setUseWalkin(true);
    setContactSearch('');
    setCustomerOpen(false);
  }

  function selectContact(c: Contact): void {
    setSelectedContact(c);
    setSelectedAccountId('');
    setUseWalkin(false);
    setContactSearch('');
    setCustomerOpen(false);
  }

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
      setCustomerOpen(false);
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

  /** Selected registered-customer account balance (Decimal-compared) */
  const balanceInfo: { tone: 'debt' | 'clear' | 'credit'; text: string; short: string } | null =
    (() => {
      if (useWalkin || !selectedContact || !selectedAccountId) return null;
      const acc = customerAccounts.find((a) => a.id === selectedAccountId);
      if (!acc) return null;
      try {
        const bal = new Decimal(acc.currentBalance);
        if (bal.greaterThan(new Decimal(0))) {
          const amt = to2dp(bal.toString());
          return {
            tone: 'debt' as const,
            text: `مديونية سابقة: ${amt} د.ج`,
            short: `${amt} د.ج`,
          };
        }
        if (bal.lessThan(new Decimal(0))) {
          const amt = to2dp(bal.abs().toString());
          return {
            tone: 'credit' as const,
            text: `رصيد دائن: ${amt} د.ج`,
            short: `${amt} د.ج`,
          };
        }
        return { tone: 'clear' as const, text: 'الحساب سليم', short: '' };
      } catch {
        return null;
      }
    })();

  /** Snapshot the ticket, submit, and open the thermal receipt on success */
  async function handleCheckoutClick(): Promise<void> {
    if (!activeAccountId || checkoutDisabled) return;
    const snapshot: Omit<ReceiptData, 'invoiceNumber'> = {
      lines: ticket.lines.map((l, i) => ({
        name: l.name,
        sku: l.sku ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: ticket.lineTotals[i] ?? '0.00',
      })),
      subtotal: ticket.subtotal,
      discountAmount: ticket.discountAmount,
      discountLabel:
        ticket.discountAmount !== '0.00'
          ? `${ticket.discountValue.trim()}${ticket.discountType === 'PERCENT' ? '%' : ''}`
          : null,
      grandTotal: ticket.grandTotal,
      paid: ticket.paidNow ?? '0.00',
      change: ticket.changeDue ?? '0.00',
      createdAt: new Date().toISOString(),
      customerLabel:
        useWalkin || !selectedContact ? 'عميل نقدي (افتراضي)' : selectedContact.name,
      customerPhone: !useWalkin && selectedContact ? (selectedContact.phone ?? null) : null,
    };
    const res = await onCheckout(activeAccountId);
    if (res) {
      playCheckoutSuccess();
      setReceipt({ ...snapshot, invoiceNumber: res.invoiceNumber });
      setReceiptOpen(true);
    }
  }

  return (
    <section
      aria-label="التذكرة النشطة"
      className="flex flex-col rounded-2xl border border-navy-border/40 bg-navy-900/60 backdrop-blur-md"
    >
      {/* Ticket header — customer */}
      <div className="shrink-0 space-y-1.5 border-b border-navy-border/30 p-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            التذكرة النشطة{' '}
            <span className="text-xs font-normal text-slate-400">
              (
              {arPlural(ticket.itemsCount, {
                one: 'صنف واحد',
                two: 'صنفان',
                few: 'أصناف',
                many: 'صنفاً',
              })}
              )
            </span>
          </h2>
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

        {/* Customer — single compact row; full picker lives in a modal */}
        <button
          type="button"
          onClick={() => setCustomerOpen(true)}
          aria-label="تغيير العميل"
          className="flex h-9 w-full items-center justify-between rounded-xl border border-navy-border/60 bg-navy-950/60 px-3"
        >
          <span className="flex min-w-0 items-center gap-2">
            <User className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
            <span className="truncate text-sm font-semibold text-slate-100">
              {useWalkin || !selectedContact ? 'عميل نقدي (افتراضي)' : selectedContact.name}
            </span>
            {balanceInfo?.tone === 'debt' && (
              <span className="shrink-0 text-[11px] font-bold text-amber-300">
                مديونية {balanceInfo.short}
              </span>
            )}
          </span>
          <span className="shrink-0 text-[11px] font-bold text-cyan-400">تغيير</span>
        </button>
      </div>

      {/* Cart lines — generous dedicated real estate, grows with content */}
      <div className="min-h-[240px] space-y-2 p-2">
        {ticket.lines.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-3 text-center text-xs text-slate-500">
            <ShoppingBag className="h-4 w-4 shrink-0" aria-hidden="true" />
            السلة فارغة — امسح باركود أو انقر على صنف
          </p>
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

      {/* Financial summary — docked sticky footer */}
      <div className="sticky bottom-0 z-10 shrink-0 space-y-1.5 border-t border-navy-border bg-navy-900/95 p-3 backdrop-blur-md">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">المجموع الفرعي</span>
          <span dir="ltr" className="font-mono font-bold text-slate-100">
            {ticket.subtotal} د.ج
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-navy-border/40 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => ticket.setDiscountType('FIXED')}
              className={`px-2 py-1 ${ticket.discountType === 'FIXED' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
            >
              مبلغ
            </button>
            <button
              type="button"
              onClick={() => ticket.setDiscountType('PERCENT')}
              className={`px-2 py-1 ${ticket.discountType === 'PERCENT' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
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
              className="w-full rounded-lg border border-navy-border/40 bg-navy-950/60 py-1 pe-2 ps-7 font-mono text-xs text-slate-100 placeholder:font-sans placeholder:text-[11px] placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
              dir="ltr"
            />
          </div>
          <span dir="ltr" className="shrink-0 font-mono text-xs font-bold text-amber-400">
            {ticket.discountAmount !== '0.00' ? `−${ticket.discountAmount}` : ''}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-1">
          <span className="text-sm font-bold text-slate-100">المجموع الكلي</span>
          <span dir="ltr" className="font-mono text-lg font-bold text-amber-400">
            {ticket.grandTotal} <span className="font-sans text-xs font-medium">د.ج</span>
          </span>
        </div>

        {/* Quick cash */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => ticket.setReceived(ticket.grandTotal)}
            className="h-7 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20"
          >
            المبلغ بالضبط
          </button>
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => handleQuickCash(a)}
              className="h-7 rounded-lg border border-navy-border/40 bg-white/[0.03] px-2 py-0.5 font-mono text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
            >
              <span dir="ltr">+{a}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => ticket.setReceived('')}
            className="h-7 rounded-lg border border-navy-border/40 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-300"
          >
            مسح
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={ticket.received}
            onChange={(e) => ticket.setReceived(e.target.value)}
            placeholder="المستلم (د.ج)"
            aria-label="المبلغ المستلم"
            className="h-8 w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-2 font-mono text-xs text-slate-100 placeholder:font-sans placeholder:text-[11px] placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
            dir="ltr"
          />
          {ticket.changeDue === null ? (
            <p className="flex h-8 items-center justify-center rounded-xl border border-dashed border-navy-border/40 px-2 text-center text-[11px] text-slate-500">
              أدخل المستلم للباقي
            </p>
          ) : (
            <div
              className={`flex h-8 items-center justify-between gap-1 rounded-xl border px-2 ${
                up
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-amber-500/30 bg-amber-500/10'
              }`}
              role="status"
            >
              <span className={`text-[11px] font-bold ${up ? 'text-emerald-300' : 'text-amber-300'}`}>
                {up ? 'الباقي' : 'الباقي عليه'}
              </span>
              <span
                dir="ltr"
                className={`font-mono text-sm font-bold ${up ? 'text-emerald-400' : 'text-amber-400'}`}
              >
                {up ? ticket.changeDue : absChange} د.ج
              </span>
            </div>
          )}
        </div>

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
            {receipt && (
              <button
                type="button"
                onClick={() => setReceiptOpen(true)}
                className="w-full rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/20"
              >
                طباعة الإيصال (حراري / A4)
              </button>
            )}
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
            onClick={() => void handleCheckoutClick()}
            disabled={checkoutDisabled}
            className="flex h-11 w-full shrink-0 items-center justify-between rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition-all hover:bg-emerald-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {isSubmitting ? (
              <span className="w-full text-center">جاري التسجيل…</span>
            ) : ticket.lines.length === 0 ? (
              <>
                <span>السلة فارغة</span>
                <kbd dir="ltr" className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                  F2
                </kbd>
              </>
            ) : (
              <>
                <span>إتمام البيع السريع</span>
                <span className="flex items-center gap-2">
                  <span dir="ltr" className="font-mono font-bold">
                    {ticket.grandTotal} د.ج
                  </span>
                  <kbd dir="ltr" className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                    F2
                  </kbd>
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Dual-mode receipt modal (TB-068) */}
      {receipt && receiptOpen && (
        <PosReceiptModal
          data={receipt}
          onClose={() => setReceiptOpen(false)}
          onNewSale={() => {
            setReceipt(null);
            setReceiptOpen(false);
            onNewSale();
          }}
        />
      )}

      {/* Customer picker modal */}
      {customerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCustomerOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="اختيار العميل"
        >
          <div className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
            <div className="flex shrink-0 items-center justify-between border-b border-navy-border/30 p-3">
              <h3 className="text-sm font-bold text-slate-100">اختيار العميل</h3>
              <button
                type="button"
                onClick={() => setCustomerOpen(false)}
                aria-label="إغلاق"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="scrollbar-premium min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <div className="relative">
                <UserSearch
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  autoFocus
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setCustomerOpen(false);
                  }}
                  placeholder="ابحث بالاسم أو الهاتف..."
                  aria-label="بحث عن عميل"
                  className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 py-2 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>

              <button
                type="button"
                onClick={selectWalkin}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-right ${
                  useWalkin
                    ? 'border-cyan-500/40 bg-cyan-500/10'
                    : 'border-navy-border/40 hover:bg-white/[0.04]'
                }`}
              >
                <User className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden="true" />
                <span className="text-sm font-semibold text-slate-100">عميل نقدي (افتراضي)</span>
              </button>

              {filteredContacts.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-navy-border/40">
                  {filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectContact(c)}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-navy-border/20 px-3 py-2 text-right last:border-0 hover:bg-white/[0.05]"
                    >
                      <span className="text-sm text-slate-100">{c.name}</span>
                      <span className="font-mono text-[11px] text-slate-500" dir="ltr">
                        {c.phone ?? '—'}
                      </span>
                    </button>
                  ))}
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

              <div className="border-t border-navy-border/30 pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <UserPlus className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                  عميل جديد سريع
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    onKeyDown={(e) => {
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
                      if (e.key === 'Enter') void handleQuickAdd();
                    }}
                    placeholder="الهاتف (اختياري)"
                    aria-label="هاتف العميل"
                    className="w-full rounded-xl border border-navy-border/40 bg-navy-950/60 px-3 py-2 font-mono text-sm text-slate-100 placeholder:font-sans placeholder:text-slate-600 outline-none focus:border-cyan-500/50"
                    dir="ltr"
                  />
                  {quickError && <p className="text-xs text-rose-400" role="alert">{quickError}</p>}
                  <button
                    type="button"
                    onClick={() => void handleQuickAdd()}
                    disabled={createContactMut.isPending}
                    className="w-full rounded-xl bg-cyan-600 px-4 py-2 text-sm font-extrabold text-navy-950 hover:bg-cyan-500 disabled:opacity-50"
                  >
                    {createContactMut.isPending ? 'جاري الإنشاء…' : 'إنشاء واختيار'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
