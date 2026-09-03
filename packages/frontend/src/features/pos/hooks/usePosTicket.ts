import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import type { Item } from '@/features/inventory/hooks/useInventory';

export type TicketLine = {
  itemId: string;
  name: string;
  sku: string | null;
  /** Unit price as Decimal 2dp string */
  unitPrice: string;
  quantity: number;
  maxStock: number;
};

export type DiscountType = 'FIXED' | 'PERCENT';

/** Display/validation regexes — integers for counts, 2dp for money strings */
export const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;
export const PERCENT_RE = /^\d+(\.\d{1,2})?$/;

export function to2dp(v: string | number | Decimal): string {
  try {
    return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  } catch {
    return '0.00';
  }
}

const D2 = (d: Decimal): string =>
  d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);

export type AddResult = 'added' | 'incremented' | 'capped' | 'blocked';

/**
 * Active ticket state + every monetary derivation strictly in Decimal.
 * Quantities are integers (counts, never money) — plain arithmetic there is fine.
 */
export function usePosTicket() {
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>('FIXED');
  const [discountValue, setDiscountValue] = useState('');
  const [received, setReceived] = useState('');

  function addItem(item: Item, qty = 1): AddResult {
    const stock = typeof item.currentStock === 'number' ? item.currentStock : 999999;
    if (stock <= 0) return 'blocked';
    const want = Number.isInteger(qty) && qty > 0 ? qty : 1;
    const existing = lines.find((l) => l.itemId === item.id);
    if (!existing) {
      setLines((prev) => [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          sku: item.sku ?? null,
          unitPrice: to2dp(item.sellingPrice ?? '0'),
          quantity: Math.min(want, stock),
          maxStock: stock,
        },
      ]);
      return 'added';
    }
    if (existing.quantity + want > existing.maxStock) {
      setLines((prev) =>
        prev.map((l) =>
          l.itemId === item.id ? { ...l, quantity: l.maxStock } : l,
        ),
      );
      return 'capped';
    }
    setLines((prev) =>
      prev.map((l) =>
        l.itemId === item.id ? { ...l, quantity: l.quantity + want } : l,
      ),
    );
    return 'incremented';
  }

  function setQuantity(itemId: string, raw: string): void {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return;
    const q = Number.parseInt(t, 10);
    if (!Number.isSafeInteger(q) || q < 1) return;
    setLines((prev) =>
      prev.map((l) =>
        l.itemId === itemId ? { ...l, quantity: Math.min(q, l.maxStock) } : l,
      ),
    );
  }

  function increment(itemId: string): void {
    setLines((prev) =>
      prev.map((l) =>
        l.itemId === itemId
          ? { ...l, quantity: Math.min(l.quantity + 1, l.maxStock) }
          : l,
      ),
    );
  }

  function decrement(itemId: string): void {
    setLines((prev) =>
      prev.map((l) =>
        l.itemId === itemId
          ? { ...l, quantity: Math.max(l.quantity - 1, 1) }
          : l,
      ),
    );
  }

  function removeLine(itemId: string): void {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }

  function clear(): void {
    setLines([]);
    setDiscountValue('');
    setReceived('');
  }

  const lineTotals: string[] = useMemo(
    () =>
      lines.map((l) => {
        try {
          return D2(new Decimal(l.unitPrice).times(new Decimal(l.quantity)));
        } catch {
          return '0.00';
        }
      }),
    [lines],
  );

  const subtotal: string = useMemo(() => {
    let sum = new Decimal(0);
    for (const t of lineTotals) {
      try {
        sum = sum.plus(new Decimal(t));
      } catch {
        /* skip malformed — never break the ticket */
      }
    }
    return D2(sum);
  }, [lineTotals]);

  const discountInputValid: boolean = useMemo(() => {
    const v = discountValue.trim();
    if (v === '') return true;
    return discountType === 'FIXED' ? DECIMAL_RE.test(v) : PERCENT_RE.test(v);
  }, [discountValue, discountType]);

  /** Discount amount, strictly bounded: FIXED ≤ subtotal, PERCENT ≤ 100% */
  const discountAmount: string = useMemo(() => {
    const v = discountValue.trim();
    if (v === '' || !discountInputValid) return '0.00';
    try {
      const sub = new Decimal(subtotal);
      if (discountType === 'FIXED') {
        return D2(Decimal.min(new Decimal(v), sub));
      }
      const pct = new Decimal(v);
      const clamped = pct.greaterThan(100)
        ? new Decimal(100)
        : pct.lessThan(0)
          ? new Decimal(0)
          : pct;
      return D2(sub.times(clamped).div(new Decimal(100)));
    } catch {
      return '0.00';
    }
  }, [discountValue, discountInputValid, discountType, subtotal]);

  const grandTotal: string = useMemo(() => {
    try {
      return D2(new Decimal(subtotal).minus(new Decimal(discountAmount)));
    } catch {
      return subtotal;
    }
  }, [subtotal, discountAmount]);

  const receivedValid: boolean = useMemo(() => {
    const v = received.trim();
    if (v === '') return true;
    return DECIMAL_RE.test(v);
  }, [received]);

  /** Signed change due (received − total); null while received is empty/invalid */
  const changeDue: string | null = useMemo(() => {
    const v = received.trim();
    if (v === '' || !receivedValid) return null;
    try {
      return D2(new Decimal(v).minus(new Decimal(grandTotal)));
    } catch {
      return null;
    }
  }, [received, receivedValid, grandTotal]);

  /**
   * Backend caps amountPaidNow at amount — clamp here so payload never 400s.
   * undefined (not '0.00') when cashier typed nothing, matching SaleForm.
   */
  const paidNow: string | undefined = useMemo(() => {
    const v = received.trim();
    if (v === '' || !receivedValid) return undefined;
    try {
      const r = new Decimal(v);
      const total = new Decimal(grandTotal);
      return D2(Decimal.min(r, total));
    } catch {
      return undefined;
    }
  }, [received, receivedValid, grandTotal]);

  const itemsCount: number = useMemo(
    () => lines.reduce((n, l) => n + l.quantity, 0),
    [lines],
  );

  const canCheckout: boolean =
    lines.length > 0 && discountInputValid && receivedValid;

  return {
    lines,
    lineTotals,
    subtotal,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    discountAmount,
    grandTotal,
    received,
    setReceived,
    changeDue,
    paidNow,
    itemsCount,
    canCheckout,
    addItem,
    setQuantity,
    increment,
    decrement,
    removeLine,
    clear,
  };
}

export type PosTicket = ReturnType<typeof usePosTicket>;
