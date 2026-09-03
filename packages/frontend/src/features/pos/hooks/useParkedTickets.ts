import { useCallback, useState } from 'react';
import type { DiscountType, TicketLine } from './usePosTicket';

export type ParkedCustomer =
  | { kind: 'walkin' }
  | {
      kind: 'contact';
      contactId: string;
      name: string;
      phone: string | null;
      accountId: string;
    };

export type ParkedTicket = {
  id: string;
  createdAt: string;
  customerLabel: string;
  customer: ParkedCustomer;
  lines: TicketLine[];
  discountType: DiscountType;
  discountValue: string;
  received: string;
  subtotal: string;
  grandTotal: string;
  itemsCount: number;
};

const STORAGE_KEY = 'baraka_pos_parked_tickets';
const MAX_PARKED = 20;

function load(): ParkedTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is ParkedTicket =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as ParkedTicket).id === 'string' &&
        Array.isArray((t as ParkedTicket).lines),
    );
  } catch {
    return [];
  }
}

function persist(list: ParkedTicket[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage full/blocked — parked ticket stays in memory only */
  }
}

export function useParkedTickets() {
  const [parked, setParked] = useState<ParkedTicket[]>(load);

  const park = useCallback(
    (t: Omit<ParkedTicket, 'id' | 'createdAt'>): ParkedTicket => {
      const entry: ParkedTicket = {
        ...t,
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
      };
      setParked((prev) => {
        const next = [entry, ...prev].slice(0, MAX_PARKED);
        persist(next);
        return next;
      });
      return entry;
    },
    [],
  );

  const remove = useCallback((id: string): void => {
    setParked((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persist(next);
      return next;
    });
  }, []);

  return { parked, park, remove };
}
