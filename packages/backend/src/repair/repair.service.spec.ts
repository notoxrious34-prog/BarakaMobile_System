import { RepairService } from './repair.service';
import Decimal from 'decimal.js';

const mockCashService: any = {
  postCashMovement: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma: any = {
  contact: { findUnique: jest.fn() },
  account: { findFirst: jest.fn(), update: jest.fn() },
  setting: { findUnique: jest.fn(), upsert: jest.fn() },
  repairTicket: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  ledgerEntry: { create: jest.fn() },
  $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
};

describe('RepairService', () => {
  let service: RepairService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCashService.postCashMovement.mockResolvedValue(undefined);
    mockPrisma.$transaction = jest.fn(async (cb: any) => cb(mockPrisma));
    service = new RepairService(mockPrisma, mockCashService);
  });

  it('createTicket with deposit > 0 posts CashMovement IN and no ledger/account writes', async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({ id: 'c1', accounts: [{ id: 'a1', role: 'CUSTOMER', currentBalance: '100.00' }] });
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'a1', role: 'CUSTOMER', currentBalance: '100.00' });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: '1' });
    mockPrisma.setting.upsert.mockResolvedValue({ key: 'repair_sequence_next', value: '2' });
    mockPrisma.repairTicket.create.mockResolvedValue({ id: 'r1', ticketNumber: 'REP-000001', depositAmount: '50.00' });
    mockPrisma.repairTicket.findUnique.mockResolvedValue({ id: 'r1', ticketNumber: 'REP-000001', depositAmount: '50.00', depositPaid: true });
    mockPrisma.ledgerEntry.create.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});

    const result = await service.createTicket({
      contactId: 'c1',
      deviceType: 'PHONE',
      deviceBrand: 'Samsung',
      deviceModel: 'A10',
      problemDescription: 'Screen broken',
      estimatedCost: '200.00',
      depositAmount: '50.00',
    });

    expect(mockCashService.postCashMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'IN', category: 'SALE_PAYMENT', amount: '50.00' }));
    expect(mockPrisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(mockPrisma.account.update).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('createTicket with deposit = 0 posts no CashMovement', async () => {
    mockPrisma.contact.findUnique.mockResolvedValue({ id: 'c1', accounts: [{ id: 'a1', role: 'CUSTOMER', currentBalance: '0.00' }] });
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'a1', role: 'CUSTOMER', currentBalance: '0.00' });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: '2' });
    mockPrisma.setting.upsert.mockResolvedValue({ value: '3' });
    mockPrisma.repairTicket.create.mockResolvedValue({ id: 'r2', ticketNumber: 'REP-000002' });
    mockPrisma.repairTicket.findUnique.mockResolvedValue({ id: 'r2', ticketNumber: 'REP-000002' });

    await service.createTicket({
      contactId: 'c1',
      deviceType: 'PHONE',
      deviceBrand: 'Samsung',
      deviceModel: 'A10',
      problemDescription: 'Battery',
      depositAmount: '0.00',
    });

    expect(mockCashService.postCashMovement).not.toHaveBeenCalled();
    expect(mockPrisma.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('updateStatus to DELIVERED generates invoiceNumber and posts CashMovement IN for remaining', async () => {
    mockPrisma.repairTicket.findFirst.mockResolvedValue({ id: 'r1', status: 'READY', depositAmount: '50.00', depositPaid: true, contactId: 'c1', ticketNumber: 'REP-000001', repairType: 'INTERNAL', externalCost: '0.00' });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: '5' });
    mockPrisma.setting.upsert.mockResolvedValue({ value: '6' });
    mockPrisma.repairTicket.update.mockResolvedValue({ id: 'r1', status: 'DELIVERED' });
    mockPrisma.repairTicket.findUnique.mockResolvedValue({ id: 'r1', status: 'DELIVERED', invoiceNumber: 'REP-000005' });

    const result = await service.updateStatus('r1', { status: 'DELIVERED', actualCost: '200.00' });

    expect(mockCashService.postCashMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'IN', category: 'SALE_PAYMENT', amount: '150.00' }));
    expect(mockPrisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(mockPrisma.account.update).not.toHaveBeenCalled();
    expect(mockPrisma.repairTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ invoiceNumber: 'REP-000005' }) }));
    expect((result as any).invoiceNumber).toBe('REP-000005');
  });

  it('updateStatus to DELIVERED when actualCost <= depositAmount posts no CashMovement', async () => {
    mockPrisma.repairTicket.findFirst.mockResolvedValue({ id: 'r1', status: 'READY', depositAmount: '100.00', depositPaid: true, contactId: 'c1', ticketNumber: 'REP-000003', repairType: 'INTERNAL', externalCost: '0.00' });
    mockPrisma.setting.findUnique.mockResolvedValue({ value: '7' });
    mockPrisma.setting.upsert.mockResolvedValue({ value: '8' });
    mockPrisma.repairTicket.update.mockResolvedValue({ id: 'r1', status: 'DELIVERED' });
    mockPrisma.repairTicket.findUnique.mockResolvedValue({ id: 'r1', status: 'DELIVERED', invoiceNumber: 'REP-000007' });

    await service.updateStatus('r1', { status: 'DELIVERED', actualCost: '80.00' });

    expect(mockCashService.postCashMovement).not.toHaveBeenCalled();
  });

  it('updateStatus to CANCELLED with deposit refunds via CashMovement OUT ADJUSTMENT', async () => {
    mockPrisma.repairTicket.findFirst.mockResolvedValue({ id: 'r1', status: 'RECEIVED', depositAmount: '40.00', depositPaid: true, contactId: 'c1', ticketNumber: 'REP-000001', repairType: 'INTERNAL' });
    mockPrisma.ledgerEntry.create.mockResolvedValue({});
    mockPrisma.account.update.mockResolvedValue({});
    mockPrisma.repairTicket.update.mockResolvedValue({ id: 'r1', status: 'CANCELLED' });
    mockPrisma.repairTicket.findUnique.mockResolvedValue({ id: 'r1', status: 'CANCELLED' });

    await service.updateStatus('r1', { status: 'CANCELLED' });

    expect(mockCashService.postCashMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'OUT', category: 'ADJUSTMENT', amount: '40.00' }));
    expect(mockPrisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(mockPrisma.account.update).not.toHaveBeenCalled();
  });

  it('recordExternalCost posts CashMovement OUT PURCHASE_PAYMENT', async () => {
    mockPrisma.repairTicket.findFirst.mockResolvedValue({ id: 'r1', status: 'IN_REPAIR', repairType: 'EXTERNAL', ticketNumber: 'REP-000001', externalCost: '10.00' });
    mockPrisma.repairTicket.update.mockResolvedValue({ id: 'r1', externalCost: '60.00' });
    mockPrisma.repairTicket.findUnique.mockResolvedValue({ id: 'r1', externalCost: '60.00' });

    await service.recordExternalCost('r1', { externalCost: '50.00' });

    expect(mockCashService.postCashMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'OUT', category: 'PURCHASE_PAYMENT', amount: '50.00' }));
    expect(mockPrisma.repairTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ externalCost: '60.00' }) }));
  });

  it('updateStatus on terminal ticket throws BadRequestException', async () => {
    mockPrisma.repairTicket.findFirst.mockResolvedValue({ id: 'r1', status: 'DELIVERED', depositAmount: '0.00', depositPaid: false });

    await expect(service.updateStatus('r1', { status: 'READY' })).rejects.toThrow('Cannot change status of terminal ticket');
  });
});
