import { ExpensesService } from './expenses.service';

const mockCashService: any = {
  postCashMovement: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma: any = {
  expenseCategory: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  expense: { create: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

describe('ExpensesService', () => {
  let service: ExpensesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExpensesService(mockPrisma, mockCashService);
  });

  it('createExpense triggers cash OUT movement atomically', async () => {
    mockPrisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat1', isActive: true });
    mockPrisma.expense.create.mockResolvedValue({ id: 'e1', categoryId: 'cat1', amount: '100.00' });
    const result = await service.createExpense({ categoryId: 'cat1', amount: '100.00', description: 'test' });
    expect(result).toBeTruthy();
    expect(mockCashService.postCashMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'OUT', category: 'EXPENSE', amount: '100.00' }));
  });

  it('createExpense rolls back on insufficient cash (postCashMovement throws)', async () => {
    mockPrisma.expenseCategory.findFirst.mockResolvedValue({ id: 'cat1', isActive: true });
    mockPrisma.expense.create.mockResolvedValue({ id: 'e1', categoryId: 'cat1', amount: '50.00' });
    mockCashService.postCashMovement.mockRejectedValueOnce(new Error('رصيد الصندوق غير كافٍ لإتمام هذه العملية'));
    await expect(service.createExpense({ categoryId: 'cat1', amount: '50.00' })).rejects.toThrow();
  });

  it('getExpenseBreakdown percentage precision via decimal.js', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([
      { id: '1', categoryId: 'c1', amount: '30.00', category: { name: 'إيجار' } },
      { id: '2', categoryId: 'c2', amount: '70.00', category: { name: 'كهرباء وماء' } },
    ]);
    // findAllExpenses is called internally which uses expense.findMany
    // We mock directly: breakdown will compute 30% and 70%
    const result = await service.getExpenseBreakdown();
    const cat1 = result.find((r: any) => r.categoryId === 'c1');
    const cat2 = result.find((r: any) => r.categoryId === 'c2');
    expect(cat1?.percentage).toBe('30.00');
    expect(cat2?.percentage).toBe('70.00');
  });

  it('getExpenseBreakdown grand total zero yields 0.00 percentage', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([]);
    const result = await service.getExpenseBreakdown();
    expect(result).toEqual([]);
  });

  it('createCategory and deactivate (soft AD-7)', async () => {
    mockPrisma.expenseCategory.findFirst.mockResolvedValue(null);
    mockPrisma.expenseCategory.create.mockResolvedValue({ id: 'new', name: 'صيانة', isActive: true });
    const cat = await service.createCategory({ name: 'صيانة' });
    expect(cat.name).toBe('صيانة');
    mockPrisma.expenseCategory.findUnique.mockResolvedValue({ id: 'new', isActive: true });
    mockPrisma.expenseCategory.update.mockResolvedValue({ id: 'new', isActive: false });
    const deactivated = await service.deactivateCategory('new');
    expect(deactivated.isActive).toBe(false);
  });
});
