import { CashService } from './cash.service';
import Decimal from 'decimal.js';

const mockPrisma: any = {
  cashAccount: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  cashMovement: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

describe('CashService', () => {
  let service: CashService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CashService(mockPrisma);
  });

  it('postCashMovement IN increases balance precisely via decimal.js', async () => {
    mockPrisma.cashAccount.findFirst.mockResolvedValue({ id: 'ca1', currentBalance: '100.00' });
    mockPrisma.cashMovement.create.mockResolvedValue({});
    mockPrisma.cashAccount.update.mockResolvedValue({});

    const tx: any = mockPrisma;
    await service.postCashMovement(tx, { type: 'IN', category: 'OWNER_DEPOSIT', amount: '50.555' });
    // 50.555 rounds to 50.56 via toDecimalPlaces(2)
    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: '50.56', balanceBefore: '100.00', balanceAfter: '150.56' }) }),
    );
  });

  it('postCashMovement OUT throws when insufficient balance', async () => {
    mockPrisma.cashAccount.findFirst.mockResolvedValue({ id: 'ca1', currentBalance: '10.00' });
    const tx: any = mockPrisma;
    await expect(service.postCashMovement(tx, { type: 'OUT', category: 'OWNER_DRAW', amount: '20.00' })).rejects.toThrow('رصيد الصندوق غير كاف');
  });

  it('recordOwnerDraw creates OUT OWNER_DRAW movement', async () => {
    mockPrisma.cashAccount.findFirst.mockResolvedValue({ id: 'ca1', currentBalance: '100.00' });
    mockPrisma.cashMovement.create.mockResolvedValue({});
    mockPrisma.cashAccount.update.mockResolvedValue({});
    mockPrisma.cashMovement.findFirst.mockResolvedValue({ id: 'm1', category: 'OWNER_DRAW', type: 'OUT' });
    const result = await service.recordOwnerDraw({ amount: '30.00', note: 'test' });
    expect(result).toBeTruthy();
  });

  it('recordOwnerDeposit creates IN OWNER_DEPOSIT movement', async () => {
    mockPrisma.cashAccount.findFirst.mockResolvedValue({ id: 'ca1', currentBalance: '0.00' });
    mockPrisma.cashMovement.create.mockResolvedValue({});
    mockPrisma.cashAccount.update.mockResolvedValue({});
    mockPrisma.cashMovement.findFirst.mockResolvedValue({ id: 'm2', category: 'OWNER_DEPOSIT', type: 'IN' });
    const result = await service.recordOwnerDeposit({ amount: '200.00' });
    expect(result).toBeTruthy();
  });

  it('getDailyClosing computes opening/closing correctly', async () => {
    mockPrisma.cashAccount.findFirst.mockResolvedValue({ id: 'ca1', currentBalance: '500.00' });
    mockPrisma.cashMovement.findMany.mockResolvedValue([
      { id: '1', type: 'IN', category: 'SALE_PAYMENT', amount: '100.00', balanceBefore: '0.00', balanceAfter: '100.00', createdAt: new Date('2026-08-31T10:00:00Z') },
      { id: '2', type: 'OUT', category: 'EXPENSE', amount: '30.00', balanceBefore: '100.00', balanceAfter: '70.00', createdAt: new Date('2026-08-31T12:00:00Z') },
    ]);
    const closing = await service.getDailyClosing('2026-08-31');
    expect(closing.totalIn).toBe('100.00');
    expect(closing.totalOut).toBe('30.00');
    expect(closing.closingBalance).toBe('70.00');
    expect(closing.openingBalance).toBe('0.00');
  });

  it('owner draw/deposit excluded from profit is enforced at service level (no expense impact)', async () => {
    // This test documents expectation: CashService does not touch expenses table.
    // Profit exclusion is verified in reports.service.spec, here we ensure movements are categorized correctly.
    mockPrisma.cashAccount.findFirst.mockResolvedValue({ id: 'ca1', currentBalance: '100.00' });
    mockPrisma.cashMovement.create.mockResolvedValue({});
    mockPrisma.cashAccount.update.mockResolvedValue({});
    const tx: any = mockPrisma;
    await service.postCashMovement(tx, { type: 'OUT', category: 'OWNER_DRAW', amount: '10.00' });
    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ category: 'OWNER_DRAW' }) }));
    await service.postCashMovement(tx, { type: 'IN', category: 'OWNER_DEPOSIT', amount: '10.00' });
    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ category: 'OWNER_DEPOSIT' }) }));
  });
});
