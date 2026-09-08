import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MovementType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { ScanStockCountDto } from './dto/scan-stock-count.dto';

type PrismaTx = Prisma.TransactionClient;

function to2dp(v: string | number | Decimal): string {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function daySuffix(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

@Injectable()
export class StockCountService {
  constructor(private readonly prisma: PrismaService) {}

  // Mirrors InventoryService stock semantics: last ADJUSTMENT sets base, then +IN −OUT after it.
  private async computeStock(itemId: string, tx?: PrismaTx): Promise<number> {
    const client: PrismaTx | PrismaService = tx ?? this.prisma;
    const lastAdj = await (client as any).stockMovement.findFirst({
      where: { itemId, type: MovementType.ADJUSTMENT },
      orderBy: { createdAt: 'desc' },
    });
    const baseDate: Date | null = lastAdj ? lastAdj.createdAt : null;
    const baseQty: number = lastAdj ? lastAdj.quantity : 0;
    const inAgg = await (client as any).stockMovement.aggregate({
      where: { itemId, type: MovementType.IN, ...(baseDate ? { createdAt: { gt: baseDate } } : {}) },
      _sum: { quantity: true },
    });
    const outAgg = await (client as any).stockMovement.aggregate({
      where: { itemId, type: MovementType.OUT, ...(baseDate ? { createdAt: { gt: baseDate } } : {}) },
      _sum: { quantity: true },
    });
    return baseQty + (inAgg._sum.quantity ?? 0) - (outAgg._sum.quantity ?? 0);
  }

  private normalizePrice(value: string | undefined): string {
    try {
      return to2dp(value ?? '0.00');
    } catch {
      return '0.00';
    }
  }

  async createSession(dto: CreateStockCountDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('name must not be empty');
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.item.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

      // Unique session number with retry on collision.
      let sessionNumber = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = `STK-${daySuffix()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
        const existing = await tx.stockCountSession.findUnique({ where: { sessionNumber: candidate } });
        if (!existing) {
          sessionNumber = candidate;
          break;
        }
      }
      if (!sessionNumber) throw new BadRequestException('Failed to generate unique session number');

      const session = await tx.stockCountSession.create({
        data: {
          sessionNumber,
          name,
          status: 'IN_PROGRESS',
          scope: 'FULL_STORE',
          notes: dto.notes?.trim() || null,
          totalItemsExpected: items.length,
        },
      });

      for (const item of items) {
        const expected = await this.computeStock(item.id, tx);
        const unitCost = this.normalizePrice(item.costPrice);
        const diff = 0 - expected;
        const variance = to2dp(new Decimal(diff).mul(new Decimal(unitCost)));
        await tx.stockCountItem.create({
          data: {
            sessionId: session.id,
            inventoryItemId: item.id,
            expectedQuantity: expected,
            countedQuantity: 0,
            differenceQuantity: diff,
            unitCost,
            varianceValue: variance,
          },
        });
      }

      const count = await tx.stockCountItem.count({ where: { sessionId: session.id } });
      return tx.stockCountSession.findUnique({
        where: { id: session.id },
        include: { _count: { select: { items: true } } },
      }).then((s) => ({ ...s, snapshotItems: count }));
    });
  }

  async listSessions() {
    return this.prisma.stockCountSession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
  }

  async getSession(id: string) {
    const session = await this.prisma.stockCountSession.findUnique({
      where: { id },
      include: {
        items: {
          include: { inventoryItem: { select: { id: true, name: true, sku: true, unit: true } } },
          orderBy: { varianceValue: 'asc' },
        },
      },
    });
    if (!session) throw new NotFoundException(`StockCountSession ${id} not found`);
    return session;
  }

  private ensureOpen(status: string) {
    if (status !== 'IN_PROGRESS' && status !== 'DRAFT') {
      throw new BadRequestException(`Session is ${status} and no longer editable`);
    }
  }

  async scan(id: string, dto: ScanStockCountDto) {
    const session = await this.prisma.stockCountSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`StockCountSession ${id} not found`);
    this.ensureOpen(session.status);

    if (!dto.sku && !dto.inventoryItemId) {
      throw new BadRequestException('Provide sku or inventoryItemId');
    }
    if (dto.quantityDelta === undefined && dto.exactQuantity === undefined) {
      throw new BadRequestException('Provide quantityDelta or exactQuantity');
    }

    let itemId = dto.inventoryItemId;
    if (!itemId && dto.sku) {
      const item = await this.prisma.item.findUnique({ where: { sku: dto.sku.trim() } });
      if (!item) throw new NotFoundException(`No item with sku ${dto.sku}`);
      itemId = item.id;
    }

    const row = await this.prisma.stockCountItem.findUnique({
      where: { sessionId_inventoryItemId: { sessionId: id, inventoryItemId: itemId! } },
    });
    if (!row) throw new NotFoundException('Item is not part of this count session');

    let counted: number;
    if (dto.exactQuantity !== undefined) {
      counted = dto.exactQuantity;
    } else {
      counted = row.countedQuantity + (dto.quantityDelta ?? 0);
    }
    if (!Number.isInteger(counted) || counted < 0) {
      throw new BadRequestException('Resulting counted quantity must be an integer >= 0');
    }

    const diff = counted - row.expectedQuantity;
    const variance = to2dp(new Decimal(diff).mul(new Decimal(row.unitCost)));

    return this.prisma.stockCountItem.update({
      where: { id: row.id },
      data: { countedQuantity: counted, differenceQuantity: diff, varianceValue: variance },
      include: { inventoryItem: { select: { id: true, name: true, sku: true } } },
    });
  }

  async reconcile(id: string) {
    const session = await this.prisma.stockCountSession.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!session) throw new NotFoundException(`StockCountSession ${id} not found`);
    this.ensureOpen(session.status);

    return this.prisma.$transaction(async (tx) => {
      let discrepancy = 0;
      let financial = new Decimal(0);
      let countedItems = 0;

      for (const row of session.items) {
        if (row.countedQuantity > 0) countedItems++;
        discrepancy += row.differenceQuantity;
        financial = financial.plus(new Decimal(row.varianceValue));
        if (row.differenceQuantity !== 0) {
          // ADJUSTMENT sets the base stock level per computeStock semantics.
          await tx.stockMovement.create({
            data: {
              itemId: row.inventoryItemId,
              type: MovementType.ADJUSTMENT,
              quantity: row.countedQuantity,
              note: `تسوية جرد دوري رقم: ${session.sessionNumber}`,
              reference: session.sessionNumber,
            },
          });
        }
        await tx.stockCountItem.update({
          where: { id: row.id },
          data: { reconciled: true },
        });
      }

      return tx.stockCountSession.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          totalItemsCounted: countedItems,
          totalDiscrepancyQty: discrepancy,
          totalFinancialVariance: to2dp(financial),
        },
        include: { _count: { select: { items: true } } },
      });
    });
  }

  async cancel(id: string) {
    const session = await this.prisma.stockCountSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException(`StockCountSession ${id} not found`);
    this.ensureOpen(session.status);
    return this.prisma.stockCountSession.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }
}
