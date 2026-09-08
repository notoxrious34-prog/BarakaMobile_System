import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CashService } from '../cash/cash.service';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

type PrismaTx = Prisma.TransactionClient;

@Injectable()
export class DebtLedgerService {
  constructor(private readonly prisma: PrismaService, private readonly cashService: CashService) {}

  private to2dp(v: string | Decimal): string {
    return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private normalizeAmount(value: string): string {
    return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  private assertDecimalPositive(value: string): Decimal {
    let d: Decimal;
    try {
      d = new Decimal(value);
    } catch {
      throw new BadRequestException('المبلغ يجب أن يكون رقمًا عشريًا صالحًا');
    }
    if (!d.isFinite() || d.lte(0)) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
    if (d.decimalPlaces() > 2) throw new BadRequestException('رقمان عشريان كحد أقصى');
    return d;
  }

  /** Resolve or create CUSTOMER Account for Contact, returns account. */
  async resolveOrCreateCustomerAccount(contactId: string, tx: PrismaTx) {
    const contact = await (tx as any).contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Contact with id ${contactId} not found`);
    if (contact.role === 'SUPPLIER') throw new BadRequestException('Contact is SUPPLIER only — cannot carry customer debt');
    let account = await (tx as any).account.findFirst({ where: { contactId, role: 'CUSTOMER' } });
    if (!account) {
      account = await (tx as any).account.create({
        data: { contactId, role: 'CUSTOMER', openingBalance: '0.00', currentBalance: '0.00' },
      });
    }
    return account;
  }

  async getDebt(contactId: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Contact with id ${contactId} not found`);
    const account = await this.prisma.account.findFirst({ where: { contactId, role: 'CUSTOMER' } });
    const balance = account ? this.to2dp(account.currentBalance) : '0.00';
    const creditLimit = this.to2dp((contact as any).creditLimit ?? '0.00');
    return { contactId, balance, creditLimit, accountId: account?.id ?? null };
  }

  async getLedger(contactId: string, take = 50) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Contact with id ${contactId} not found`);
    const entries = await (this.prisma as any).customerDebtLedgerEntry.findMany({
      where: { customerId: contactId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
    const account = await this.prisma.account.findFirst({ where: { contactId, role: 'CUSTOMER' } });
    return { contactId, currentBalance: account ? this.to2dp(account.currentBalance) : '0.00', entries };
  }

  /** Called from TransactionsService within same $transaction after sale credit is computed. */
  async recordCreditSale(
    tx: PrismaTx,
    params: { customerId: string; amount: string; relatedTransactionId?: string; notes?: string; createdById?: string },
  ) {
    const normalized = this.normalizeAmount(params.amount);
    this.assertDecimalPositive(normalized);
    const account = await this.resolveOrCreateCustomerAccount(params.customerId, tx);
    const contact = await (tx as any).contact.findUnique({ where: { id: params.customerId } });
    const creditLimitStr: string = contact?.creditLimit ?? '0.00';
    const balanceBefore = this.to2dp(account.currentBalance);
    const balanceAfterDec = new Decimal(balanceBefore).plus(new Decimal(normalized));
    const balanceAfter = this.to2dp(balanceAfterDec);
    // creditLimit 0 means unlimited
    const limitDec = new Decimal(creditLimitStr);
    if (limitDec.gt(0) && balanceAfterDec.gt(limitDec)) {
      throw new BadRequestException(`تجاوز سقف الائتمان (${this.to2dp(limitDec)} د.ج)`);
    }
    await (tx as any).account.update({ where: { id: account.id }, data: { currentBalance: balanceAfter } });
    const entry = await (tx as any).customerDebtLedgerEntry.create({
      data: {
        customerId: params.customerId,
        type: 'CREDIT_SALE',
        amount: normalized,
        balanceBefore,
        balanceAfter,
        relatedTransactionId: params.relatedTransactionId ?? null,
        notes: params.notes ?? null,
        createdById: params.createdById ?? null,
      },
    });
    return entry;
  }

  async settleDebt(contactId: string, dto: { amount: string; notes?: string; createdById?: string }) {
    const normalized = this.normalizeAmount(dto.amount);
    const amountDec = this.assertDecimalPositive(normalized);
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException(`Contact with id ${contactId} not found`);

    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const account = await this.resolveOrCreateCustomerAccount(contactId, tx);
      const balanceBefore = this.to2dp(account.currentBalance);
      const balanceDec = new Decimal(balanceBefore);
      if (balanceDec.lte(0)) throw new BadRequestException('لا يوجد دين مستحق لهذا العميل');
      if (amountDec.gt(balanceDec)) throw new BadRequestException('المبلغ يتجاوز الدين المستحق');
      const balanceAfterDec = balanceDec.minus(amountDec);
      if (balanceAfterDec.lt(0)) throw new BadRequestException('لا يمكن أن يصبح الرصيد سالبًا');
      const balanceAfter = this.to2dp(balanceAfterDec);

      await (tx as any).account.update({ where: { id: account.id }, data: { currentBalance: balanceAfter } });

      const ledger = await (tx as any).customerDebtLedgerEntry.create({
        data: {
          customerId: contactId,
          type: 'PAYMENT',
          amount: normalized,
          balanceBefore,
          balanceAfter,
          notes: dto.notes ?? null,
          createdById: dto.createdById ?? null,
        },
      });

      // Treasury: cash IN via DEBT_SETTLEMENT. No PosShift model — CashMovement only (disclosed).
      await this.cashService.postCashMovement(tx, {
        type: 'IN',
        category: 'DEBT_SETTLEMENT',
        amount: normalized,
        relatedTransactionId: undefined,
        note: dto.notes ? `Debt settlement ${contactId}: ${dto.notes}` : `Debt settlement ${contactId}`,
      });

      const updatedAccount = await (tx as any).account.findUnique({ where: { id: account.id } });
      return { ledger, account: updatedAccount, cashPosted: true, note: 'PosShift does not exist — CashMovement only' };
    });
  }

  async adjustDebt(contactId: string, dto: { amount: string; direction: 'ADD' | 'SUB'; notes?: string; createdById?: string }) {
    const normalized = this.normalizeAmount(dto.amount);
    this.assertDecimalPositive(normalized);
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const account = await this.resolveOrCreateCustomerAccount(contactId, tx);
      const balanceBefore = this.to2dp(account.currentBalance);
      const type = dto.direction === 'ADD' ? 'DEBT_ADJUSTMENT_ADD' : 'DEBT_ADJUSTMENT_SUB';
      let balanceAfterDec: Decimal;
      if (dto.direction === 'ADD') balanceAfterDec = new Decimal(balanceBefore).plus(new Decimal(normalized));
      else {
        balanceAfterDec = new Decimal(balanceBefore).minus(new Decimal(normalized));
        if (balanceAfterDec.lt(0)) throw new BadRequestException('لا يمكن أن يصبح الرصيد سالبًا');
      }
      const balanceAfter = this.to2dp(balanceAfterDec);
      await (tx as any).account.update({ where: { id: account.id }, data: { currentBalance: balanceAfter } });
      const entry = await (tx as any).customerDebtLedgerEntry.create({
        data: {
          customerId: contactId,
          type,
          amount: normalized,
          balanceBefore,
          balanceAfter,
          notes: dto.notes ?? null,
          createdById: dto.createdById ?? null,
        },
      });
      return entry;
    });
  }
}
