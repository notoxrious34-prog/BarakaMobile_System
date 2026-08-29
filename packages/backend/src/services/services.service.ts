import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PricingType } from '@prisma/client';
import Decimal from 'decimal.js';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeFixedProfit(value: string): string {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private normalizeCommissionPct(value: string): string {
    return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
  }

  private validatePricing(dto: { pricingType?: PricingType; fixedProfit?: string | null; commissionPct?: string | null }) {
    const type = dto.pricingType;
    if (!type) return;

    if (type === PricingType.FIXED) {
      if (!dto.fixedProfit || dto.fixedProfit.trim() === '') {
        throw new BadRequestException('fixedProfit is required when pricingType is FIXED');
      }
      if (dto.commissionPct !== undefined && dto.commissionPct !== null && dto.commissionPct !== '') {
        throw new BadRequestException('commissionPct must be absent when pricingType is FIXED');
      }
      // fixedProfit regex already validated by DTO, but double-check format
      if (!/^\d+(\.\d{1,2})?$/.test(dto.fixedProfit)) {
        throw new BadRequestException('fixedProfit must match /^\\d+(\\.\\d{1,2})?$/');
      }
    }

    if (type === PricingType.COMMISSION) {
      if (!dto.commissionPct || dto.commissionPct.trim() === '') {
        throw new BadRequestException('commissionPct is required when pricingType is COMMISSION');
      }
      if (dto.fixedProfit !== undefined && dto.fixedProfit !== null && dto.fixedProfit !== '') {
        throw new BadRequestException('fixedProfit must be absent when pricingType is COMMISSION');
      }
      if (!/^\d+(\.\d{1,2})?$/.test(dto.commissionPct)) {
        throw new BadRequestException('commissionPct must match /^\\d+(\\.\\d{1,2})?$/');
      }
      const pct = new Decimal(dto.commissionPct);
      if (pct.lte(0) || pct.gt(100)) {
        throw new BadRequestException('commissionPct must be > 0 and <= 100');
      }
    }
  }

  private async verifySupplier(supplierId: string) {
    const supplier = await this.prisma.contact.findFirst({
      where: { id: supplierId, isActive: true },
    });
    if (!supplier) {
      throw new BadRequestException(`Supplier with id ${supplierId} not found or inactive`);
    }
    if (supplier.role !== 'SUPPLIER' && supplier.role !== 'BOTH') {
      throw new BadRequestException(`Contact ${supplierId} is not a supplier (role=${supplier.role})`);
    }
    return supplier;
  }

  private supplierSelect = {
    id: true,
    name: true,
    role: true,
  };

  async create(dto: CreateServiceDto) {
    this.validatePricing(dto);
    await this.verifySupplier(dto.supplierId);

    let fixedProfit: string | null = null;
    let commissionPct: string | null = null;

    if (dto.pricingType === PricingType.FIXED) {
      fixedProfit = this.normalizeFixedProfit(dto.fixedProfit!);
    } else if (dto.pricingType === PricingType.COMMISSION) {
      commissionPct = this.normalizeCommissionPct(dto.commissionPct!);
    }

    const service = await this.prisma.service.create({
      data: {
        name: dto.name,
        description: dto.description,
        supplierId: dto.supplierId,
        pricingType: dto.pricingType,
        fixedProfit,
        commissionPct,
      },
      include: {
        supplier: { select: this.supplierSelect },
      },
    });

    return service;
  }

  async findAll() {
    return this.prisma.service.findMany({
      where: { isActive: true },
      include: { supplier: { select: this.supplierSelect } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, isActive: true },
      include: { supplier: { select: this.supplierSelect } },
    });
    if (!service) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }
    return service;
  }

  async findBySupplier(supplierId: string) {
    return this.prisma.service.findMany({
      where: { supplierId, isActive: true },
      include: { supplier: { select: this.supplierSelect } },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateServiceDto) {
    if ((dto as any).supplierId !== undefined) {
      throw new BadRequestException('supplierId is immutable and cannot be updated');
    }

    const existing = await this.findOne(id);

    // Determine effective pricing values for validation
    const effectivePricingType = dto.pricingType ?? existing.pricingType;
    const effectiveFixedProfit =
      dto.fixedProfit !== undefined ? dto.fixedProfit : existing.fixedProfit;
    const effectiveCommissionPct =
      dto.commissionPct !== undefined ? dto.commissionPct : existing.commissionPct;

    // Only re-validate if pricing-related fields are touched
    if (
      dto.pricingType !== undefined ||
      dto.fixedProfit !== undefined ||
      dto.commissionPct !== undefined
    ) {
      this.validatePricing({
        pricingType: effectivePricingType,
        fixedProfit: effectiveFixedProfit,
        commissionPct: effectiveCommissionPct,
      });
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.pricingType !== undefined) data.pricingType = dto.pricingType;

    if (dto.fixedProfit !== undefined) {
      data.fixedProfit = dto.fixedProfit ? this.normalizeFixedProfit(dto.fixedProfit) : null;
    } else if (dto.pricingType !== undefined) {
      // pricingType changed, reset the non-applicable field to null based on effective type
      if (effectivePricingType === PricingType.FIXED && existing.fixedProfit === null) {
        // should not happen if validate passed, but keep existing which is null -> will have been set via dto
      }
      if (effectivePricingType === PricingType.FIXED) {
        // commission must be null
        if (dto.commissionPct === undefined) data.commissionPct = null;
      }
      if (effectivePricingType === PricingType.COMMISSION) {
        if (dto.fixedProfit === undefined) data.fixedProfit = null;
      }
    }

    if (dto.commissionPct !== undefined) {
      data.commissionPct = dto.commissionPct
        ? this.normalizeCommissionPct(dto.commissionPct)
        : null;
    }

    // Ensure when pricingType changes, the opposite field is nulled if not already handled
    if (dto.pricingType !== undefined) {
      if (dto.pricingType === PricingType.FIXED) {
        if (dto.commissionPct === undefined) data.commissionPct = null;
        if (dto.fixedProfit !== undefined) {
          data.fixedProfit = this.normalizeFixedProfit(dto.fixedProfit!);
        } else if (existing.pricingType === PricingType.COMMISSION) {
          // switching from COMMISSION to FIXED but no fixedProfit supplied — validate already threw
        }
      }
      if (dto.pricingType === PricingType.COMMISSION) {
        if (dto.fixedProfit === undefined) data.fixedProfit = null;
        if (dto.commissionPct !== undefined) {
          data.commissionPct = this.normalizeCommissionPct(dto.commissionPct!);
        }
      }
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data,
      include: { supplier: { select: this.supplierSelect } },
    });

    return updated;
  }

  async deactivate(id: string) {
    await this.findOne(id);
    const updated = await this.prisma.service.update({
      where: { id },
      data: { isActive: false },
      include: { supplier: { select: this.supplierSelect } },
    });
    return updated;
  }
}
