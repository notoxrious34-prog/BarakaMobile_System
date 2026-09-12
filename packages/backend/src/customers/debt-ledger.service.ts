import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CashService } from '../cash/cash.service';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { isOpeningBalanceUniqueViolation } from './opening-balance-errors';

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

  /**
   * AD-76 opening balance (TB-141). Records a historical pre-system balance
   * as the FIRST ledger entry and folds it into Account.currentBalance.
   * DEBIT = customer owes shop (positive), CREDIT = shop owes customer
   * (negative). Reuses the caller's tx when provided (Rule ⑬); otherwise
   * opens its own $transaction. Locked once any ledger entry exists.
   * ZERO cash impact by construction — cashService is never called.
   */
  async recordOpeningBalance(
    contactId: string,
    dto: { amount: string; direction: 'DEBIT' | 'CREDIT'; date?: string; notes?: string; createdById?: string },
    outerTx?: PrismaTx,
  ) {
    const run = async (tx: PrismaTx) => {
      const normalized = this.normalizeAmount(dto.amount);
      const amountDec = this.assertDecimalPositive(normalized);
      if (dto.direction !== 'DEBIT' && dto.direction !== 'CREDIT') {
        throw new BadRequestException('direction يجب أن يكون DEBIT أو CREDIT');
      }
      let createdAt: Date | undefined;
      if (dto.date !== undefined) {
        const t = new Date(dto.date);
        if (Number.isNaN(t.getTime())) throw new BadRequestException('تاريخ الرصيد الافتتاحي غير صالح');
        createdAt = t;
      }
      const account = await this.resolveOrCreateCustomerAccount(contactId, tx);
      const existing = await (tx as any).customerDebtLedgerEntry.count({ where: { customerId: contactId } });
      if (existing > 0) throw new BadRequestException('لا يمكن تسجيل رصيد افتتاحي بعد وجود حركات على الحساب');
      const signed = dto.direction === 'DEBIT' ? amountDec : amountDec.neg();
      const balanceBefore = this.to2dp(account.currentBalance);
      const balanceAfter = this.to2dp(new Decimal(balanceBefore).plus(signed));
      const openingBalance = this.to2dp(signed);
      await (tx as any).account.update({
        where: { id: account.id },
        data: { currentBalance: balanceAfter, openingBalance },
      });
      const entry = await (tx as any).customerDebtLedgerEntry.create({
        data: {
          customerId: contactId,
          type: 'OPENING_BALANCE',
          amount: normalized,
          balanceBefore,
          balanceAfter,
          notes: dto.notes ?? 'رصيد افتتاحي مرحل',
          createdById: dto.createdById ?? null,
          ...(createdAt ? { createdAt } : {}),
        },
      }).catch((e: unknown) => {
        if (isOpeningBalanceUniqueViolation(e)) {
          throw new ConflictException('تم تسجيل رصيد افتتاحي لهذا العميل مسبقاً');
        }
        throw e;
      });
      return entry;
    };
    if (outerTx) return run(outerTx);
    return this.prisma.$transaction((tx: PrismaTx) => run(tx));
  }

  /**
   * AD-76 customer creation (TB-141). Atomically creates Contact (CUSTOMER)
   * + Account + optional OPENING_BALANCE entry in ONE $transaction.
   */
  async createCustomer(dto: {
    name: string;
    phone?: string;
    address?: string;
    notes?: string;
    creditLimit?: string;
    openingBalance?: { amount: string; direction: 'DEBIT' | 'CREDIT'; date?: string; notes?: string; createdById?: string };
  }) {
    if (!dto.name || dto.name.trim().length < 2) throw new BadRequestException('اسم العميل مطلوب');
    return this.prisma.$transaction(async (tx: PrismaTx) => {
      const creditLimit = this.normalizeAmount(dto.creditLimit ?? '0.00');
      const contact = await (tx as any).contact.create({
        data: {
          name: dto.name.trim(),
          phone: dto.phone ?? null,
          address: dto.address ?? null,
          role: 'CUSTOMER',
          notes: dto.notes ?? null,
          creditLimit,
        },
      });
      await (tx as any).account.create({
        data: { contactId: contact.id, role: 'CUSTOMER', openingBalance: '0.00', currentBalance: '0.00' },
      });
      let opening: unknown = null;
      if (dto.openingBalance) {
        opening = await this.recordOpeningBalance(contact.id, dto.openingBalance, tx);
      }
      const created = await (tx as any).contact.findUnique({
        where: { id: contact.id },
        include: { accounts: true },
      });
      return { ...created, opening };
    });
  }

  /**
   * AD-77 customer receipt voucher (TB-143). Atomically posts the PAYMENT
   * ledger entry AND the cash drawer IN movement in ONE $transaction,
   * reusing the caller's tx when provided (Rule ⑬). CREDIT direction:
   * reduces the customer's debit balance. Supports backdated paymentDate.
   */
  async settleWithVoucher(
    contactId: string,
    dto: { amount: string; paymentDate?: string; notes?: string; createdById?: string },
    outerTx?: PrismaTx,
  ) {
    const run = async (tx: PrismaTx) => {
      const normalized = this.normalizeAmount(dto.amount);
      const amountDec = this.assertDecimalPositive(normalized);
      let paymentDate = new Date();
      if (dto.paymentDate !== undefined) {
        const t = new Date(dto.paymentDate);
        if (Number.isNaN(t.getTime())) throw new BadRequestException('تاريخ الدفعة غير صالح');
        paymentDate = t;
      }
      const contact = await (tx as any).contact.findUnique({ where: { id: contactId } });
      if (!contact) throw new NotFoundException(`Contact with id ${contactId} not found`);
      if (!contact.isActive) throw new BadRequestException('العميل غير نشط — لا يمكن تسجيل دفعة');
      const account = await this.resolveOrCreateCustomerAccount(contactId, tx);
      const balanceBefore = this.to2dp(account.currentBalance);
      const balanceDec = new Decimal(balanceBefore);
      if (balanceDec.lte(0)) throw new BadRequestException('لا يوجد دين مستحق لهذا العميل');
      if (amountDec.gt(balanceDec)) throw new BadRequestException('المبلغ يتجاوز الدين المستحق');
      const balanceAfter = this.to2dp(balanceDec.minus(amountDec));
      await (tx as any).account.update({ where: { id: account.id }, data: { currentBalance: balanceAfter } });
      const ledgerEntry = await (tx as any).customerDebtLedgerEntry.create({
        data: {
          customerId: contactId,
          type: 'PAYMENT',
          amount: normalized,
          balanceBefore,
          balanceAfter,
          notes: dto.notes ?? 'دفعة نقدية من الحساب',
          createdById: dto.createdById ?? null,
          createdAt: paymentDate,
        },
      });
      const movement = await this.cashService.postCashMovement(tx, {
        type: 'IN',
        category: 'DEBT_SETTLEMENT',
        amount: normalized,
        note: dto.notes ? `Customer payment ${contactId}: ${dto.notes}` : `Customer payment ${contactId}`,
      });
      return { success: true as const, ledgerEntry, currentBalance: balanceAfter, cashMovementId: movement.id };
    };
    if (outerTx) return run(outerTx);
    return this.prisma.$transaction((tx: PrismaTx) => run(tx));
  }
}
