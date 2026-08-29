import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { MovementType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePrice(value: string | undefined): string {
    const raw = value ?? '0.00';
    return new Decimal(raw).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  // Computes stock per spec: last ADJUSTMENT sets base, then +IN -OUT after it
  private async computeStock(itemId: string, tx?: PrismaTx): Promise<number> {
    const client: PrismaTx | PrismaService = tx ?? this.prisma;

    const lastAdj = await (client as any).stockMovement.findFirst({
      where: { itemId, type: MovementType.ADJUSTMENT },
      orderBy: { createdAt: 'desc' },
    });

    const baseDate: Date | null = lastAdj ? lastAdj.createdAt : null;
    const baseQty = lastAdj ? lastAdj.quantity : 0;

    const inAfterAgg = await (client as any).stockMovement.aggregate({
      where: {
        itemId,
        type: MovementType.IN,
        ...(baseDate ? { createdAt: { gt: baseDate } } : {}),
      },
      _sum: { quantity: true },
    });

    const outAfterAgg = await (client as any).stockMovement.aggregate({
      where: {
        itemId,
        type: MovementType.OUT,
        ...(baseDate ? { createdAt: { gt: baseDate } } : {}),
      },
      _sum: { quantity: true },
    });

    const inAfter = inAfterAgg._sum.quantity ?? 0;
    const outAfter = outAfterAgg._sum.quantity ?? 0;

    return baseQty + inAfter - outAfter;
  }

  private async getItemWithStock(itemId: string, tx?: PrismaTx) {
    const client: PrismaTx | PrismaService = tx ?? this.prisma;
    const item = await (client as any).item.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item with id ${itemId} not found`);
    const currentStock = await this.computeStock(itemId, tx as PrismaTx);
    return { ...item, currentStock };
  }

  async createItem(dto: CreateItemDto) {
    if (dto.initialStock !== undefined && dto.initialStock! < 0) {
      throw new BadRequestException('initialStock must be >= 0');
    }
    return this.prisma.$transaction(async (tx) => {
      const costPrice = this.normalizePrice(dto.costPrice);
      const sellingPrice = this.normalizePrice(dto.sellingPrice);

      const item = await tx.item.create({
        data: {
          name: dto.name,
          description: dto.description,
          sku: dto.sku,
          unit: dto.unit ?? 'piece',
          costPrice,
          sellingPrice,
          minStock: dto.minStock ?? 0,
        },
      });

      if (dto.initialStock !== undefined && dto.initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            itemId: item.id,
            type: MovementType.IN,
            quantity: dto.initialStock,
            note: 'Initial stock',
          },
        });
      }

      const currentStock = await this.computeStock(item.id, tx);
      return { ...item, currentStock };
    });
  }

  async findAllItems() {
    const items = await this.prisma.item.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const withStock = await Promise.all(
      items.map(async (item) => {
        const currentStock = await this.computeStock(item.id);
        return { ...item, currentStock };
      }),
    );
    return withStock;
  }

  async findOneItem(id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, isActive: true },
    });
    if (!item) {
      throw new NotFoundException(`Item with id ${id} not found`);
    }
    const currentStock = await this.computeStock(id);
    return { ...item, currentStock };
  }

  async updateItem(id: string, dto: UpdateItemDto) {
    if ((dto as any).initialStock !== undefined) {
      throw new BadRequestException('initialStock is immutable and cannot be updated');
    }

    await this.findOneItem(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.costPrice !== undefined) data.costPrice = this.normalizePrice(dto.costPrice);
    if (dto.sellingPrice !== undefined) data.sellingPrice = this.normalizePrice(dto.sellingPrice);
    if (dto.minStock !== undefined) data.minStock = dto.minStock;

    const updated = await this.prisma.item.update({
      where: { id },
      data,
    });

    const currentStock = await this.computeStock(id);
    return { ...updated, currentStock };
  }

  async deactivateItem(id: string) {
    await this.findOneItem(id);
    const updated = await this.prisma.item.update({
      where: { id },
      data: { isActive: false },
    });
    const currentStock = await this.computeStock(id);
    return { ...updated, currentStock };
  }

  async addMovement(dto: CreateStockMovementDto) {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.item.findFirst({
        where: { id: dto.itemId, isActive: true },
      });
      if (!item) {
        throw new NotFoundException(`Item with id ${dto.itemId} not found`);
      }

      if (dto.type === MovementType.ADJUSTMENT) {
        if (!dto.note || dto.note.trim() === '') {
          throw new BadRequestException('note is required for ADJUSTMENT movements');
        }
      }

      if (dto.type === MovementType.OUT) {
        const currentStock = await this.computeStock(dto.itemId, tx);
        if (currentStock < dto.quantity) {
          throw new BadRequestException(
            `Insufficient stock: available ${currentStock}, requested ${dto.quantity}`,
          );
        }
      }

      const movement = await tx.stockMovement.create({
        data: {
          itemId: dto.itemId,
          type: dto.type,
          quantity: dto.quantity,
          note: dto.note,
          reference: dto.reference,
        },
        include: { item: true },
      });

      return movement;
    });
  }

  async findMovementsByItem(itemId: string) {
    // Verify item exists (optional, but we return empty if not)
    const movements = await this.prisma.stockMovement.findMany({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
    });
    return movements;
  }
}
