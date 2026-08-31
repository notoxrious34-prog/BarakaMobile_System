import { TransactionsService } from './transactions.service';

const mockCashService: any = {
  postCashMovement: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma: any = {
  account: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
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

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCashService.postCashMovement.mockResolvedValue(undefined);
    service = new TransactionsService(mockPrisma, mockCashService);
  });

  it('partial payment on SALE creates dual ledger entries and cash IN movement', async () => {
    const customerAcc = { id: 'acc1', role: 'CUSTOMER', currentBalance: '0.00', contact: { isActive: true } };
    mockPrisma.account.findUnique.mockResolvedValue(customerAcc);
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'item1', name: 'Phone', isActive: true, costPrice: '500.00' });
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
    mockPrisma.stockMovement.aggregate.mockResolvedValueOnce({ _sum: { quantity: 10 } }).mockResolvedValueOnce({ _sum: { quantity: 0 } });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: '1' });
    mockPrisma.setting.upsert.mockResolvedValue({});
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx1' });
    mockPrisma.transaction.findUnique.mockResolvedValue({ id: 'tx1', amount: '1000.00', amountPaidNow: '400.00' });

    const result = await service.createTransaction({
      type: 'SALE' as any,
      accountId: 'acc1',
      amount: '1000.00',
      amountPaidNow: '400.00',
      itemLines: [{ itemId: 'item1', quantity: 1, unitPrice: '1000.00' }],
    } as any);

    expect(mockPrisma.ledgerEntry.create).toHaveBeenCalledTimes(2);
    expect(mockCashService.postCashMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'IN', category: 'SALE_PAYMENT', amount: '400.00' }));
    expect(result).toBeTruthy();
  });

  it('insufficient cash on PURCHASE immediate payment rolls back entire transaction atomically (stock NOT incremented)', async () => {
    const supplierAcc = { id: 'acc2', role: 'SUPPLIER', currentBalance: '0.00' };
    mockPrisma.account.findUnique.mockResolvedValue(supplierAcc);
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'item1', name: 'Phone', isActive: true, costPrice: '500.00' });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: '1' });
    mockPrisma.setting.upsert.mockResolvedValue({});
    mockPrisma.transaction.create.mockResolvedValue({ id: 'tx2' });
    mockCashService.postCashMovement.mockRejectedValueOnce(new Error('رصيد الصندوق غير كافٍ لإتمام هذه العملية'));

    await expect(
      service.createTransaction({
        type: 'PURCHASE' as any,
        accountId: 'acc2',
        amount: '1000.00',
        amountPaidNow: '800.00',
        itemLines: [{ itemId: 'item1', quantity: 2, unitPrice: '500.00' }],
      } as any),
    ).rejects.toThrow();

    // stockMovement.create should NOT have been called because transaction rolled back before items loop if cash fails? Actually cash is after ledger before items, but we still verify no stock increment persisted.
    // In our implementation, stock movements happen after cash movement. So if cash fails, we should not have created stock.
    expect(mockPrisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('PAYMENT_IN posts cash IN movement', async () => {
    mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1', role: 'CUSTOMER', currentBalance: '500.00' });
    mockPrisma.transaction.create.mockResolvedValue({ id: 'pay1' });
    mockPrisma.transaction.findUnique.mockResolvedValue({ id: 'pay1' });

    await service.createPayment({ accountId: 'acc1', amount: '200.00' } as any, 'PAYMENT_IN' as any);
    expect(mockCashService.postCashMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'IN', category: 'PAYMENT_IN' }));
  });

  it('PAYMENT_OUT insufficient cash rolls back', async () => {
    mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc2', role: 'SUPPLIER', currentBalance: '100.00' });
    mockPrisma.transaction.create.mockResolvedValue({ id: 'pay2' });
    mockCashService.postCashMovement.mockRejectedValueOnce(new Error('رصيد الصندوق غير كافٍ لإتمام هذه العملية'));
    await expect(service.createPayment({ accountId: 'acc2', amount: '50.00' } as any, 'PAYMENT_OUT' as any)).rejects.toThrow();
  });
});
