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

  async createTicket(dto: any) {
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

    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const contact = await (tx as any).contact.findUnique({
        where: { id: dto.contactId },
        include: { accounts: true },
      });
      if (!contact) {
        throw new NotFoundException(`Contact with id ${dto.contactId} not found`);
      }
      const customerAccount = contact.accounts?.find((a: any) => a.role === 'CUSTOMER') ?? (await (tx as any).account.findFirst({ where: { contactId: dto.contactId, role: 'CUSTOMER' } }));
      if (!customerAccount) {
        const acc = await (tx as any).account.findFirst({ where: { contactId: dto.contactId, role: 'CUSTOMER' } });
        if (!acc) throw new BadRequestException('Contact must have CUSTOMER account');
      }
      const account = await (tx as any).account.findFirst({ where: { contactId: dto.contactId, role: 'CUSTOMER' } });
      if (!account) throw new BadRequestException('Contact must have CUSTOMER account');

      const seqSetting = await (tx as any).setting.findUnique({ where: { key: 'repair_sequence_next' } });
      const currentSeqStr: string = seqSetting?.value ?? '1';
      const currentSeq = Number.parseInt(currentSeqStr, 10);
      const seq = Number.isNaN(currentSeq) || currentSeq < 1 ? 1 : currentSeq;
      const ticketNumber = `REP-${String(seq).padStart(6, '0')}`;
      await (tx as any).setting.upsert({
        where: { key: 'repair_sequence_next' },
        update: { value: String(seq + 1) },
        create: { key: 'repair_sequence_next', value: String(seq + 1) },
      });

      const ticket = await (tx as any).repairTicket.create({
        data: {
          ticketNumber,
          contactId: dto.contactId,
          deviceType,
          deviceBrand: dto.deviceBrand,
          deviceModel: dto.deviceModel,
          problemDescription: dto.problemDescription,
          status: 'RECEIVED',
          repairType,
          technicianName: dto.technicianName,
          estimatedCost,
          actualCost: '0.00',
          externalCost: '0.00',
          depositAmount,
          depositPaid: new Decimal(depositAmount).gt(0),
          notes: dto.notes,
        },
      });

      if (new Decimal(depositAmount).gt(0)) {
        const before = new Decimal(account.currentBalance);
        const after = before.plus(new Decimal(depositAmount));
        const balanceAfterStr = this.to2dp(after);
        const balanceBeforeStr = this.to2dp(before);

        await (tx as any).ledgerEntry.create({
          data: {
            transactionId: ticket.id,
            accountId: account.id,
            entryType: 'DEBIT',
            amount: depositAmount,
            balanceBefore: balanceBeforeStr,
            balanceAfter: balanceAfterStr,
          },
        });
        await (tx as any).account.update({
          where: { id: account.id },
          data: { currentBalance: balanceAfterStr },
        });
        await this.cashService.postCashMovement(tx, {
          type: 'IN',
          category: 'SALE_PAYMENT',
          amount: depositAmount,
          note: `Repair deposit ${ticketNumber}`,
          relatedTransactionId: ticket.id,
        });
      }

      return (tx as any).repairTicket.findUnique({ where: { id: ticket.id }, include: { contact: true } });
    });
  }

  async updateStatus(id: string, dto: { status: string; actualCost?: string; notes?: string }) {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const ticket = await (tx as any).repairTicket.findFirst({ where: { id, isActive: true } });
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
      if (dto.notes !== undefined) updateData.notes = dto.notes;

      if (newStatus === 'DELIVERED') {
        if (!dto.actualCost) {
          throw new BadRequestException('actualCost required when delivering');
        }
        const normalizedActual = this.normalizeAmount(dto.actualCost);
        if (new Decimal(normalizedActual).lt(0)) {
          throw new BadRequestException('actualCost must be >= 0');
        }
        updateData.actualCost = normalizedActual;
        updateData.deliveredAt = new Date();

        const depositDec = new Decimal(ticket.depositAmount ?? '0.00');
        const actualDec = new Decimal(normalizedActual);
        const remaining = actualDec.minus(depositDec);
        const remainingStr = this.to2dp(remaining.gt(0) ? remaining : new Decimal(0));

        const seqSetting = await (tx as any).setting.findUnique({ where: { key: 'repair_sequence_next' } });
        const currentSeqStr: string = seqSetting?.value ?? '1';
        const currentSeq = Number.parseInt(currentSeqStr, 10);
        const seq = Number.isNaN(currentSeq) || currentSeq < 1 ? 1 : currentSeq;
        const invoiceNumber = `REP-${String(seq).padStart(6, '0')}`;
        await (tx as any).setting.upsert({
          where: { key: 'repair_sequence_next' },
          update: { value: String(seq + 1) },
          create: { key: 'repair_sequence_next', value: String(seq + 1) },
        });
        updateData.invoiceNumber = invoiceNumber;

        if (remaining.gt(0)) {
          const account = await (tx as any).account.findFirst({ where: { contactId: ticket.contactId, role: 'CUSTOMER' } });
          if (account) {
            const before = new Decimal(account.currentBalance);
            const afterDebit = before.plus(remaining);
            const afterDebitStr = this.to2dp(afterDebit);
            const afterCredit = afterDebit.minus(remaining);
            const afterCreditStr = this.to2dp(afterCredit);

            await (tx as any).ledgerEntry.create({
              data: {
                transactionId: ticket.id,
                accountId: account.id,
                entryType: 'DEBIT',
                amount: remainingStr,
                balanceBefore: this.to2dp(before),
                balanceAfter: afterDebitStr,
              },
            });
            await (tx as any).ledgerEntry.create({
              data: {
                transactionId: ticket.id,
                accountId: account.id,
                entryType: 'CREDIT',
                amount: remainingStr,
                balanceBefore: afterDebitStr,
                balanceAfter: afterCreditStr,
              },
            });
            await (tx as any).account.update({
              where: { id: account.id },
              data: { currentBalance: afterCreditStr },
            });
            await this.cashService.postCashMovement(tx, {
              type: 'IN',
              category: 'SALE_PAYMENT',
              amount: remainingStr,
              relatedTransactionId: ticket.id,
              note: `Repair delivery ${invoiceNumber}`,
            });
          }
        }
      }

      if (newStatus === 'CANCELLED') {
        const depositDec = new Decimal(ticket.depositAmount ?? '0.00');
        const depositPaid = ticket.depositPaid;
        if (depositDec.gt(0) && depositPaid) {
          const account = await (tx as any).account.findFirst({ where: { contactId: ticket.contactId, role: 'CUSTOMER' } });
          if (account) {
            const depositStr = this.to2dp(depositDec);
            const before = new Decimal(account.currentBalance);
            const after = before.minus(depositDec);
            const beforeStr = this.to2dp(before);
            const afterStr = this.to2dp(after.gt(0) ? after : before.minus(depositDec));

            await (tx as any).ledgerEntry.create({
              data: {
                transactionId: ticket.id,
                accountId: account.id,
                entryType: 'CREDIT',
                amount: depositStr,
                balanceBefore: beforeStr,
                balanceAfter: this.to2dp(before.minus(depositDec)),
              },
            });
            await (tx as any).account.update({
              where: { id: account.id },
              data: { currentBalance: this.to2dp(before.minus(depositDec)) },
            });
            await this.cashService.postCashMovement(tx, {
              type: 'OUT',
              category: 'ADJUSTMENT',
              amount: depositStr,
              relatedTransactionId: ticket.id,
              note: `Repair cancelled refund ${ticket.ticketNumber}`,
            });
          }
        }
      }

      if (dto.actualCost !== undefined && newStatus !== 'DELIVERED') {
        updateData.actualCost = this.normalizeAmount(dto.actualCost);
      }

      const updated = await (tx as any).repairTicket.update({
        where: { id },
        data: updateData,
      });

      return (tx as any).repairTicket.findUnique({ where: { id: updated.id }, include: { contact: true } });
    });
  }

  async recordExternalCost(id: string, dto: { externalCost: string; note?: string }) {
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const ticket = await (tx as any).repairTicket.findFirst({ where: { id, isActive: true } });
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
        relatedTransactionId: ticket.id,
        note: dto.note ?? `External cost for ${ticket.ticketNumber}`,
      });

      const existing = new Decimal(ticket.externalCost ?? '0.00');
      const updatedCost = existing.plus(new Decimal(normalized));
      const updated = await (tx as any).repairTicket.update({
        where: { id },
        data: { externalCost: this.to2dp(updatedCost) },
      });
      return (tx as any).repairTicket.findUnique({ where: { id: updated.id }, include: { contact: true } });
    });
  }

  async findAll(filters?: { status?: string; contactId?: string; repairType?: string }) {
    const where: any = { isActive: true };
    if (filters?.status) where.status = filters.status;
    if (filters?.contactId) where.contactId = filters.contactId;
    if (filters?.repairType) where.repairType = filters.repairType;
    return (this.prisma as any).repairTicket.findMany({
      where,
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const ticket = await (this.prisma as any).repairTicket.findUnique({
      where: { id },
      include: { contact: true },
    });
    if (!ticket) throw new NotFoundException(`RepairTicket with id ${id} not found`);
    return ticket;
  }

  async softDelete(id: string) {
    const ticket = await (this.prisma as any).repairTicket.findFirst({ where: { id, isActive: true } });
    if (!ticket) throw new NotFoundException(`RepairTicket with id ${id} not found`);
    return (this.prisma as any).repairTicket.update({ where: { id }, data: { isActive: false } });
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
    const tickets = await (this.prisma as any).repairTicket.findMany({ where });
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
