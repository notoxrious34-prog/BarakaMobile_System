import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DigitalServiceTransaction, FloatTransferRecord, TopUpWallet } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Money } from '../../core/money';
import { ValidationError } from '../../core/result';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { DocumentNumberService } from '../../core/document-number.service';
import { AuditService } from '../../core/audit.service';
import { PostingService } from '../../accounting/posting.service';
import { PartiesService } from '../../parties/parties.service';
import { PartySubledgerService } from '../../parties/party-subledger.service';
import {
  InactiveWalletError,
  InsufficientWalletBalanceError,
  InvalidFlexyPricingError,
  InvalidFloatTransferError,
  WalletNotFoundError,
} from './wallets.errors';
import { ACCOUNT_LIQUIDITY_TYPE, TOPUP_PAYMENT_MEDIUM, WALLET_OPERATOR } from './wallets.types';
import type { CreateWalletDto } from './dto/create-wallet.dto';
import type { FundWalletDto } from './dto/fund-wallet.dto';
import type { ProcessTopUpDto } from './dto/process-topup.dto';
import type { TransferFloatDto } from './dto/transfer-float.dto';

/**
 * DIRECTIVE-016 Stage 7.2 — Flexy float engine (v3.0 digital wallets).
 *
 * Owns operator SIM float (`TopUpWallet` — NOT the v2 service-catalog
 * `DigitalWallet`, which stays untouched with its live row): wallet
 * provisioning, till/bank funding, margin-bearing top-ups (cash or
 * on-account with subledger leg), and inter-account float transfers.
 * Every public method runs in the caller's `tx` or a fresh orchestrator
 * transaction — partial float writes are impossible.
 *
 * COA map (committed chart): 10000 Cash, 10100 Wallet Float, 10200 Bank,
 * 11000 AR, 40300 Flexy Margin — all non-control, so MANUAL/EXPENSE/
 * SALE_INVOICE journals post freely. Funding journals use 'MANUAL',
 * top-ups 'SALE_INVOICE' (service sale), transfers 'MANUAL'.
 * `serviceType` is hardcoded 'FLEXY': the DTO contract exposes no service
 * selector yet (BILL_PAYMENT/OTHER are schema-reserved for a later stage).
 */

const CASH = '10000';
const FLOAT = '10100';
const BANK = '10200';
const AR_CONTROL = '11000';
const FLEXY_MARGIN = '40300';

const FUND_SOURCE_ACCOUNT: Record<string, string> = { CASH, BANK };
const LIQUIDITY_ACCOUNT: Record<string, string> = { CASH, BANK, WALLET: FLOAT };
const KNOWN_OPERATORS = new Set<string>(Object.values(WALLET_OPERATOR));

export interface WalletJournalResult {
  journalEntryId: string;
  journalNumber: string;
}

export interface FundWalletResult extends WalletJournalResult {
  wallet: TopUpWallet;
}

export interface TopUpResult extends WalletJournalResult {
  transaction: DigitalServiceTransaction;
  wallet: TopUpWallet;
}

export interface FloatTransferResult extends WalletJournalResult {
  record: FloatTransferRecord;
}

function parseAmount(value: string, what: string): Money {
  try {
    return Money.from(value);
  } catch {
    throw new InvalidFlexyPricingError(`FlexyOrchestratorService: ${what} is not a valid amount.`, { value });
  }
}

@Injectable()
export class FlexyOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly sequences: DocumentNumberService,
    private readonly posting: PostingService,
    private readonly parties: PartiesService,
    private readonly subledger: PartySubledgerService,
    private readonly audit: AuditService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  private async requireWallet(walletId: string, db: Prisma.TransactionClient): Promise<TopUpWallet> {
    if (!walletId || walletId.trim().length === 0) {
      throw new ValidationError('FlexyOrchestratorService: walletId must be a non-empty string.');
    }
    const wallet = await db.topUpWallet.findUnique({ where: { id: walletId } });
    if (!wallet) {
      throw new WalletNotFoundError(`Float wallet "${walletId}" not found.`, { walletId });
    }
    return wallet;
  }

  private assertActive(wallet: TopUpWallet): void {
    if (!wallet.isActive) {
      throw new InactiveWalletError(`Float wallet "${wallet.name}" is inactive — operations are blocked.`, {
        walletId: wallet.id,
      });
    }
  }

  async createWallet(dto: CreateWalletDto, outerTx?: Prisma.TransactionClient): Promise<TopUpWallet> {
    const run = async (db: Prisma.TransactionClient): Promise<TopUpWallet> => {
      if (!dto.name || dto.name.trim().length === 0) {
        throw new ValidationError('FlexyOrchestratorService.createWallet: name must be a non-empty string.');
      }
      if (!KNOWN_OPERATORS.has(dto.operator)) {
        throw new ValidationError(
          `FlexyOrchestratorService.createWallet: unknown operator "${dto.operator}" (MOBILIS, DJEZZY, OOREDOO, OTHER).`,
        );
      }
      const opening = dto.openingBalance !== undefined ? parseAmount(dto.openingBalance, 'openingBalance') : Money.zero();
      if (opening.isNegative()) {
        throw new ValidationError('FlexyOrchestratorService.createWallet: openingBalance must be >= 0.');
      }
      const alert = dto.minBalanceAlert !== undefined ? parseAmount(dto.minBalanceAlert, 'minBalanceAlert') : Money.zero();
      if (alert.isNegative()) {
        throw new ValidationError('FlexyOrchestratorService.createWallet: minBalanceAlert must be >= 0.');
      }
      const wallet = await db.topUpWallet.create({
        data: {
          name: dto.name.trim(),
          operator: dto.operator,
          phoneNumber: dto.phoneNumber?.trim() ? dto.phoneNumber.trim() : null,
          balance: opening.to2dp(),
          minBalanceAlert: alert.to2dp(),
          isActive: true,
        },
      });
      await this.audit.record(
        {
          actorUserId: dto.actorUserId,
          action: 'WALLET.CREATE',
          entityType: 'TopUpWallet',
          entityId: wallet.id,
          after: { name: wallet.name, operator: wallet.operator, openingBalance: opening.to2dp() },
        },
        db,
      );
      return wallet;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: 'wallet-create' });
  }

  async fundWallet(dto: FundWalletDto, outerTx?: Prisma.TransactionClient): Promise<FundWalletResult> {
    const run = async (db: Prisma.TransactionClient): Promise<FundWalletResult> => {
      const wallet = await this.requireWallet(dto.walletId, db);
      this.assertActive(wallet);
      const sourceAccount = FUND_SOURCE_ACCOUNT[dto.sourceAccount];
      if (!sourceAccount) {
        throw new ValidationError(`FlexyOrchestratorService.fundWallet: unknown sourceAccount "${dto.sourceAccount}".`);
      }
      if (!dto.actorUserId || dto.actorUserId.trim().length === 0) {
        throw new ValidationError('FlexyOrchestratorService.fundWallet: actorUserId must be a non-empty string.');
      }
      let amount: Money;
      try {
        amount = Money.from(dto.amount);
      } catch {
        throw new ValidationError('FlexyOrchestratorService.fundWallet: amount must be a valid decimal string.', {
          amount: dto.amount,
        });
      }
      if (!amount.isPositive()) {
        throw new ValidationError('FlexyOrchestratorService.fundWallet: amount must be > 0.');
      }
      const posted = await this.posting.post(
        {
          documentType: 'MANUAL',
          description: `Fund wallet ${wallet.name}${dto.notes?.trim() ? `: ${dto.notes.trim()}` : ''}`,
          lines: [
            { accountCode: FLOAT, debit: amount.to2dp(), memo: `Fund ${wallet.name}` },
            { accountCode: sourceAccount, credit: amount.to2dp(), memo: `Fund ${wallet.name}` },
          ],
          postingDate: new Date(),
          actorUserId: dto.actorUserId,
        },
        db,
      );
      const updated = await db.topUpWallet.update({
        where: { id: wallet.id },
        data: { balance: Money.from(wallet.balance).add(amount).to2dp() },
      });
      await this.audit.record(
        {
          actorUserId: dto.actorUserId,
          action: 'WALLET.FUND',
          entityType: 'TopUpWallet',
          entityId: wallet.id,
          after: { amount: amount.to2dp(), sourceAccount: dto.sourceAccount, journalNumber: posted.entryNumber },
        },
        db,
      );
      return { wallet: updated, journalEntryId: posted.id, journalNumber: posted.entryNumber };
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `wallet-fund:${dto.walletId}` });
  }

  async processTopUp(dto: ProcessTopUpDto, outerTx?: Prisma.TransactionClient): Promise<TopUpResult> {
    const run = async (db: Prisma.TransactionClient): Promise<TopUpResult> => {
      const wallet = await this.requireWallet(dto.walletId, db);
      this.assertActive(wallet);
      if (!dto.targetPhoneNumber || dto.targetPhoneNumber.trim().length === 0) {
        throw new ValidationError('FlexyOrchestratorService.processTopUp: targetPhoneNumber must be a non-empty string.');
      }
      if (!dto.actorUserId || dto.actorUserId.trim().length === 0) {
        throw new ValidationError('FlexyOrchestratorService.processTopUp: actorUserId must be a non-empty string.');
      }
      if (dto.paymentMethod !== TOPUP_PAYMENT_MEDIUM.CASH && dto.paymentMethod !== TOPUP_PAYMENT_MEDIUM.ON_ACCOUNT) {
        throw new ValidationError(`FlexyOrchestratorService.processTopUp: unknown paymentMethod "${dto.paymentMethod}".`);
      }
      const face = parseAmount(dto.faceAmount, 'faceAmount');
      if (!face.isPositive()) {
        throw new InvalidFlexyPricingError('FlexyOrchestratorService.processTopUp: faceAmount must be > 0.');
      }
      const cost = dto.costAmount !== undefined ? parseAmount(dto.costAmount, 'costAmount') : face;
      if (cost.isNegative()) {
        throw new InvalidFlexyPricingError('FlexyOrchestratorService.processTopUp: costAmount must be >= 0.');
      }
      const fee = dto.feeAmount !== undefined ? parseAmount(dto.feeAmount, 'feeAmount') : Money.zero();
      if (fee.isNegative()) {
        throw new InvalidFlexyPricingError('FlexyOrchestratorService.processTopUp: feeAmount must be >= 0.');
      }
      const collected = face.add(fee);
      const margin = collected.sub(cost);
      if (margin.isNegative()) {
        throw new InvalidFlexyPricingError(
          `FlexyOrchestratorService.processTopUp: negative margin ${margin.to2dp()} (collected ${collected.to2dp()} < cost ${cost.to2dp()}).`,
        );
      }
      if (Money.from(wallet.balance).lessThan(cost)) {
        throw new InsufficientWalletBalanceError(
          `Float wallet "${wallet.name}" holds ${Money.from(wallet.balance).to2dp()} — top-up needs ${cost.to2dp()}.`,
          { walletId: wallet.id, balance: wallet.balance, cost: cost.to2dp() },
        );
      }

      let partyId: string | null = null;
      if (dto.paymentMethod === TOPUP_PAYMENT_MEDIUM.ON_ACCOUNT) {
        if (!dto.partyId || dto.partyId.trim().length === 0) {
          throw new ValidationError('FlexyOrchestratorService.processTopUp: partyId is required for ON_ACCOUNT top-ups.');
        }
        const party = await this.parties.getParty(dto.partyId, db);
        if (party.type !== 'CUSTOMER' && party.type !== 'BOTH') {
          throw new ValidationError(`FlexyOrchestratorService.processTopUp: party "${party.name}" is not a customer.`, {
            partyId: party.id,
            type: party.type,
          });
        }
        partyId = party.id;
      } else if (dto.partyId) {
        throw new ValidationError('FlexyOrchestratorService.processTopUp: partyId is only valid with ON_ACCOUNT.');
      }

      const updated = await db.topUpWallet.update({
        where: { id: wallet.id },
        data: { balance: Money.from(wallet.balance).sub(cost).to2dp() },
      });
      const transactionNumber = await this.sequences.nextNumber('FLX-', db, 6);
      const posted = await this.posting.post(
        {
          documentType: 'SALE_INVOICE',
          description: `Flexy top-up ${transactionNumber} → ${dto.targetPhoneNumber.trim()}`,
          lines: [
            dto.paymentMethod === TOPUP_PAYMENT_MEDIUM.CASH
              ? { accountCode: CASH, debit: collected.to2dp() }
              : { accountCode: AR_CONTROL, debit: collected.to2dp(), partyId: partyId as string },
            { accountCode: FLOAT, credit: cost.to2dp() },
            ...(margin.isPositive() ? [{ accountCode: FLEXY_MARGIN, credit: margin.to2dp() }] : []),
          ],
          postingDate: new Date(),
          actorUserId: dto.actorUserId,
        },
        db,
      );
      if (dto.paymentMethod === TOPUP_PAYMENT_MEDIUM.ON_ACCOUNT && partyId) {
        const arLeg = posted.lines.find((line) => line.accountCode === AR_CONTROL);
        if (!arLeg) {
          throw new ValidationError('Flexy top-up journal is missing its AR leg.', { journalEntryId: posted.id });
        }
        await this.subledger.recordSubledgerEntry(
          {
            partyId,
            journalLineId: arLeg.id,
            entryType: 'INVOICE_CHARGE',
            amount: collected,
            isDebit: true,
            actorUserId: dto.actorUserId,
          },
          db,
        );
      }
      const transaction = await db.digitalServiceTransaction.create({
        data: {
          transactionNumber,
          walletId: wallet.id,
          serviceType: 'FLEXY',
          targetPhoneNumber: dto.targetPhoneNumber.trim(),
          faceAmount: face.to2dp(),
          costAmount: cost.to2dp(),
          feeAmount: fee.to2dp(),
          collectedAmount: collected.to2dp(),
          marginAmount: margin.to2dp(),
          paymentMethod: dto.paymentMethod,
          partyId,
          journalEntryId: posted.id,
          actorUserId: dto.actorUserId,
        },
      });
      await this.audit.record(
        {
          actorUserId: dto.actorUserId,
          action: 'FLEXY.TOPUP',
          entityType: 'DigitalServiceTransaction',
          entityId: transaction.id,
          after: {
            transactionNumber,
            collectedAmount: collected.to2dp(),
            marginAmount: margin.to2dp(),
            journalNumber: posted.entryNumber,
          },
        },
        db,
      );
      return { transaction, wallet: updated, journalEntryId: posted.id, journalNumber: posted.entryNumber };
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `flexy-topup:${dto.walletId}` });
  }

  async transferFloat(dto: TransferFloatDto, outerTx?: Prisma.TransactionClient): Promise<FloatTransferResult> {
    const run = async (db: Prisma.TransactionClient): Promise<FloatTransferResult> => {
      const sourceAccount = LIQUIDITY_ACCOUNT[dto.sourceAccountType];
      const targetAccount = LIQUIDITY_ACCOUNT[dto.targetAccountType];
      if (!sourceAccount || !targetAccount) {
        throw new InvalidFloatTransferError(
          `Unknown float leg "${!sourceAccount ? dto.sourceAccountType : dto.targetAccountType}" (CASH, BANK, WALLET).`,
        );
      }
      if (dto.sourceAccountType === dto.targetAccountType) {
        throw new InvalidFloatTransferError('Float transfer source and target must differ.', {
          sourceAccountType: dto.sourceAccountType,
        });
      }
      if ((dto.sourceWalletId ? 1 : 0) !== (dto.sourceAccountType === ACCOUNT_LIQUIDITY_TYPE.WALLET ? 1 : 0)) {
        throw new InvalidFloatTransferError('sourceWalletId is required exactly when the source leg is WALLET.');
      }
      if ((dto.targetWalletId ? 1 : 0) !== (dto.targetAccountType === ACCOUNT_LIQUIDITY_TYPE.WALLET ? 1 : 0)) {
        throw new InvalidFloatTransferError('targetWalletId is required exactly when the target leg is WALLET.');
      }
      if (!dto.reason || dto.reason.trim().length === 0) {
        throw new InvalidFloatTransferError('Float transfer requires a non-empty reason.');
      }
      if (!dto.actorUserId || dto.actorUserId.trim().length === 0) {
        throw new ValidationError('FlexyOrchestratorService.transferFloat: actorUserId must be a non-empty string.');
      }
      let amount: Money;
      try {
        amount = Money.from(dto.amount);
      } catch {
        throw new InvalidFloatTransferError('Float transfer amount must be a valid decimal string.', { amount: dto.amount });
      }
      if (!amount.isPositive()) {
        throw new InvalidFloatTransferError('Float transfer amount must be > 0.');
      }

      if (dto.sourceWalletId) {
        const source = await this.requireWallet(dto.sourceWalletId, db);
        this.assertActive(source);
        if (Money.from(source.balance).lessThan(amount)) {
          throw new InsufficientWalletBalanceError(
            `Float wallet "${source.name}" holds ${Money.from(source.balance).to2dp()} — transfer needs ${amount.to2dp()}.`,
            { walletId: source.id, balance: source.balance, amount: amount.to2dp() },
          );
        }
        await db.topUpWallet.update({
          where: { id: source.id },
          data: { balance: Money.from(source.balance).sub(amount).to2dp() },
        });
      }
      if (dto.targetWalletId) {
        const target = await this.requireWallet(dto.targetWalletId, db);
        this.assertActive(target);
        await db.topUpWallet.update({
          where: { id: target.id },
          data: { balance: Money.from(target.balance).add(amount).to2dp() },
        });
      }

      const posted = await this.posting.post(
        {
          documentType: 'MANUAL',
          description: `Transfer ${amount.to2dp()} from ${dto.sourceAccountType} to ${dto.targetAccountType}: ${dto.reason.trim()}`,
          lines: [
            { accountCode: targetAccount, debit: amount.to2dp(), memo: `Float in ${dto.targetAccountType}` },
            { accountCode: sourceAccount, credit: amount.to2dp(), memo: `Float out ${dto.sourceAccountType}` },
          ],
          postingDate: new Date(),
          actorUserId: dto.actorUserId,
        },
        db,
      );
      const transferNumber = await this.sequences.nextNumber('TRF-', db, 6);
      const record = await db.floatTransferRecord.create({
        data: {
          transferNumber,
          sourceAccountType: dto.sourceAccountType,
          sourceWalletId: dto.sourceWalletId ?? null,
          targetAccountType: dto.targetAccountType,
          targetWalletId: dto.targetWalletId ?? null,
          amount: amount.to2dp(),
          journalEntryId: posted.id,
          reason: dto.reason.trim(),
          actorUserId: dto.actorUserId,
        },
      });
      await this.audit.record(
        {
          actorUserId: dto.actorUserId,
          action: 'WALLET.TRANSFER',
          entityType: 'FloatTransferRecord',
          entityId: record.id,
          after: { transferNumber, amount: amount.to2dp(), journalNumber: posted.entryNumber },
        },
        db,
      );
      return { record, journalEntryId: posted.id, journalNumber: posted.entryNumber };
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: 'wallet-transfer' });
  }

  /**
   * DIRECTIVE-019 Stage 9.2 — wallet directory for `GET /api/v3/flexy/wallets`.
   *
   * All float wallets with operator, phone, live balance and active flag,
   * ordered by name. Read-only: joins the caller tx or reads directly.
   */
  async listWallets(outerTx?: Prisma.TransactionClient): Promise<TopUpWallet[]> {
    const db = outerTx ?? (this.prisma as unknown as Prisma.TransactionClient);
    return db.topUpWallet.findMany({ orderBy: { name: 'asc' } });
  }
}
