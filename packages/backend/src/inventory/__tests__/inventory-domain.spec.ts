import { InventoryDomainService } from '../inventory-domain.service';
import { AuditService } from '../../core/audit.service';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { Money } from '../../core/money';
import type { PrismaService } from '../../prisma/prisma.service';

/* ------------------------------------------------------------------ */
/* In-memory Prisma fake — the suite never touches a real database.    */
/* ------------------------------------------------------------------ */

function setup() {
  const items = new Map<string, any>();
  const movements: any[] = [];
  const auditRows: any[] = [];
  let itemSeq = 0;
  let clock = Date.now();

  const catalogItem = {
    create: jest.fn(async ({ data }: any) => {
      itemSeq += 1;
      const row = {
        id: `ci-${itemSeq}`,
        unit: 'piece',
        costPrice: '0.00',
        sellingPrice: '0.00',
        minStockLevel: 0,
        isSerialized: false,
        isActive: true,
        ...data,
      };
      items.set(row.id, row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => items.get(where.id) ?? null),
    findMany: jest.fn(async ({ where }: any = {}) => {
      let rows = [...items.values()];
      if (where?.isActive !== undefined) rows = rows.filter((r) => r.isActive === where.isActive);
      return rows;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = items.get(where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    }),
  };

  const inventoryMovement = {
    create: jest.fn(async ({ data }: any) => {
      clock += 1; // strictly increasing timestamps keep "latest" deterministic
      const row = { id: `im-${movements.length + 1}`, createdAt: new Date(clock), ...data };
      movements.push(row);
      return row;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const rows = movements.filter((m) => m.itemId === where.itemId);
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ?? null;
    }),
  };

  const auditLog = {
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `audit-${auditRows.length + 1}`, createdAt: new Date(), ...data };
      auditRows.push(row);
      return row;
    }),
  };

  const prisma: any = { catalogItem, inventoryMovement, auditLog };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const db = prisma as unknown as PrismaService;

  const audit = new AuditService(db);
  const orchestrator = new TransactionOrchestrator(db);
  const svc = new InventoryDomainService(db, orchestrator, audit);

  return { db, svc, items, movements, auditLog, auditRows };
}

async function stockItem(harness: ReturnType<typeof setup>, overrides: any = {}) {
  return harness.db.catalogItem.create({
    data: { sku: 'PHONE-X', name: 'Phone X', category: 'DEVICE', costPrice: '100.00', sellingPrice: '150.00', ...overrides },
  });
}

describe('stage 3.1 inventory domain (TASK BRIEF-011)', () => {
  it('receives stock and recomputes the moving average via Money', async () => {
    const h = setup();
    const item = await stockItem(h);
    expect(await h.svc.getAvailableStock(item.id)).toBe(0);

    const first = await h.svc.receiveStock({
      itemId: item.id,
      quantity: 10,
      unitCost: '120.00',
      referenceType: 'PURCHASE',
      referenceId: 'po-1',
      actorUserId: 'u-admin',
    });
    expect(first).toMatchObject({ movementType: 'IN', quantity: 10, unitCost: '120.00', totalCost: '1200.00', balanceAfterQty: 10 });
    // Empty stock → average equals incoming cost (prior costPrice ignored).
    expect((await h.db.catalogItem.findUnique({ where: { id: item.id } }))?.costPrice).toBe('120.00');

    const second = await h.svc.receiveStock({
      itemId: item.id,
      quantity: 10,
      unitCost: Money.from('100.00'),
      referenceType: 'PURCHASE',
      referenceId: 'po-2',
    });
    // (10×120 + 10×100) / 20 = 110.00
    expect(second.balanceAfterQty).toBe(20);
    expect(second.totalCost).toBe('1000.00');
    expect((await h.db.catalogItem.findUnique({ where: { id: item.id } }))?.costPrice).toBe('110.00');
    expect(await h.svc.getAvailableStock(item.id)).toBe(20);
    expect(h.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('issues stock at current average and blocks overdrafts', async () => {
    const h = setup();
    const item = await stockItem(h, { costPrice: '110.00' });
    await h.svc.receiveStock({ itemId: item.id, quantity: 20, unitCost: '110.00', referenceType: 'PURCHASE', referenceId: 'po-1' });

    const issue = await h.svc.issueStock({
      itemId: item.id,
      quantity: 5,
      referenceType: 'SALE',
      referenceId: 'inv-1',
      actorUserId: 'u-admin',
    });
    expect(issue).toMatchObject({ movementType: 'OUT', quantity: 5, unitCost: '110.00', totalCost: '550.00', balanceAfterQty: 15 });

    await expect(
      h.svc.issueStock({ itemId: item.id, quantity: 99, referenceType: 'SALE', referenceId: 'inv-2' }),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      message: expect.stringContaining('PHONE-X'),
    });
    // Failed issue leaves no movement behind.
    expect(h.movements).toHaveLength(2);
  });

  it('cycles repair WIP consume/return without corrupting stock or cost', async () => {
    const h = setup();
    const item = await stockItem(h, { sku: 'SCREEN-Y', costPrice: '40.00' });
    await h.svc.receiveStock({ itemId: item.id, quantity: 10, unitCost: '40.00', referenceType: 'PURCHASE', referenceId: 'po-1' });

    const consume = await h.svc.consumeForRepairWip({ itemId: item.id, quantity: 3, repairOrderId: 'rep-7' });
    expect(consume).toMatchObject({
      movementType: 'REPAIR_WIP_CONSUME',
      referenceType: 'REPAIR_WORK_ORDER',
      referenceId: 'rep-7',
      quantity: 3,
      balanceAfterQty: 7,
    });
    const returned = await h.svc.returnFromRepairWip({ itemId: item.id, quantity: 3, repairOrderId: 'rep-7' });
    expect(returned).toMatchObject({ movementType: 'REPAIR_WIP_RETURN', balanceAfterQty: 10 });
    // WIP round-trip never touches the moving average.
    expect((await h.db.catalogItem.findUnique({ where: { id: item.id } }))?.costPrice).toBe('40.00');
    expect(await h.svc.getAvailableStock(item.id)).toBe(10);
    await expect(
      h.svc.consumeForRepairWip({ itemId: item.id, quantity: 11, repairOrderId: 'rep-8' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('reconciles physical counts with discrepancy adjustments', async () => {
    const h = setup();
    const item = await stockItem(h, { costPrice: '110.00' });
    await h.svc.receiveStock({ itemId: item.id, quantity: 20, unitCost: '110.00', referenceType: 'PURCHASE', referenceId: 'po-1' });
    await h.svc.issueStock({ itemId: item.id, quantity: 5, referenceType: 'SALE', referenceId: 'inv-1' });

    const adj = await h.svc.adjustStock({
      itemId: item.id,
      countedQuantity: 12,
      reason: 'Cycle count shelf A',
      referenceId: 'count-1',
      actorUserId: 'u-admin',
    });
    expect(adj).toMatchObject({ movementType: 'ADJUSTMENT', quantity: 3, unitCost: '110.00', totalCost: '330.00', balanceAfterQty: 12 });

    // Zero discrepancy returns the latest movement untouched.
    const same = await h.svc.adjustStock({ itemId: item.id, countedQuantity: 12, reason: 'Recount', referenceId: 'count-2' });
    expect(same.id).toBe(adj.id);
    expect(h.movements).toHaveLength(3);

    // Fresh item with no history and a zero count gets a qty-0 marker.
    const fresh = await stockItem(h, { sku: 'FRESH-Z' });
    const marker = await h.svc.adjustStock({ itemId: fresh.id, countedQuantity: 0, reason: 'Opening', referenceId: 'count-3' });
    expect(marker).toMatchObject({ movementType: 'ADJUSTMENT', quantity: 0, totalCost: '0.00', balanceAfterQty: 0 });

    await expect(
      h.svc.adjustStock({ itemId: item.id, countedQuantity: -1, reason: 'Bad', referenceId: 'count-4' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('values inventory at exact 2dp strings, globally and per item', async () => {
    const h = setup();
    const a = await stockItem(h, { sku: 'A', costPrice: '110.00' });
    await h.svc.receiveStock({ itemId: a.id, quantity: 12, unitCost: '110.00', referenceType: 'PURCHASE', referenceId: 'po-1' });
    const b = await stockItem(h, { sku: 'B', costPrice: '0.00' });
    await h.svc.receiveStock({ itemId: b.id, quantity: 5, unitCost: '33.33', referenceType: 'PURCHASE', referenceId: 'po-2' });

    // 12×110.00 + 5×33.33 = 1320.00 + 166.65
    await expect(h.svc.calculateValuation()).resolves.toEqual({ totalQuantity: 17, totalValuation: '1486.65' });
    await expect(h.svc.calculateValuation(b.id)).resolves.toEqual({ totalQuantity: 5, totalValuation: '166.65' });
  });

  it('enforces item and quantity invariants', async () => {
    const h = setup();
    const item = await stockItem(h);
    await expect(
      h.svc.receiveStock({ itemId: 'missing', quantity: 1, unitCost: '10.00', referenceType: 'PURCHASE', referenceId: 'po-x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    for (const bad of [0, -3, 2.5]) {
      await expect(
        h.svc.receiveStock({ itemId: item.id, quantity: bad, unitCost: '10.00', referenceType: 'PURCHASE', referenceId: 'po-x' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    await expect(
      h.svc.receiveStock({ itemId: item.id, quantity: 1, unitCost: '-10.00', referenceType: 'PURCHASE', referenceId: 'po-x' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    h.items.get(item.id).isActive = false;
    await expect(
      h.svc.issueStock({ itemId: item.id, quantity: 1, referenceType: 'SALE', referenceId: 'inv-x' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
