import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { CashService } from '../cash/cash.service';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class RepairService {
  constructor(private readonly prisma: PrismaService, private readonly cashService: CashService) {}

  private normalizeAmount(value: string): string {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private to2dp(v: string | Decimal): string {
    return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private getAlgeriaStartOfDay(now: Date): Date {
    const ms = now.getTime() + 60 * 60 * 1000;
    const d = new Date(ms);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0) - 60 * 60 * 1000);
  }

  private getAlgeriaEndOfDay(now: Date): Date {
    const s = this.getAlgeriaStartOfDay(now);
    return new Date(s.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  // Live stock per inventory semantics: last ADJUSTMENT sets base, then +IN −OUT after it.
  private async computeStock(itemId: string, tx: PrismaTx): Promise<number> {
    const lastAdj = await tx.stockMovement.findFirst({
      where: { itemId, type: 'ADJUSTMENT' },
      orderBy: { createdAt: 'desc' },
    });
    const baseDate: Date | null = lastAdj ? lastAdj.createdAt : null;
    const baseQty: number = lastAdj ? lastAdj.quantity : 0;
    const inAgg = await tx.stockMovement.aggregate({
      where: { itemId, type: 'IN', ...(baseDate ? { createdAt: { gt: baseDate } } : {}) },
      _sum: { quantity: true },
    });
    const outAgg = await tx.stockMovement.aggregate({
      where: { itemId, type: 'OUT', ...(baseDate ? { createdAt: { gt: baseDate } } : {}) },
      _sum: { quantity: true },
    });
    return baseQty + (inAgg._sum.quantity ?? 0) - (outAgg._sum.quantity ?? 0);
  }

  private ticketTotals(parts: { totalCost: string; totalPrice: string }[], laborCost: string, discountAmount: string) {
    let partsCost = new Decimal(0);
    let partsTotal = new Decimal(0);
    for (const p of parts) {
      partsCost = partsCost.plus(new Decimal(p.totalCost));
      partsTotal = partsTotal.plus(new Decimal(p.totalPrice));
    }
    const labor = new Decimal(laborCost);
    const discount = new Decimal(discountAmount);
    if (labor.lt(0) || discount.lt(0)) throw new BadRequestException('laborCost and discountAmount must be >= 0');
    if (discount.gt(partsTotal.plus(labor))) throw new BadRequestException('الخصم يتجاوز الإجمالي المستحق');
    const total = partsTotal.plus(labor).minus(discount);
    return { partsCost: this.to2dp(partsCost), partsTotal: this.to2dp(partsTotal), totalAmount: this.to2dp(total) };
  }

  private async recalcTicket(tx: PrismaTx, ticketId: string) {
    const ticket = await tx.repairTicket.findUnique({ where: { id: ticketId }, include: { parts: { where: { isActive: true } } } });
    if (!ticket) throw new NotFoundException(`RepairTicket with id ${ticketId} not found`);
    const t = this.ticketTotals(ticket.parts, ticket.laborCost ?? '0.00', ticket.discountAmount ?? '0.00');
    return tx.repairTicket.update({ where: { id: ticketId }, data: t });
  }

  async createTicket(dto: any, operatorId?: string) {
    const estimatedCost = this.normalizeAmount(dto.estimatedCost ?? '0.00');
    const depositAmount = this.normalizeAmount(dto.depositAmount ?? '0.00');
    if (new Decimal(estimatedCost).lt(0)) {
      throw new BadRequestException('estimatedCost must be >= 0');
    }
    if (new Decimal(depositAmount).lt(0)) {
      throw new BadRequestException('depositAmount must be >= 0');
    }
    const repairType = dto.repairType ?? 'INTERNAL';
    if (repairType !== 'INTERNAL' && repairType !== 'EXTERNAL') {
      throw new BadRequestException('repairType must be INTERNAL or EXTERNAL');
    }
    const deviceType = dto.deviceType;
    const validDeviceTypes = ['PHONE', 'TABLET', 'LAPTOP', 'OTHER'];
    if (!validDeviceTypes.includes(deviceType)) {
      throw new BadRequestException('deviceType invalid');
    }

    const depositDec = new Decimal(depositAmount);
    const needsAccount = depositDec.gt(0);

    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const contact = await tx.contact.findUnique({
        where: { id: dto.contactId },
        include: { accounts: true },
      });
      if (!contact) {
        throw new NotFoundException(`Contact with id ${dto.contactId} not found`);
      }
      if (needsAccount) {
        const account = await tx.account.findFirst({ where: { contactId: dto.contactId, role: 'CUSTOMER' } });
        if (!account) throw new BadRequestException('Contact must have CUSTOMER account');
      }

      const seqSetting = await tx.setting.findUnique({ where: { key: 'repair_sequence_next' } });
      const currentSeqStr: string = seqSetting?.value ?? '1';
      const currentSeq = Number.parseInt(currentSeqStr, 10);
      const seq = Number.isNaN(currentSeq) || currentSeq < 1 ? 1 : currentSeq;
      const ticketNumber = `REP-${String(seq).padStart(6, '0')}`;
      await tx.setting.upsert({
        where: { key: 'repair_sequence_next' },
        update: { value: String(seq + 1) },
        create: { key: 'repair_sequence_next', value: String(seq + 1) },
      });

      // SLA auto-computation (TB-126): fault type default days from creation moment,
      // unless the technician explicitly sets an estimated date.
      let repairFaultTypeId: string | null = null;
      let estimatedCompletionDate: Date | null = null;
      if (dto.repairFaultTypeId) {
        const faultType = await tx.repairFaultTypeSLA.findUnique({ where: { id: dto.repairFaultTypeId } });
        if (!faultType || !faultType.isActive) {
          throw new BadRequestException('نوع العطل غير موجود أو موقوف');
        }
        repairFaultTypeId = faultType.id;
        estimatedCompletionDate = new Date(Date.now() + faultType.defaultDays * 86_400_000);
      }
      if (dto.estimatedCompletionDate) {
        const explicit = new Date(dto.estimatedCompletionDate);
        if (Number.isNaN(explicit.getTime())) throw new BadRequestException('estimatedCompletionDate must be a valid ISO date');
        estimatedCompletionDate = explicit;
      }

      const ticket = await tx.repairTicket.create({
        data: {
          ticketNumber,
          contactId: dto.contactId,
          deviceType,
          deviceBrand: dto.deviceBrand,
          deviceModel: dto.deviceModel,
          problemDescription: dto.problemDescription,
          status: 'RECEIVED',
          repairFaultTypeId,
          estimatedCompletionDate,
          repairType,
          technicianName: dto.technicianName,
          estimatedCost,
          actualCost: '0.00',
          externalCost: '0.00',
          depositAmount,
          depositPaid: depositDec.gt(0),
          operatorId: operatorId ?? null,
          notes: dto.notes ?? null,
          physicalCondition: dto.physicalCondition ?? null,
          hasPasscode: dto.hasPasscode ?? false,
          accessories: dto.accessories ?? null,
        },
      });

      if (depositDec.gt(0)) {
        await this.cashService.postCashMovement(tx, {
          type: 'IN',
          category: 'REPAIR_PAYMENT',
          amount: depositAmount,
          note: `عربون صيانة: ${ticketNumber}`,
          operatorId: operatorId ?? undefined,
        });
      }

      return tx.repairTicket.findUnique({ where: { id: ticket.id }, include: { contact: true, parts: { where: { isActive: true } } } });
    });
  }

  /**
   * TASK-BRIEF-002 Ruling 3: SOLE posting path for every RepairPartItem
   * stock movement (consumption on add, reversal on remove/cancel/soft-
   * delete). Consolidates 3 pre-existing inline `tx.stockMovement.create`
   * call sites (addPart/removePart/cancel) that were themselves a DRY
   * violation before this change — zero behavioral change to any of them.
   */
  private async postRepairPartStockMovement(
    tx: PrismaTx,
    params: { itemId: string; type: 'IN' | 'OUT'; quantity: number; note: string; reference: string },
  ) {
    return tx.stockMovement.create({
      data: {
        itemId: params.itemId,
        type: params.type,
        quantity: params.quantity,
        note: params.note,
        reference: params.reference,
      },
    });
  }

  private ensurePartsEditable(status: string) {
    if (status === 'DELIVERED' || status === 'CANCELLED') {
      throw new BadRequestException('لا يمكن تعديل قطع غيار تذكرة منتهية (تسليم/إلغاء)');
    }
  }

  async addPart(ticketId: string, dto: { inventoryItemId: string; quantity: number; unitPrice?: string }) {
    const qty = dto.quantity;
    if (!Number.isInteger(qty) || qty < 1) throw new BadRequestException('quantity must be an integer >= 1');
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const ticket = await tx.repairTicket.findFirst({ where: { id: ticketId, isActive: true } });
      if (!ticket) throw new NotFoundException(`RepairTicket with id ${ticketId} not found`);
      this.ensurePartsEditable(ticket.status);

      const item = await tx.item.findFirst({ where: { id: dto.inventoryItemId, isActive: true } });
      if (!item) throw new NotFoundException('الصنف غير موجود أو موقوف');
      const available = await this.computeStock(item.id, tx);
      if (available < qty) {
        throw new BadRequestException(`المخزون غير كافٍ لقطعة الغيار: ${item.name} (المتاح ${available})`);
      }

      let unitPrice = this.normalizeAmount(dto.unitPrice ?? item.sellingPrice ?? '0.00');
      if (new Decimal(unitPrice).lt(0)) throw new BadRequestException('unitPrice must be >= 0');
      const unitCostPrice = this.normalizeAmount(item.costPrice ?? '0.00');
      const totalCost = this.to2dp(new Decimal(qty).mul(new Decimal(unitCostPrice)));
      const totalPrice = this.to2dp(new Decimal(qty).mul(new Decimal(unitPrice)));

      const movement = await this.postRepairPartStockMovement(tx, {
        itemId: item.id,
        type: 'OUT',
        quantity: qty,
        note: `REPAIR_CONSUMPTION: استهلاك صيانة للتذكرة ${ticket.ticketNumber}`,
        reference: ticket.ticketNumber,
      });

      await tx.repairPartItem.create({
        data: {
          ticketId: ticket.id,
          inventoryItemId: item.id,
          quantity: qty,
          unitCostPrice,
          unitPrice,
          totalCost,
          totalPrice,
          stockMovementId: movement.id,
        },
      });

      await this.recalcTicket(tx, ticket.id);
      // First consumed part moves the ticket out of intake.
      if (ticket.status === 'RECEIVED') {
        await tx.repairTicket.update({ where: { id: ticket.id }, data: { status: 'DIAGNOSING' } });
      }
      return tx.repairTicket.findUnique({
        where: { id: ticket.id },
        include: { contact: true, parts: { where: { isActive: true }, include: { inventoryItem: { select: { id: true, name: true, sku: true } } } } },
      });
    });
  }

  async removePart(ticketId: string, partId: string) {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const ticket = await tx.repairTicket.findFirst({ where: { id: ticketId, isActive: true } });
      if (!ticket) throw new NotFoundException(`RepairTicket with id ${ticketId} not found`);
      this.ensurePartsEditable(ticket.status);
      // TASK-BRIEF-002 Stream 3.B idempotency: filtering isActive:true means
      // a retried/duplicate delete call for an already-removed part finds
      // nothing here and 404s instead of posting a second reversal.
      const part = await tx.repairPartItem.findFirst({ where: { id: partId, ticketId: ticket.id, isActive: true } });
      if (!part) throw new NotFoundException('بند القطعة غير موجود في هذه التذكرة');

      const reversal = await this.postRepairPartStockMovement(tx, {
        itemId: part.inventoryItemId,
        type: 'IN',
        quantity: part.quantity,
        note: `REPAIR_RETURN: إلغاء استهلاك قطعة غيار للتذكرة ${ticket.ticketNumber}`,
        reference: ticket.ticketNumber,
      });
      await tx.repairPartItem.update({ where: { id: part.id }, data: { isActive: false, reversalMovementId: reversal.id } });
      await this.recalcTicket(tx, ticket.id);
      return tx.repairTicket.findUnique({
        where: { id: ticket.id },
        include: { contact: true, parts: { where: { isActive: true }, include: { inventoryItem: { select: { id: true, name: true, sku: true } } } } },
      });
    });
  }

  async updateFinancials(ticketId: string, dto: { laborCost?: string; discountAmount?: string }) {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const ticket = await tx.repairTicket.findFirst({ where: { id: ticketId, isActive: true } });
      if (!ticket) throw new NotFoundException(`RepairTicket with id ${ticketId} not found`);
      this.ensurePartsEditable(ticket.status);
      const data: any = {};
      if (dto.laborCost !== undefined) data.laborCost = this.normalizeAmount(dto.laborCost);
      if (dto.discountAmount !== undefined) data.discountAmount = this.normalizeAmount(dto.discountAmount);
      // Validate through the totals calculator before persisting.
      const parts = await tx.repairPartItem.findMany({ where: { ticketId: ticket.id, isActive: true } });
      this.ticketTotals(parts, data.laborCost ?? ticket.laborCost ?? '0.00', data.discountAmount ?? ticket.discountAmount ?? '0.00');
      await tx.repairTicket.update({ where: { id: ticket.id }, data });
      await this.recalcTicket(tx, ticket.id);
      return tx.repairTicket.findUnique({
        where: { id: ticket.id },
        include: { contact: true, parts: { where: { isActive: true }, include: { inventoryItem: { select: { id: true, name: true, sku: true } } } } },
      });
    });
  }

  /** Active SLA fault types for the ticket creation dropdown (soft-delete respected). */
  async listFaultTypes() {
    return (this.prisma as any).repairFaultTypeSLA.findMany({
      where: { isActive: true },
      select: { id: true, faultTypeName: true, defaultDays: true },
      orderBy: { faultTypeName: 'asc' },
    });
  }

  /**
   * Technician SLA override (TB-126): rebind fault type and/or set an explicit
   * estimated date. Terminal tickets are immutable. No audit log exists in the
   * repair domain (verified Part 1) — plain update.
   */
  async updateSla(ticketId: string, dto: { repairFaultTypeId?: string | null; estimatedCompletionDate?: string | null }) {
    const ticket = await (this.prisma as any).repairTicket.findFirst({ where: { id: ticketId, isActive: true } });
    if (!ticket) throw new NotFoundException(`RepairTicket with id ${ticketId} not found`);
    if (ticket.status === 'DELIVERED' || ticket.status === 'CANCELLED') {
      throw new BadRequestException('Cannot change SLA of terminal ticket');
    }
    const data: any = {};
    if (dto.repairFaultTypeId !== undefined) {
      if (dto.repairFaultTypeId === null) {
        data.repairFaultTypeId = null;
      } else {
        const faultType = await (this.prisma as any).repairFaultTypeSLA.findUnique({ where: { id: dto.repairFaultTypeId } });
        if (!faultType || !faultType.isActive) throw new BadRequestException('نوع العطل غير موجود أو موقوف');
        data.repairFaultTypeId = faultType.id;
      }
    }
    if (dto.estimatedCompletionDate !== undefined) {
      if (dto.estimatedCompletionDate === null) {
        data.estimatedCompletionDate = null;
      } else {
        const explicit = new Date(dto.estimatedCompletionDate);
        if (Number.isNaN(explicit.getTime())) throw new BadRequestException('estimatedCompletionDate must be a valid ISO date');
        data.estimatedCompletionDate = explicit;
      }
    }
    return (this.prisma as any).repairTicket.update({
      where: { id: ticketId },
      data,
      include: { repairFaultType: true },
    });
  }

  async updateStatus(id: string, dto: { status: string; actualCost?: string; notes?: string }, operatorId?: string) {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const ticket = await tx.repairTicket.findFirst({ where: { id, isActive: true } });
      if (!ticket) throw new NotFoundException(`RepairTicket with id ${id} not found`);

      const currentStatus = ticket.status;
      if (currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED') {
        throw new BadRequestException('Cannot change status of terminal ticket');
      }

      const newStatus = dto.status;
      const validStatuses = ['RECEIVED', 'DIAGNOSING', 'IN_REPAIR', 'READY', 'DELIVERED', 'CANCELLED'];
      if (!validStatuses.includes(newStatus)) {
        throw new BadRequestException('Invalid status');
      }

      let updateData: any = { status: newStatus };
      if (operatorId) updateData.operatorId = operatorId;
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      if (newStatus === 'DELIVERED') {
        // Settlement base: computed ticket total (parts + labor − discount).
        // Legacy tickets without parts/labor still require actualCost.
        const parts = await tx.repairPartItem.findMany({ where: { ticketId: ticket.id } });
        const computed = this.ticketTotals(parts, ticket.laborCost ?? '0.00', ticket.discountAmount ?? '0.00');
        let settleTotal = new Decimal(computed.totalAmount);
        if (settleTotal.eq(0)) {
          if (!dto.actualCost) {
            throw new BadRequestException('actualCost required when delivering');
          }
          const normalizedActual = this.normalizeAmount(dto.actualCost);
          if (new Decimal(normalizedActual).lt(0)) {
            throw new BadRequestException('actualCost must be >= 0');
          }
          settleTotal = new Decimal(normalizedActual);
        }
        const settleStr = this.to2dp(settleTotal);
        updateData.actualCost = settleStr;
        updateData.totalAmount = computed.totalAmount;
        updateData.partsCost = computed.partsCost;
        updateData.partsTotal = computed.partsTotal;
        updateData.completedAt = new Date();
        updateData.deliveredAt = new Date();

        const depositDec = new Decimal(ticket.depositAmount ?? '0.00');
        const paidDec = new Decimal(ticket.paidAmount ?? '0.00');
        const remaining = settleTotal.minus(depositDec).minus(paidDec);
        const remainingStr = this.to2dp(remaining.gt(0) ? remaining : new Decimal(0));

        const seqSetting = await tx.setting.findUnique({ where: { key: 'repair_sequence_next' } });
        const currentSeqStr: string = seqSetting?.value ?? '1';
        const currentSeq = Number.parseInt(currentSeqStr, 10);
        const seq = Number.isNaN(currentSeq) || currentSeq < 1 ? 1 : currentSeq;
        const invoiceNumber = `REP-${String(seq).padStart(6, '0')}`;
        await tx.setting.upsert({
          where: { key: 'repair_sequence_next' },
          update: { value: String(seq + 1) },
          create: { key: 'repair_sequence_next', value: String(seq + 1) },
        });
        updateData.invoiceNumber = invoiceNumber;

        if (remaining.gt(0)) {
          await this.cashService.postCashMovement(tx, {
            type: 'IN',
            category: 'REPAIR_PAYMENT',
            amount: remainingStr,
            note: `تحصيل تسليم صيانة ${invoiceNumber}`,
            operatorId: operatorId ?? undefined,
          });
          updateData.paidAmount = this.to2dp(paidDec.plus(remaining));
        }
      }

      if (newStatus === 'CANCELLED') {
        // Return every consumed part to stock before the deposit refund.
        // TASK-BRIEF-002 Stream 3.B: isActive:true filter is the idempotency
        // guard here too — already-removed parts (via removePart) are
        // skipped, never double-reversed.
        const parts = await tx.repairPartItem.findMany({ where: { ticketId: ticket.id, isActive: true } });
        for (const part of parts) {
          const reversal = await this.postRepairPartStockMovement(tx, {
            itemId: part.inventoryItemId,
            type: 'IN',
            quantity: part.quantity,
            note: `REPAIR_RETURN: إرجاع قطع التذكرة الملغاة ${ticket.ticketNumber}`,
            reference: ticket.ticketNumber,
          });
          await tx.repairPartItem.update({ where: { id: part.id }, data: { isActive: false, reversalMovementId: reversal.id } });
        }
        await this.recalcTicket(tx, ticket.id);
        const depositDec = new Decimal(ticket.depositAmount ?? '0.00');
        const depositPaid = ticket.depositPaid;
        if (depositDec.gt(0) && depositPaid) {
          const depositStr = this.to2dp(depositDec);
          await this.cashService.postCashMovement(tx, {
            type: 'OUT',
            category: 'ADJUSTMENT',
            amount: depositStr,
            note: `Repair cancelled refund ${ticket.ticketNumber}`,
          });
        }
      }

      if (dto.actualCost !== undefined && newStatus !== 'DELIVERED') {
        updateData.actualCost = this.normalizeAmount(dto.actualCost);
      }

      const updated = await tx.repairTicket.update({
        where: { id },
        data: updateData,
      });

      return tx.repairTicket.findUnique({ where: { id: updated.id }, include: { contact: true } });
    });
  }

  async recordExternalCost(id: string, dto: { externalCost: string; note?: string }) {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const ticket = await tx.repairTicket.findFirst({ where: { id, isActive: true } });
      if (!ticket) throw new NotFoundException(`RepairTicket with id ${id} not found`);
      if (ticket.repairType !== 'EXTERNAL') {
        throw new BadRequestException('External cost only allowed for EXTERNAL repairs');
      }
      if (ticket.status === 'DELIVERED' || ticket.status === 'CANCELLED') {
        throw new BadRequestException('Cannot record external cost on terminal ticket');
      }
      const normalized = this.normalizeAmount(dto.externalCost);
      if (new Decimal(normalized).lte(0)) {
        throw new BadRequestException('externalCost must be > 0');
      }

      await this.cashService.postCashMovement(tx, {
        type: 'OUT',
        category: 'PURCHASE_PAYMENT',
        amount: normalized,
        note: dto.note ?? `External cost for ${ticket.ticketNumber}`,
      });

      const existing = new Decimal(ticket.externalCost ?? '0.00');
      const updatedCost = existing.plus(new Decimal(normalized));
      const updated = await tx.repairTicket.update({
        where: { id },
        data: { externalCost: this.to2dp(updatedCost) },
      });
      return tx.repairTicket.findUnique({ where: { id: updated.id }, include: { contact: true } });
    });
  }

  /** AD-70 canonical repair aggregation (TB-132): single server-side source of truth. */
  async getSummary() {
    const rows = (await (this.prisma as any).repairTicket.groupBy({
      by: ['status'],
      where: { isActive: true },
      _count: { status: true },
    })) as Array<{ status: string; _count: { status: number } }>;
    const count = (s: string) => rows.find((r) => r.status === s)?._count.status ?? 0;
    const received = count('RECEIVED');
    const diagnosing = count('DIAGNOSING');
    const inRepair = count('IN_REPAIR');
    const ready = count('READY');
    const inWorkshopTotal = received + diagnosing + inRepair;
    const openTotal = inWorkshopTotal + ready;
    return { received, diagnosing, inRepair, ready, inWorkshopTotal, openTotal };
  }

  async findAll(filters?: { status?: string; contactId?: string; repairType?: string; search?: string }) {
    const where: any = { isActive: true };
    if (filters?.status) where.status = filters.status;
    if (filters?.contactId) where.contactId = filters.contactId;
    if (filters?.repairType) where.repairType = filters.repairType;
    if (filters?.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { ticketNumber: { contains: q } },
        { deviceBrand: { contains: q } },
        { deviceModel: { contains: q } },
        { problemDescription: { contains: q } },
        { contact: { name: { contains: q } } },
        { contact: { phone: { contains: q } } },
      ];
    }
    return this.prisma.repairTicket.findMany({
      where,
      include: { contact: true, parts: { where: { isActive: true }, include: { inventoryItem: { select: { id: true, name: true, sku: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const ticket = await this.prisma.repairTicket.findUnique({
      where: { id },
      include: { contact: true, parts: { where: { isActive: true }, include: { inventoryItem: { select: { id: true, name: true, sku: true } } } } },
    });
    if (!ticket) throw new NotFoundException(`RepairTicket with id ${id} not found`);
    return ticket;
  }

  async getMetrics() {
    const all = await this.prisma.repairTicket.findMany({ where: { isActive: true } });
    const now = new Date();
    const dayStart = this.getAlgeriaStartOfDay(now);
    const dayEnd = this.getAlgeriaEndOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const isOpen = (s: string) => s !== 'DELIVERED' && s !== 'CANCELLED';
    let active = 0;
    let ready = 0;
    let deliveredToday = 0;
    let monthRevenue = new Decimal(0);
    let monthPartsCost = new Decimal(0);
    for (const t of all) {
      if (isOpen(t.status)) active++;
      if (t.status === 'READY') ready++;
      if (t.status === 'DELIVERED' && t.deliveredAt && t.deliveredAt >= dayStart && t.deliveredAt <= dayEnd) deliveredToday++;
      if (t.status === 'DELIVERED' && t.deliveredAt && t.deliveredAt >= monthStart) {
        monthRevenue = monthRevenue.plus(new Decimal(t.actualCost ?? '0.00'));
        monthPartsCost = monthPartsCost.plus(new Decimal(t.partsCost ?? '0.00'));
      }
    }
    const consumed = await this.prisma.repairPartItem.aggregate({ where: { isActive: true }, _sum: { quantity: true } });
    const consumedQty = consumed._sum.quantity ?? 0;
    return {
      active,
      ready,
      deliveredToday,
      monthRevenue: this.to2dp(monthRevenue),
      monthPartsCost: this.to2dp(monthPartsCost),
      monthNetProfit: this.to2dp(monthRevenue.minus(monthPartsCost)),
      consumedPartsQty: consumedQty,
    };
  }

  async softDelete(id: string) {
    const ticket = await this.prisma.repairTicket.findFirst({ where: { id, isActive: true } });
    if (!ticket) throw new NotFoundException(`RepairTicket with id ${id} not found`);
    return this.prisma.repairTicket.update({ where: { id }, data: { isActive: false } });
  }

  async getRepairProfit(startDate?: string, endDate?: string) {
    let where: any = { isActive: true, status: 'DELIVERED' };
    if (startDate || endDate) {
      where.deliveredAt = {};
      if (startDate) {
        const d = new Date(startDate);
        if (!Number.isNaN(d.getTime())) where.deliveredAt.gte = this.getAlgeriaStartOfDay(d);
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!Number.isNaN(d.getTime())) where.deliveredAt.lte = this.getAlgeriaEndOfDay(d);
      }
    }
    const tickets = await this.prisma.repairTicket.findMany({ where });
    let totalRepairRevenue = new Decimal(0);
    let totalExternalCost = new Decimal(0);
    let totalRepairProfit = new Decimal(0);
    for (const t of tickets) {
      const actual = new Decimal(t.actualCost ?? '0.00');
      const external = new Decimal(t.externalCost ?? '0.00');
      if (t.repairType === 'EXTERNAL') {
        totalRepairRevenue = totalRepairRevenue.plus(actual);
        totalExternalCost = totalExternalCost.plus(external);
        totalRepairProfit = totalRepairProfit.plus(actual.minus(external));
      } else {
        totalRepairRevenue = totalRepairRevenue.plus(actual);
        totalRepairProfit = totalRepairProfit.plus(actual);
      }
    }
    return {
      totalRepairRevenue: this.to2dp(totalRepairRevenue),
      totalExternalCost: this.to2dp(totalExternalCost),
      totalRepairProfit: this.to2dp(totalRepairProfit),
      ticketCount: tickets.length,
    };
  }
}
