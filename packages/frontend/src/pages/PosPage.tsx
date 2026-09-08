import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Pause, Volume2, VolumeX } from 'lucide-react';
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
import { ParkedTicketsModal } from '@/features/pos/components/ParkedTicketsModal';
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
    async (payload: { accountId: string; creditAmount?: string; customerId?: string }): Promise<{
      invoiceNumber?: string;
      soldSerials?: { id: string; imei1: string; imei2: string | null; itemId: string; warrantyMonths: number; warrantyExpiresAt: string | null }[];
    } | null> => {
      setApiError(null);
      if (ticket.lines.length === 0 || !ticket.canCheckout) return null;
      // Split cart: real catalog lines ride as itemLines (stock decrements);
      // ad-hoc custom lines fold into the net amount + transparent note
      // (backend itemId/serviceId are mandatory FKs — AD-58).
      const realLines = ticket.lines.filter((l) => !l.isCustom);
      const customLines = ticket.lines.filter((l) => l.isCustom);
      const noteParts: string[] = [];
      if (ticket.discountAmount !== '0.00') {
        noteParts.push(
          `خصم ${ticket.discountValue.trim()}${ticket.discountType === 'PERCENT' ? '%' : ' د.ج'}`,
        );
      }
      if (customLines.length > 0) {
        noteParts.push(
          `بنود مخصصة: ${customLines.map((l) => `${l.name} ×${l.quantity} @ ${to2dp(l.unitPrice)}`).join('، ')}`,
        );
      }
      try {
        const res = await createMut.mutateAsync({
          accountId: payload.accountId,
          amount: ticket.grandTotal,
          amountPaidNow: ticket.paidNow,
          creditAmount: payload.creditAmount,
          customerId: payload.customerId,
          note: noteParts.length > 0 ? noteParts.join(' | ') : undefined,
          itemLines: realLines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            unitPrice: to2dp(l.unitPrice),
            ...(l.serialIds.length > 0 ? { serialIds: l.serialIds } : {}),
          })),
        });
        const invoiceNumber = (res as unknown as { invoiceNumber?: string })
          .invoiceNumber;
        const soldSerials = (res as unknown as {
          soldSerials?: { id: string; imei1: string; imei2: string | null; itemId: string; warrantyMonths: number; warrantyExpiresAt: string | null }[];
        }).soldSerials;
        setLastSale({
          invoiceNumber,
          total: ticket.grandTotal,
          change: ticket.changeDue ?? '0.00',
        });
        ticket.clear();
        return { invoiceNumber, soldSerials };
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
    // Swap: park the live cart first so nothing is lost.
    if (ticket.lines.length > 0) {
      const ok = window.confirm(
        'السلة الحالية بها منتجات — هل تريد تعليق السلة الحالية واستعادة هذه السلة؟',
      );
      if (!ok) return;
      handlePark();
    }
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
        if (accountId) void checkoutRef.current({ accountId });
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
              onAddSerial={(item, serial) => {
                const res = ticket.addSerialItem(item, serial);
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
              onCheckout={(payload) => handleCheckout(payload)}
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

      {/* Parked tickets drawer (TB-070) */}
      {parkedOpen && (
        <ParkedTicketsModal
          parked={parked}
          onRestore={handleRestore}
          onDelete={remove}
          onClose={() => setParkedOpen(false)}
        />
      )}
    </div>
  );
}
