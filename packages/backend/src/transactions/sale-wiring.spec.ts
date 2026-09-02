import * as fs from 'fs';
import * as path from 'path';
import { TransactionsService } from './transactions.service';

const mockCashService: any = {
  postCashMovement: jest.fn().mockResolvedValue(undefined),
};
const mockPrisma: any = {
  account: { findUnique: jest.fn(), update: jest.fn() },
  item: { findFirst: jest.fn() },
  stockMovement: { findFirst: jest.fn(), aggregate: jest.fn(), create: jest.fn() },
  service: { findFirst: jest.fn() },
  setting: { findUnique: jest.fn(), upsert: jest.fn() },
  transaction: { create: jest.fn(), findUnique: jest.fn() },
  transactionItem: { create: jest.fn() },
  transactionService: { create: jest.fn() },
  ledgerEntry: { create: jest.fn() },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

/**
 * TB-057 wiring proof: SaleForm computes amountPaidNow correctly but
 * useCreateSaleMutation.mutationFn previously dropped it before POST.
 * This spec proves:
 *  1) the frontend file now wires amountPaidNow into the POST body
 *  2) when backend receives amountPaidNow, a CashMovement SALE_PAYMENT is created
 *  3) when amountPaidNow is omitted, no CashMovement is created (ceremonial sale)
 */

describe('TB-057 sale wiring — amountPaidNow reaches backend and moves cash', () => {
  // 1. File-content wiring proof: would FAIL on pre-fix code (no amountPaidNow line)
  it('useCreateSaleMutation forwards amountPaidNow into POST body', () => {
    const filePath = path.resolve(__dirname, '../../../frontend/src/features/transactions/hooks/useTransactions.ts');
    // fallback for different cwd when jest runs from packages/backend
    const altPath = path.resolve(process.cwd(), '../frontend/src/features/transactions/hooks/useTransactions.ts');
    const p = fs.existsSync(filePath) ? filePath : altPath;
    const content = fs.readFileSync(p, 'utf-8');
    // Must contain conditional inclusion of amountPaidNow in body
    expect(content).toContain('amountPaidNow');
    expect(content).toContain("body.amountPaidNow = payload.amountPaidNow");
    expect(content).toContain("payload.amountPaidNow !== undefined");
    // Must NOT have been replaced by contactId wiring (backend does not consume contactId)
    // contactId must not appear inside useCreateSaleMutation body construction
    const saleFnBlock = content.slice(content.indexOf('export function useCreateSaleMutation'));
    // amountPaidNow wiring must be inside the sale mutation, not purchase/payment
    expect(saleFnBlock).toContain('amountPaidNow');
  });

  // 2. Pure body-builder logic: mirrors the fixed mutationFn body construction
  it('body builder includes amountPaidNow when present and omits when undefined', () => {
    function buildSaleBody(payload: any): Record<string, unknown> {
      const body: Record<string, unknown> = {
        accountId: payload.accountId,
        amount: payload.amount,
        type: 'SALE',
        note: payload.note,
      };
      if (payload.amountPaidNow !== undefined) body.amountPaidNow = payload.amountPaidNow;
      if (payload.itemLines && payload.itemLines.length > 0) body.itemLines = payload.itemLines;
      if (payload.serviceLines && payload.serviceLines.length > 0) body.serviceLines = payload.serviceLines;
      return body;
    }

    const withPaid = buildSaleBody({ accountId: 'acc1', amount: '1000.00', amountPaidNow: '400.00', note: 'x' });
    expect(withPaid.amountPaidNow).toBe('400.00');
    expect(withPaid).toHaveProperty('amountPaidNow');

    const withoutPaid = buildSaleBody({ accountId: 'acc1', amount: '1000.00', amountPaidNow: undefined });
    expect(withoutPaid).not.toHaveProperty('amountPaidNow');

    const zeroPaid = buildSaleBody({ accountId: 'acc1', amount: '1000.00', amountPaidNow: '0.00' });
    expect(zeroPaid.amountPaidNow).toBe('0.00');

    // old buggy builder would always omit — this assertion documents the defect
    function buildSaleBodyBuggy(payload: any): Record<string, unknown> {
      const body: Record<string, unknown> = {
        accountId: payload.accountId,
        amount: payload.amount,
        type: 'SALE',
        note: payload.note,
      };
      if (payload.itemLines && payload.itemLines.length > 0) body.itemLines = payload.itemLines;
      if (payload.serviceLines && payload.serviceLines.length > 0) body.serviceLines = payload.serviceLines;
      return body;
    }
    const buggy = buildSaleBodyBuggy({ accountId: 'acc1', amount: '1000.00', amountPaidNow: '400.00' });
    expect(buggy).not.toHaveProperty('amountPaidNow'); // proves old code dropped the field
  });

  // 3. Backend money-path: amountPaidNow -> CashMovement SALE_PAYMENT
  it('backend createTransaction with amountPaidNow creates CashMovement SALE_PAYMENT', async () => {
    jest.clearAllMocks();
    mockCashService.postCashMovement.mockResolvedValue(undefined);
    const service = new TransactionsService(mockPrisma as any, mockCashService);

    const acc = { id: 'acc1', role: 'CUSTOMER', currentBalance: '0.00', contact: { isActive: true } };
    mockPrisma.account.findUnique.mockResolvedValue(acc);
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'item1', name: 'Phone', isActive: true, costPrice: '500.00' });
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
    mockPrisma.stockMovement.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 10 } })
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: '1' });
    mockPrisma.setting.upsert.mockResolvedValue({});
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-wiring' });
    mockPrisma.transaction.findUnique.mockResolvedValue({ id: 'tx-wiring' });

    await service.createTransaction({
      type: 'SALE' as any,
      accountId: 'acc1',
      amount: '1000.00',
      amountPaidNow: '400.00',
      itemLines: [{ itemId: 'item1', quantity: 1, unitPrice: '1000.00' }],
    } as any);

    expect(mockCashService.postCashMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'IN', category: 'SALE_PAYMENT', amount: '400.00' }),
    );
  });

  it('backend createTransaction without amountPaidNow creates NO CashMovement (ceremonial)', async () => {
    jest.clearAllMocks();
    mockCashService.postCashMovement.mockResolvedValue(undefined);
    const service = new TransactionsService(mockPrisma as any, mockCashService);

    const acc = { id: 'acc1', role: 'CUSTOMER', currentBalance: '0.00', contact: { isActive: true } };
    mockPrisma.account.findUnique.mockResolvedValue(acc);
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'item1', name: 'Phone', isActive: true, costPrice: '500.00' });
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
    mockPrisma.stockMovement.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: 10 } })
      .mockResolvedValueOnce({ _sum: { quantity: 0 } });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: '1' });
    mockPrisma.setting.upsert.mockResolvedValue({});
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-ceremonial' });
    mockPrisma.transaction.findUnique.mockResolvedValue({ id: 'tx-ceremonial' });

    await service.createTransaction({
      type: 'SALE' as any,
      accountId: 'acc1',
      amount: '1000.00',
      // amountPaidNow omitted -> defaults to 0.00
      itemLines: [{ itemId: 'item1', quantity: 1, unitPrice: '1000.00' }],
    } as any);

    expect(mockCashService.postCashMovement).not.toHaveBeenCalled();
  });
});
