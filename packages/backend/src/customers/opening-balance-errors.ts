import { Prisma } from '@prisma/client';

/**
 * TASK-BRIEF-002 Stream 4 (DEF-BE-003), shared by DebtLedgerService and
 * SupplierDebtService (single definition — no duplication): the partial
 * unique indexes on (customerId) / (contactId) WHERE type='OPENING_BALANCE'
 * are raw SQL (migration 20260911193000_opening_balance_partial_unique) —
 * Prisma doesn't know about them via schema.prisma, so a violation surfaces
 * as a raw SQLite constraint error rather than a mapped P2002. Detect it
 * here so callers can map it to a clean 409 with no raw DB error leaked.
 */
export function isOpeningBalanceUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('UNIQUE constraint failed') && msg.includes('opening_balance_unique');
}
