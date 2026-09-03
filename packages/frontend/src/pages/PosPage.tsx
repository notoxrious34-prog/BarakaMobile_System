import { useCallback, useEffect, useRef, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { BrandMark } from '@/components/layout/BrandMark';
import { useItemsQuery } from '@/features/inventory/hooks/useInventory';
import { useCreateSaleMutation } from '@/features/transactions/hooks/useTransactions';
import { usePosTicket, to2dp } from '@/features/pos/hooks/usePosTicket';
import { useWalkinAccount } from '@/features/pos/hooks/useWalkinAccount';
import { CatalogPanel } from '@/features/pos/components/CatalogPanel';
import { TicketPanel, type LastSale } from '@/features/pos/components/TicketPanel';
import { PosShortcutsBar } from '@/features/pos/components/PosShortcutsBar';

/**
 * POS Cockpit — front-office sales terminal (Phase 1, TB-066).
 * Strictly customer-facing: no purchases, suppliers, or clearing here.
 * All money math lives in usePosTicket (decimal.js); this page is layout,
 * keyboard wiring, and the sale submission contract.
 */
export function PosPage() {
  const ticket = usePosTicket();
  const walkin = useWalkinAccount();
  const itemsQ = useItemsQuery();
  const createMut = useCreateSaleMutation();
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [apiError, setApiError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<LastSale | null>(null);

  const canSubmitRef = useRef(false);
  canSubmitRef.current =
    ticket.canCheckout && walkin.accountId !== null && !createMut.isPending;

  const handleCheckout = useCallback(
    async (accountId: string) => {
      setApiError(null);
      if (ticket.lines.length === 0 || !ticket.canCheckout) return;
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
        setLastSale({
          invoiceNumber: (res as unknown as { invoiceNumber?: string }).invoiceNumber,
          total: ticket.grandTotal,
          change: ticket.changeDue ?? '0.00',
        });
        ticket.clear();
      } catch (err) {
        setApiError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'فشل تسجيل البيع',
        );
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

  // Keyboard-first ergonomics: F1 focuses search, F2 quick checkout.
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

  return (
    <div dir="rtl" className="font-sans">
      {/* Cockpit header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-9 w-9" />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-100">نقطة البيع</h1>
            <p className="text-[11px] text-slate-500">طرفية المبيعات الأمامية — زبون الكاشير أولاً</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ReceiptText className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          <span>
            <span dir="ltr" className="font-mono font-bold text-slate-200">
              {ticket.itemsCount}
            </span>{' '}
            صنف في السلة
          </span>
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
        <div className="grid gap-3 lg:h-[calc(100vh-11rem)] lg:grid-cols-5 lg:overflow-hidden">
          {/* Right (60%) — catalog first in RTL */}
          <div className="min-h-[50vh] lg:col-span-3 lg:min-h-0">
            <CatalogPanel
              items={itemsQ.data}
              isLoading={itemsQ.isLoading}
              onAdd={(item, qty) => {
                ticket.addItem(item, qty);
                setLastSale(null);
              }}
              searchRef={searchRef}
            />
          </div>
          {/* Left (40%) — active ticket */}
          <div className="lg:col-span-2 lg:min-h-0">
            <TicketPanel
              ticket={ticket}
              walkinAccountId={walkin.accountId}
              walkinError={walkin.error}
              onCheckout={(accountId) => void handleCheckout(accountId)}
              isSubmitting={createMut.isPending}
              apiError={apiError}
              lastSale={lastSale}
              onNewSale={handleNewSale}
            />
          </div>
        </div>
      )}

      <div className="mt-3">
        <PosShortcutsBar />
      </div>
    </div>
  );
}
