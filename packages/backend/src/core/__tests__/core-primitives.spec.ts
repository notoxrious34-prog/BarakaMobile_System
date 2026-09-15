import { Money, MoneyDomainError } from '../money';
import {
  ConcurrencyError,
  ConflictError,
  DomainError,
  FiscalPeriodClosedError,
  InsufficientStockError,
  LedgerImbalanceError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  err,
  ok,
} from '../result';
import { IdempotencyEngine } from '../idempotency';
import { TransactionOrchestrator } from '../transaction-orchestrator';
import type { PrismaService } from '../../prisma/prisma.service';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal $transaction stub — drives the orchestrator without a database. */
function stubPrisma(
  impl: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>,
): PrismaService {
  return { $transaction: jest.fn(impl) } as unknown as PrismaService;
}

describe('core primitives (TASK BRIEF-007 Stage 1.1)', () => {
  describe('Money', () => {
    it('adds, subtracts, multiplies and divides exactly', () => {
      expect(Money.from('10.00').add(Money.from('5.25')).to2dp()).toBe('15.25');
      expect(Money.from('10.00').sub(Money.from('3.33')).to2dp()).toBe('6.67');
      expect(Money.from('10.00').mul('1.5').to2dp()).toBe('15.00');
      expect(Money.from('10.00').div('4').to2dp()).toBe('2.50');
      // 0.1 + 0.2 exactness — the reason float is banned.
      expect(Money.from('0.1').add(Money.from('0.2')).to2dp()).toBe('0.30');
    });

    it('rounds half-up at 2dp and 4dp', () => {
      expect(Money.from('2.345').to2dp()).toBe('2.35');
      expect(Money.from('2.335').to2dp()).toBe('2.34');
      expect(Money.from('2.344').to2dp()).toBe('2.34');
      expect(Money.from('0.12345').to4dp()).toBe('0.1235');
      expect(Money.from('0.12344').to4dp()).toBe('0.1234');
    });

    it('is immutable — operands survive arithmetic', () => {
      const a = Money.from('10.00');
      const b = a.add(Money.from('5.00'));
      expect(a.to2dp()).toBe('10.00');
      expect(b.to2dp()).toBe('15.00');
      expect(Object.isFrozen(a)).toBe(true);
    });

    it('rejects division by zero', () => {
      expect(() => Money.from('10.00').div('0')).toThrow(MoneyDomainError);
      expect(() => Money.from('10.00').div(0)).toThrow(MoneyDomainError);
    });

    it('rejects NaN, Infinity and invalid strings', () => {
      expect(() => Money.from('abc')).toThrow(MoneyDomainError);
      expect(() => Money.from('')).toThrow(MoneyDomainError);
      expect(() => Money.from(NaN)).toThrow(MoneyDomainError);
      expect(() => Money.from(Infinity)).toThrow(MoneyDomainError);
      expect(() => Money.from('-Infinity')).toThrow(MoneyDomainError);
    });

    it('compares and classifies sign', () => {
      expect(Money.from('5').greaterThan(Money.from('4.99'))).toBe(true);
      expect(Money.from('5').greaterThanOrEqual(Money.from('5.00'))).toBe(true);
      expect(Money.from('4').lessThan(Money.from('4.01'))).toBe(true);
      expect(Money.from('4').lessThanOrEqual(Money.from('4.00'))).toBe(true);
      expect(Money.from('5').equals(Money.from('5.00'))).toBe(true);
      expect(Money.zero().isZero()).toBe(true);
      expect(Money.from('0.01').isPositive()).toBe(true);
      expect(Money.from('-0.01').isNegative()).toBe(true);
      expect(Money.from('7').negate().to2dp()).toBe('-7.00');
      expect(Money.from('-7').abs().to2dp()).toBe('7.00');
      expect(Money.zero().to2dp()).toBe('0.00');
    });
  });

  describe('Result', () => {
    it('ok maps, flatMaps and unwraps', () => {
      const r = ok(21).map((n) => n * 2);
      expect(r.isOk()).toBe(true);
      expect(r.unwrap()).toBe(42);
      expect(r.unwrapOr(0)).toBe(42);
      const chained = ok(10).flatMap((n) => ok(n + 5));
      expect(chained.unwrap()).toBe(15);
    });

    it('err contains: map is skipped, unwrap throws, unwrapOr falls back', () => {
      const failure = new ValidationError('bad input');
      const r = err(failure);
      expect(r.isErr()).toBe(true);
      const fn = jest.fn();
      const mapped = r.map(fn);
      expect(fn).not.toHaveBeenCalled();
      expect(mapped.isErr()).toBe(true);
      expect(() => mapped.unwrap()).toThrow(failure);
      expect(mapped.unwrapOr('fallback')).toBe('fallback');
      const flat = r.flatMap(() => ok(1));
      expect(flat.isErr()).toBe(true);
      expect(() => flat.unwrap()).toThrow(ValidationError);
    });

    it('exposes the full domain error hierarchy with stable codes', () => {
      const cases: Array<[DomainError, string]> = [
        [new ValidationError('v'), 'VALIDATION_ERROR'],
        [new NotFoundError('n'), 'NOT_FOUND'],
        [new ConflictError('c'), 'CONFLICT'],
        [new ConcurrencyError('cc'), 'CONCURRENCY_CONFLICT'],
        [new InsufficientStockError('s'), 'INSUFFICIENT_STOCK'],
        [new LedgerImbalanceError('l'), 'LEDGER_IMBALANCE'],
        [new UnauthorizedError('u'), 'UNAUTHORIZED'],
        [new FiscalPeriodClosedError('f'), 'FISCAL_PERIOD_CLOSED'],
      ];
      for (const [error, code] of cases) {
        expect(error).toBeInstanceOf(DomainError);
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe(code);
      }
    });
  });

  describe('IdempotencyEngine', () => {
    it('blocks concurrent duplicate execution with ConcurrencyError', async () => {
      const engine = new IdempotencyEngine();
      const first = await engine.begin('sale-1', 'sale.create');
      expect(first.isReplay).toBe(false);
      await expect(engine.begin('sale-1', 'sale.create')).rejects.toBeInstanceOf(ConcurrencyError);
      await engine.rollback('sale-1');
    });

    it('replays the cached response after commit', async () => {
      const engine = new IdempotencyEngine();
      await engine.begin('sale-2', 'sale.create');
      await engine.commit('sale-2', { body: { id: 'tx-1' }, status: 201 });
      const replay = await engine.begin('sale-2', 'sale.create');
      expect(replay.isReplay).toBe(true);
      expect(replay.response).toEqual({ body: { id: 'tx-1' }, status: 201 });
    });

    it('releases the lock on rollback so the operation can be retried', async () => {
      const engine = new IdempotencyEngine();
      await engine.begin('sale-3', 'sale.create');
      await engine.rollback('sale-3');
      const retry = await engine.begin('sale-3', 'sale.create');
      expect(retry.isReplay).toBe(false);
      // rollback of an unknown key is a safe no-op
      await expect(engine.rollback('sale-3-missing')).resolves.toBeUndefined();
    });

    it('steals stale locks and expires cached responses per TTL', async () => {
      const engine = new IdempotencyEngine();
      engine.configure({ lockTimeoutMs: 5, ttlMs: 10 });
      await engine.begin('sale-4', 'sale.create');
      await sleep(15);
      const stolen = await engine.begin('sale-4', 'sale.create');
      expect(stolen.isReplay).toBe(false);
      await engine.commit('sale-4', { body: 'done' });
      await sleep(20);
      const fresh = await engine.begin('sale-4', 'sale.create');
      expect(fresh.isReplay).toBe(false);
    });
  });

  describe('TransactionOrchestrator', () => {
    it('runs work and fires post-commit handlers strictly after commit, in order', async () => {
      const prisma = stubPrisma(async (fn) => fn({ marker: 'tx' }));
      const orch = new TransactionOrchestrator(prisma);
      const order: string[] = [];
      const off = orch.registerPostCommit(() => {
        order.push('registry');
      });
      const result = await orch.run(
        async (tx) => {
          expect(tx).toEqual({ marker: 'tx' });
          order.push('work');
          return 42;
        },
        { afterCommit: [() => void order.push('adhoc')] },
      );
      expect(result).toBe(42);
      expect(order).toEqual(['work', 'registry', 'adhoc']);
      off();
    });

    it('suppresses post-commit handlers on rollback and normalizes to DomainError', async () => {
      const boom = new Error('db gone');
      const prisma = stubPrisma(async () => {
        throw boom;
      });
      const orch = new TransactionOrchestrator(prisma);
      let handlerCalled = false;
      orch.registerPostCommit(() => {
        handlerCalled = true;
      });
      const failure = await orch.run(async () => 1).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(DomainError);
      expect((failure as DomainError).code).toBe('TRANSACTION_FAILED');
      expect(handlerCalled).toBe(false);
      orch.clearPostCommitRegistry();
    });

    it('passes DomainError through untouched (same instance)', async () => {
      const conflict = new ConcurrencyError('write-write conflict');
      const prisma = stubPrisma(async () => {
        throw conflict;
      });
      const orch = new TransactionOrchestrator(prisma);
      await expect(orch.run(async () => 1)).rejects.toBe(conflict);
    });

    it('fail-fasts on hanging transactions and suppresses post-commit', async () => {
      const prisma = stubPrisma(() => new Promise(() => undefined));
      const orch = new TransactionOrchestrator(prisma);
      let handlerCalled = false;
      orch.registerPostCommit(() => {
        handlerCalled = true;
      });
      await expect(orch.run(async () => 1, { timeoutMs: 20, operationName: 'hang' })).rejects.toBeInstanceOf(
        ConcurrencyError,
      );
      expect(handlerCalled).toBe(false);
      orch.clearPostCommitRegistry();
    });
  });
});
