import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Pause, RotateCcw, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { BrandMark } from '@/components/layout/BrandMark';
import { useItemsQuery } from '@/features/inventory/hooks/useInventory';
import { useCreateSaleMutation } from '@/features/transactions/hooks/useTransactions';
import { usePosTicket, to2dp } from '@/features/pos/hooks/usePosTicket';
import { useWalkinAccount } from '@/features/pos/hooks/useWalkinAccount';
import {
  useParkedTickets,
  type ParkedCustomer,
  type ParkedTicket,
} from '@/features/pos/hooks/useParkedTickets';
import { CatalogPanel } from '@/features/pos/components/CatalogPanel';
import { PosShiftModal } from '@/features/pos/components/PosShiftModal';
import { isAudioEnabled, toggleAudio } from '@/features/pos/utils/posAudio';
import { TicketPanel, type LastSale } from '@/features/pos/components/TicketPanel';

type CustomerSnapshot = {
  label: string;
  customer: ParkedCustomer;
  accountId: string | null;
};

/**
 * POS Cockpit — front-office sales terminal (TB-066 + TB-067).
 * Zero-scroll laptop layout: header + fluid panels + sticky footer.
 * All money math lives in usePosTicket (decimal.js).
 */
export function PosPage() {
  const ticket = usePosTicket();
  const walkin = useWalkinAccount();
  const itemsQ = useItemsQuery();
  const createMut = useCreateSaleMutation();
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [apiError, setApiError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<LastSale | null>(null);

  // Park / hold engine
  const { parked, park, remove } = useParkedTickets();
  const [parkedOpen, setParkedOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [audioOn, setAudioOn] = useState<boolean>(() => isAudioEnabled());
  const [restoreSignal, setRestoreSignal] = useState<{
    nonce: number;
    customer: ParkedCustomer;
  } | null>(null);
  const customerSnap = useRef<CustomerSnapshot>({
    label: 'عميل نقدي (افتراضي)',
    customer: { kind: 'walkin' },
    accountId: null,
  });

  const canSubmitRef = useRef(false);
  canSubmitRef.current =
    ticket.canCheckout && walkin.accountId !== null && !createMut.isPending;

  const handleCheckout = useCallback(
    async (accountId: string): Promise<{ invoiceNumber?: string } | null> => {
      setApiError(null);
      if (ticket.lines.length === 0 || !ticket.canCheckout) return null;
      try {
        const res = await createMut.mutateAsync({
          accountId,
          amount: ticket.grandTotal,
          amountPaidNow: ticket.paidNow,
          note:
            ticket.discountAmount !== '0.00'
              ? `خصم ${ticket.discountValue.trim()}${ticket.discountType === 'PERCENT' ? '%' : ' د.ج'}`
              : undefined,
          itemLines: ticket.lines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            unitPrice: to2dp(l.unitPrice),
          })),
        });
        const invoiceNumber = (res as unknown as { invoiceNumber?: string })
          .invoiceNumber;
        setLastSale({
          invoiceNumber,
          total: ticket.grandTotal,
          change: ticket.changeDue ?? '0.00',
        });
        ticket.clear();
        return { invoiceNumber };
      } catch (err) {
        setApiError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'فشل تسجيل البيع',
        );
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      ticket.lines,
      ticket.canCheckout,
      ticket.grandTotal,
      ticket.paidNow,
      ticket.discountAmount,
      ticket.discountValue,
      ticket.discountType,
      ticket.changeDue,
      createMut,
    ],
  );

  const checkoutRef = useRef(handleCheckout);
  checkoutRef.current = handleCheckout;

  function handlePark(): void {
    if (ticket.lines.length === 0) return;
    const snap = customerSnap.current;
    park({
      customerLabel: snap.label,
      customer: snap.customer,
      lines: ticket.lines.map((l) => ({ ...l })),
      discountType: ticket.discountType,
      discountValue: ticket.discountValue,
      received: ticket.received,
      subtotal: ticket.subtotal,
      grandTotal: ticket.grandTotal,
      itemsCount: ticket.itemsCount,
    });
    setLastSale(null);
    ticket.clear();
    searchRef.current?.focus();
  }

  const parkRef = useRef(handlePark);
  parkRef.current = handlePark;

  function handleRestore(p: ParkedTicket): void {
    ticket.loadState({
      lines: p.lines,
      discountType: p.discountType,
      discountValue: p.discountValue,
      received: p.received,
    });
    setRestoreSignal({ nonce: Date.now(), customer: p.customer });
    remove(p.id);
    setParkedOpen(false);
    setLastSale(null);
    setApiError(null);
    searchRef.current?.focus();
  }

  // Keyboard-first ergonomics: F1 search, F2 checkout, F6 park.
  // (AppShell's global F2 → navigate('/pos') is a no-op while already here.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F1') {
        e.preventDefault();
        if (lastSale) {
          setLastSale(null);
          ticket.clear();
        }
        searchRef.current?.focus();
      } else if (e.key === 'F2') {
        e.preventDefault();
        if (lastSale || !canSubmitRef.current) return;
        const accountId = walkin.accountId;
        if (accountId) void checkoutRef.current(accountId);
      } else if (e.key === 'F6') {
        e.preventDefault();
        parkRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lastSale, ticket, walkin.accountId]);

  function handleNewSale(): void {
    setLastSale(null);
    setApiError(null);
    ticket.clear();
    searchRef.current?.focus();
  }

  function handleCustomerSnapshot(s: CustomerSnapshot): void {
    customerSnap.current = s;
  }

  function handleBackgroundFocus(e: React.MouseEvent): void {
    // Never steal focus from a modal or another form field.
    const t = e.target as HTMLElement | null;
    if (!t || t === searchRef.current) return;
    if (t.closest('[role="dialog"], input, textarea, select, button, a')) return;
    searchRef.current?.focus();
  }

  return (
    <div
      dir="rtl"
      className="flex min-h-[calc(100vh-4.5rem)] flex-col gap-3 font-sans"
      onMouseDown={handleBackgroundFocus}
    >
      {/* Cockpit header */}
      <div className="flex shrink-0 items-center justify-between gap-2 py-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight text-slate-100">نقطة البيع</h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              طرفية المبيعات الأمامية — زبون الكاشير أولاً
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setParkedOpen(true)}
            aria-label="الفواتير المعلقة"
            className="relative inline-flex items-center gap-1.5 rounded-xl border border-navy-border/40 bg-navy-900/60 px-3 py-2 text-xs font-bold text-slate-300 hover:border-amber-500/40 hover:text-amber-300"
          >
            <Pause className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">الفواتير المعلقة</span>
            <span
              dir="ltr"
              className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                parked.length > 0
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-white/[0.06] text-slate-500'
              }`}
            >
              {parked.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAudioOn(toggleAudio())}
            aria-label={audioOn ? 'كتم الأصوات التفاعلية' : 'تفعيل الأصوات التفاعلية'}
            title="تفعيل/كتم الأصوات التفاعلية"
            className={`inline-flex items-center rounded-xl border px-3 py-2 hover:bg-white/[0.05] ${audioOn ? 'border-navy-border/40 text-cyan-300' : 'border-navy-border/40 text-slate-500'}`}
          >
            {audioOn ? (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShiftOpen(true)}
            aria-label="إغلاق الوردية / تقرير Z"
            title="إغلاق الوردية / تقرير Z"
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">إغلاق الوردية / تقرير Z</span>
          </button>
          <button
            type="button"
            onClick={handlePark}
            disabled={ticket.lines.length === 0}
            title="تعليق الفاتورة (F6)"
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Pause className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">تعليق الفاتورة</span>
            <kbd dir="ltr" className="hidden rounded border border-navy-border bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] text-amber-400 lg:inline">
              F6
            </kbd>
          </button>
        </div>
      </div>

      {itemsQ.isError ? (
        <div className="rounded-2xl border border-rose-500/20 bg-navy-900 p-6 text-center">
          <p className="text-sm text-rose-300">تعذر تحميل الكتالوج</p>
          <button
            type="button"
            onClick={() => itemsQ.refetch()}
            className="mt-2 rounded-xl bg-rose-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-rose-500"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-5">
          {/* Right (60%) — catalog first in RTL */}
          <div className="lg:col-span-3">
            <CatalogPanel
              items={itemsQ.data}
              isLoading={itemsQ.isLoading}
              onAdd={(item, qty) => {
                const res = ticket.addItem(item, qty);
                setLastSale(null);
                return res;
              }}
              searchRef={searchRef}
            />
          </div>
          {/* Left (40%) — active ticket */}
          <div className="lg:col-span-2">
            <TicketPanel
              ticket={ticket}
              walkinAccountId={walkin.accountId}
              onCheckout={(accountId) => handleCheckout(accountId)}
              isSubmitting={createMut.isPending}
              apiError={apiError}
              lastSale={lastSale}
              onNewSale={handleNewSale}
              restoreSignal={restoreSignal}
              onCustomerSnapshot={handleCustomerSnapshot}
            />
          </div>
        </div>
      )}

      {/* Shift close / Z-report modal (TB-068) */}
      {shiftOpen && <PosShiftModal onClose={() => setShiftOpen(false)} />}

      {/* Parked tickets modal */}
      {parkedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setParkedOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="الفواتير المعلقة"
        >
          <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-navy-border/40 bg-navy-900">
            <div className="flex shrink-0 items-center justify-between border-b border-navy-border/30 p-4">
              <h3 className="text-sm font-bold text-slate-100">
                الفواتير المعلقة{' '}
                <span dir="ltr" className="font-mono text-xs text-slate-400">
                  ({parked.length})
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setParkedOpen(false)}
                aria-label="إغلاق"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="scrollbar-premium min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {parked.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">لا توجد فواتير معلقة</p>
              ) : (
                parked.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-navy-border/30 bg-navy-950/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {p.customerLabel}
                      </p>
                      <span dir="ltr" className="shrink-0 font-mono text-sm font-bold text-amber-400">
                        {p.grandTotal}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {new Date(p.createdAt).toLocaleString('ar-DZ', {
                        hour: '2-digit',
                        minute: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                      })}{' '}
                      · <span dir="ltr" className="font-mono">{p.itemsCount}</span> صنف
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(p)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-extrabold text-navy-950 hover:bg-cyan-500"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> استرجاع
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        aria-label="حذف الفاتورة المعلقة"
                        className="rounded-lg border border-navy-border/40 p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
