import { ReportsService } from './reports.service';
import Decimal from 'decimal.js';

const mockCashService: any = {
  getCurrentBalance: jest.fn().mockResolvedValue({ currentBalance: '200.00' }),
};

const mockExpensesService: any = {
  getExpenseBreakdown: jest.fn().mockResolvedValue([]),
};

const mockRepairService: any = {
  getRepairProfit: jest.fn().mockResolvedValue({ totalRepairRevenue: '0.00', totalExternalCost: '0.00', totalRepairProfit: '0.00', ticketCount: 0 }),
};

const mockPrisma = {
  account: { findMany: jest.fn() },
  item: { findMany: jest.fn() },
  stockMovement: { findFirst: jest.fn(), aggregate: jest.fn() },
  transaction: { findMany: jest.fn() },
  transactionItem: { findMany: jest.fn() },
  transactionService: { findMany: jest.fn() },
  contact: { findMany: jest.fn() },
  setting: { findUnique: jest.fn() },
  ledgerEntry: { findMany: jest.fn() },
  expense: { findMany: jest.fn() },
  repairTicket: { findMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
} as any;

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCashService.getCurrentBalance.mockResolvedValue({ currentBalance: '200.00' });
    mockExpensesService.getExpenseBreakdown.mockResolvedValue([]);
    mockRepairService.getRepairProfit.mockResolvedValue({ totalRepairRevenue: '0.00', totalExternalCost: '0.00', totalRepairProfit: '0.00', ticketCount: 0 });
    const prismaMock = {
      account: mockPrisma.account,
      item: mockPrisma.item,
      stockMovement: mockPrisma.stockMovement,
      transaction: mockPrisma.transaction,
      transactionItem: mockPrisma.transactionItem,
      transactionService: mockPrisma.transactionService,
      contact: mockPrisma.contact,
      setting: mockPrisma.setting,
      ledgerEntry: mockPrisma.ledgerEntry,
      expense: mockPrisma.expense,
      repairTicket: mockPrisma.repairTicket,
    } as any;
    service = new ReportsService(prismaMock, mockCashService, mockExpensesService, mockRepairService);
  });

  describe('getCapital()', () => {
    it('computes decimal.js precision correctly: inventory + receivables + cashInHand - payables', async () => {
      mockPrisma.account.findMany
        .mockResolvedValueOnce([{ currentBalance: '1000.50', role: 'CUSTOMER', contact: { isActive: true } }])
        .mockResolvedValueOnce([{ currentBalance: '300.25', role: 'SUPPLIER', contact: { isActive: true } }]);
      mockCashService.getCurrentBalance.mockResolvedValueOnce({ currentBalance: '200.00' });
      mockPrisma.item.findMany.mockResolvedValue([
        { id: 'item1', costPrice: '10.10', isActive: true },
        { id: 'item2', costPrice: '5.05', isActive: true },
      ]);
      mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
      mockPrisma.stockMovement.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 3 } })
        .mockResolvedValueOnce({ _sum: { quantity: 0 } })
        .mockResolvedValueOnce({ _sum: { quantity: 2 } })
        .mockResolvedValueOnce({ _sum: { quantity: 0 } });

      const result = await service.getCapital();
      // inventory = 10.10*3 + 5.05*2 = 40.40, cash 200 => net = 1000.50 -300.25 +40.40+200 = 940.65
      expect(result.inventoryValue).toBe('40.40');
      expect(result.totalReceivables).toBe('1000.50');
      expect(result.totalPayables).toBe('300.25');
      expect(result.cashInHand).toBe('200.00');
      expect(result.netCapital).toBe('940.65');
    });

    it('returns 0.00 values when no data', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]).mockResolvedValue([]);
      mockCashService.getCurrentBalance.mockResolvedValueOnce({ currentBalance: '0.00' });
      mockPrisma.item.findMany.mockResolvedValue([]);
      const result = await service.getCapital();
      expect(result.totalReceivables).toBe('0.00');
      expect(result.totalPayables).toBe('0.00');
      expect(result.inventoryValue).toBe('0.00');
      expect(result.cashInHand).toBe('0.00');
      expect(result.netCapital).toBe('0.00');
    });

    it('netCapital includes cashInHand additive', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]).mockResolvedValue([]);
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockCashService.getCurrentBalance.mockResolvedValueOnce({ currentBalance: '500.00' });
      const result = await service.getCapital();
      expect(result.cashInHand).toBe('500.00');
      expect(result.netCapital).toBe('500.00');
    });
  });

  describe('getNetProfit() — AD-22 historical unitCost', () => {
    it('uses TransactionItem.unitCost (historical) NOT Item.costPrice (live) for profit', async () => {
      const saleTx = { id: 'tx1', type: 'SALE', amount: '160.00', createdAt: new Date('2026-08-15T10:00:00Z') };
      mockPrisma.transaction.findMany.mockResolvedValue([saleTx]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([
        { id: 'ti1', transactionId: 'tx1', itemId: 'item1', quantity: 2, unitPrice: '80.00', unitCost: '50.00', totalPrice: '160.00' },
      ]);
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([]);

      const result = await service.getNetProfit();

      expect(result.itemProfit).toBe('60.00');
      expect(result.grossProfit).toBe('60.00');
      expect(result.totalRevenue).toBe('160.00');
      expect(result.grossMarginPct).toBe('37.50');
      expect(result.totalCost).toBe('100.00');
    });

    it('returns 0.00 margin when revenue is zero', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([]);
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([]);
      const result = await service.getNetProfit();
      expect(result.grossMarginPct).toBe('0.00');
      expect(result.totalRevenue).toBe('0.00');
    });

    it('filters by date range when startDate/endDate provided', async () => {
      const saleInRange = { id: 'tx1', type: 'SALE', amount: '100.00', createdAt: new Date('2026-08-15T10:00:00Z') };
      mockPrisma.transaction.findMany.mockResolvedValue([saleInRange]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([
        { id: 'ti1', transactionId: 'tx1', itemId: 'item1', quantity: 1, unitPrice: '100.00', unitCost: '40.00', totalPrice: '100.00' },
      ]);
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([]);

      const result = await service.getNetProfit('2026-08-15', '2026-08-15');
      expect(result.totalRevenue).toBe('100.00');
      expect(result.itemProfit).toBe('60.00');
    });

    it('includes totalExpenses and netProfitAfterExpenses correctly excluding owner movements', async () => {
      const saleTx = { id: 'tx1', type: 'SALE', amount: '200.00', createdAt: new Date('2026-08-15T10:00:00Z') };
      mockPrisma.transaction.findMany.mockResolvedValue([saleTx]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([
        { id: 'ti1', transactionId: 'tx1', itemId: 'item1', quantity: 1, unitPrice: '200.00', unitCost: '100.00', totalPrice: '200.00' },
      ]);
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([{ id: 'e1', amount: '30.00' }, { id: 'e2', amount: '20.00' }]);

      const result = await service.getNetProfit();
      expect(result.grossProfit).toBe('100.00');
      expect(result.totalExpenses).toBe('50.00');
      expect(result.netProfitAfterExpenses).toBe('50.00');
    });

    it('owner draw/deposit not counted as expenses — netProfitAfterExpenses unaffected by cash movements', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([{ id: 'tx1', type: 'SALE', amount: '100.00' }]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([{ id: 'ti1', quantity: 1, unitPrice: '100.00', unitCost: '0.00', totalPrice: '100.00' }]);
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([]);
      const result = await service.getNetProfit();
      expect(result.totalExpenses).toBe('0.00');
      expect(result.netProfitAfterExpenses).toBe(result.grossProfit);
    });

    it('includes nonzero repairProfit correctly in grossProfit and netProfitAfterExpenses', async () => {
      const saleTx = { id: 'tx1', type: 'SALE', amount: '100.00', createdAt: new Date('2026-08-15T10:00:00Z') };
      mockPrisma.transaction.findMany.mockResolvedValue([saleTx]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([
        { id: 'ti1', quantity: 1, unitPrice: '100.00', unitCost: '60.00', totalPrice: '100.00' },
      ]);
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      mockPrisma.expense.findMany.mockResolvedValue([]);
      mockRepairService.getRepairProfit.mockResolvedValueOnce({ totalRepairRevenue: '150.00', totalExternalCost: '50.00', totalRepairProfit: '75.00', ticketCount: 1 });

      const result = await service.getNetProfit();

      expect(result.repairProfit).toBe('75.00');
      expect(result.grossProfit).toBe('115.00');
      expect(result.netProfitAfterExpenses).toBe('115.00');
    });
  });

  describe('getDebtSummary()', () => {
    it('sorts topDebtors descending by balance', async () => {
      mockPrisma.account.findMany
        .mockResolvedValueOnce([{ currentBalance: '500.00' }])
        .mockResolvedValueOnce([{ currentBalance: '200.00' }])
        .mockResolvedValueOnce([
          { contactId: 'c1', currentBalance: '100.00', contact: { name: 'Alice' }, role: 'CUSTOMER' },
          { contactId: 'c2', currentBalance: '500.00', contact: { name: 'Bob' }, role: 'CUSTOMER' },
          { contactId: 'c3', currentBalance: '300.00', contact: { name: 'Charlie' }, role: 'CUSTOMER' },
        ])
        .mockResolvedValueOnce([{ contactId: 's1', currentBalance: '50.00', contact: { name: 'Sup1' }, role: 'SUPPLIER' }]);
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
      mockPrisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: 'c1', name: 'Alice', role: 'CUSTOMER', isActive: true, accounts: [{ role: 'CUSTOMER', currentBalance: '100.00', id: 'a1' }] },
        { id: 'c2', name: 'Bob', role: 'CUSTOMER', isActive: true, accounts: [{ role: 'CUSTOMER', currentBalance: '500.00', id: 'a2' }] },
        { id: 'c3', name: 'Charlie', role: 'CUSTOMER', isActive: true, accounts: [{ role: 'CUSTOMER', currentBalance: '300.00', id: 'a3' }] },
      ]);

      const result = await service.getDebtSummary();
      expect(result.topDebtors[0].contactName).toBe('Bob');
      expect(result.topDebtors[0].currentBalance).toBe('500.00');
      expect(result.topDebtors[1].contactName).toBe('Charlie');
      expect(result.topDebtors[2].contactName).toBe('Alice');
    });
  });

  describe('getSummary()', () => {
    it('includes salesCount and salesVolume', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]).mockResolvedValue([]);
      mockCashService.getCurrentBalance.mockResolvedValue({ currentBalance: '0.00' });
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
      mockPrisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([{ id: 't1', amount: '100.00' }, { id: 't2', amount: '200.00' }])
        .mockResolvedValueOnce([]);
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const result = await service.getSummary();
      expect(result.sales.salesCount).toBe(2);
      expect(result.sales.salesVolume).toBe('300.00');
    });
  });

  describe('getExpenseReport()', () => {
    it('delegates to ExpensesService and computes totalExpenses', async () => {
      mockExpensesService.getExpenseBreakdown.mockResolvedValue([
        { categoryId: 'c1', categoryName: 'إيجار', totalAmount: '300.00', percentage: '60.00' },
        { categoryId: 'c2', categoryName: 'كهرباء', totalAmount: '200.00', percentage: '40.00' },
      ]);
      const result = await service.getExpenseReport();
      expect(result.totalExpenses).toBe('500.00');
      expect(result.breakdown.length).toBe(2);
    });
  });
});
