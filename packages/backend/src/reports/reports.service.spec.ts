import { ReportsService } from './reports.service';
import Decimal from 'decimal.js';

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
} as any;

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
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
    } as any;
    service = new ReportsService(prismaMock);
  });

  describe('getCapital()', () => {
    it('computes decimal.js precision correctly: inventory + receivables - payables', async () => {
      mockPrisma.account.findMany
        .mockResolvedValueOnce([{ currentBalance: '1000.50', role: 'CUSTOMER', contact: { isActive: true } }])
        .mockResolvedValueOnce([{ currentBalance: '300.25', role: 'SUPPLIER', contact: { isActive: true } }]);
      mockPrisma.item.findMany.mockResolvedValue([
        { id: 'item1', costPrice: '10.10', isActive: true },
        { id: 'item2', costPrice: '5.05', isActive: true },
      ]);
      // mock computeStock: item1 stock 3, item2 stock 2
      mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
      mockPrisma.stockMovement.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 3 } })
        .mockResolvedValueOnce({ _sum: { quantity: 0 } })
        .mockResolvedValueOnce({ _sum: { quantity: 2 } })
        .mockResolvedValueOnce({ _sum: { quantity: 0 } });

      const result = await service.getCapital();
      // inventory = 10.10*3 + 5.05*2 = 30.30 + 10.10 = 40.40
      // netCapital = 1000.50 - 300.25 + 40.40 = 740.65
      expect(result.inventoryValue).toBe('40.40');
      expect(result.totalReceivables).toBe('1000.50');
      expect(result.totalPayables).toBe('300.25');
      expect(result.netCapital).toBe('740.65');
    });

    it('returns 0.00 values when no data', async () => {
      mockPrisma.account.findMany.mockResolvedValue([]).mockResolvedValue([]);
      mockPrisma.item.findMany.mockResolvedValue([]);
      const result = await service.getCapital();
      expect(result.totalReceivables).toBe('0.00');
      expect(result.totalPayables).toBe('0.00');
      expect(result.inventoryValue).toBe('0.00');
      expect(result.netCapital).toBe('0.00');
    });
  });

  describe('getNetProfit() — AD-22 historical unitCost', () => {
    it('uses TransactionItem.unitCost (historical) NOT Item.costPrice (live) for profit', async () => {
      // Setup: sale transaction 100.00, item profit should be (80.00 - 50.00)*2 = 60.00 even though Item.costPrice is now 800.00
      const saleTx = { id: 'tx1', type: 'SALE', amount: '160.00', createdAt: new Date('2026-08-15T10:00:00Z') };
      mockPrisma.transaction.findMany.mockResolvedValue([saleTx]);
      // transactionItem with historical unitCost 50.00, unitPrice 80.00, quantity 2
      mockPrisma.transactionItem.findMany.mockResolvedValue([
        { id: 'ti1', transactionId: 'tx1', itemId: 'item1', quantity: 2, unitPrice: '80.00', unitCost: '50.00', totalPrice: '160.00' },
      ]);
      // transactionService no service profit
      mockPrisma.transactionService.findMany.mockResolvedValue([]);

      const result = await service.getNetProfit();

      // itemProfit = (80-50)*2 = 60.00, grossProfit = 60.00, revenue 160.00, margin = 60/160*100 = 37.50
      expect(result.itemProfit).toBe('60.00');
      expect(result.grossProfit).toBe('60.00');
      expect(result.totalRevenue).toBe('160.00');
      expect(result.grossMarginPct).toBe('37.50');
      // totalCost = unitCost * qty = 50*2 = 100.00
      expect(result.totalCost).toBe('100.00');
    });

    it('returns 0.00 margin when revenue is zero', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([]);
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      const result = await service.getNetProfit();
      expect(result.grossMarginPct).toBe('0.00');
      expect(result.totalRevenue).toBe('0.00');
    });

    it('filters by date range when startDate/endDate provided', async () => {
      const saleInRange = { id: 'tx1', type: 'SALE', amount: '100.00', createdAt: new Date('2026-08-15T10:00:00Z') };
      // Only return tx in range
      mockPrisma.transaction.findMany.mockResolvedValue([saleInRange]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([
        { id: 'ti1', transactionId: 'tx1', itemId: 'item1', quantity: 1, unitPrice: '100.00', unitCost: '40.00', totalPrice: '100.00' },
      ]);
      mockPrisma.transactionService.findMany.mockResolvedValue([]);

      const result = await service.getNetProfit('2026-08-15', '2026-08-15');
      expect(result.totalRevenue).toBe('100.00');
      expect(result.itemProfit).toBe('60.00');
    });
  });

  describe('getDebtSummary()', () => {
    it('sorts topDebtors descending by balance', async () => {
      // Mock capital
      mockPrisma.account.findMany
        .mockResolvedValueOnce([{ currentBalance: '500.00' }]) // CUSTOMER for capital receivables
        .mockResolvedValueOnce([{ currentBalance: '200.00' }]) // SUPPLIER for payables
        .mockResolvedValueOnce([
          { contactId: 'c1', currentBalance: '100.00', contact: { name: 'Alice' }, role: 'CUSTOMER' },
          { contactId: 'c2', currentBalance: '500.00', contact: { name: 'Bob' }, role: 'CUSTOMER' },
          { contactId: 'c3', currentBalance: '300.00', contact: { name: 'Charlie' }, role: 'CUSTOMER' },
        ])
        .mockResolvedValueOnce([
          { contactId: 's1', currentBalance: '50.00', contact: { name: 'Sup1' }, role: 'SUPPLIER' },
        ]);
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
      mockPrisma.item.findMany.mockResolvedValue([]);
      mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
      mockPrisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      mockPrisma.transactionService.findMany.mockResolvedValue([]);
      mockPrisma.transactionItem.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([{ id: 't1', amount: '100.00' }, { id: 't2', amount: '200.00' }]) // salesInRange
        .mockResolvedValueOnce([]); // recentRaw
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.setting.findUnique.mockResolvedValue(null);

      const result = await service.getSummary();
      expect(result.salesCount).toBe(2);
      expect(result.salesVolume).toBe('300.00');
    });
  });
});
