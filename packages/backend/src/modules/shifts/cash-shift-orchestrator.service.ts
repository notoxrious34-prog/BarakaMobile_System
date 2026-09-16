import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CashRegister, CashShift, ShiftCashMovement } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Money } from '../../core/money';
import { NotFoundError, ValidationError } from '../../core/result';
import { TransactionOrchestrator } from '../../core/transaction-orchestrator';
import { DocumentNumberService } from '../../core/document-number.service';
import { AuditService } from '../../core/audit.service';
import { PostingService } from '../../accounting/posting.service';
import {
  ActiveShiftExistsError,
  InvalidCashCountError,
  InvalidCashMovementError,
  ShiftClosedError,
  ShiftNotFoundError,
} from './shifts.errors';
import { SHIFT_MOVEMENT_TYPE, SHIFT_STATUS } from './shifts.types';
import type { CloseShiftDto } from './dto/close-shift.dto';
import type { OpenShiftDto } from './dto/open-shift.dto';
import type { RecordMovementDto } from './dto/record-movement.dto';

/**
 * DIRECTIVE-015 Stage 7.1 — POS shift lifecycle (v3.0 cash registers).
 *
 * Owns the drawer ledger: shift open (starting float), drawer movements
 * (in / out / petty-cash with an EXPENSE journal leg), and close with
 * physical-count reconciliation (overage/shortage MANUAL journals, shift
 * lock, register release). Every public method runs in the caller's `tx`
 * or a fresh orchestrator transaction — partial drawer writes are
 * impossible.
 *
 * COA map (committed chart):
 *  - 10000 Cash on Hand (drawer), 50400 General & Admin Expenses,
 *    40400 Other Income (cash overage), 50300 Cash Shortage Expense.
 * Petty-cash journals use documentType 'EXPENSE'; discrepancy journals
 * use 'MANUAL' — both touch non-control accounts only, so the Stage 2.2
 * control guard never fires.
 *
 * NOTE: there is no register-provisioning service in this stage — the
 * `CashRegister` row is master data seeded by deployment/migration seed
 * (the suite seeds it through the Prisma delegate, exactly as a seed
 * script would). `totalSalesCash` has no writer yet: counter-sale and
 * repair-delivery settlement post to 10000/10100/10200 but do not yet
 * attribute cash to the open shift — that attribution is a forward
 * integration, and `expectedCash` already includes the leg.
 */

export interface ShiftDetailsResult {
  shift: CashShift;
  register: CashRegister;
  movements: ShiftCashMovement[];
  totals: {
    openingCash: string;
    totalCashIn: string;
    totalCashOut: string;
    totalSalesCash: string;
    expectedCash: string;
    actualCash: string | null;
    differenceAmount: string;
  };
}

const CASH_ON_HAND = '10000';
const EXPENSE_GENERAL = '50400';
const OVERAGE_REVENUE = '40400';
const SHORTAGE_EXPENSE = '50300';

const KNOWN_MOVEMENTS = new Set<string>(Object.values(SHIFT_MOVEMENT_TYPE));

function toMoney(value: string, what: string): Money {
  try {
    return Money.from(value);
  } catch {
    throw new InvalidCashCountError(`CashShiftOrchestratorService: ${what} is not a valid amount.`, { value });
  }
}

function expectedCashOf(opening: Money, sales: Money, cashIn: Money, cashOut: Money): Money {
  return opening.add(sales).add(cashIn).sub(cashOut);
}

@Injectable()
export class CashShiftOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly sequences: DocumentNumberService,
    private readonly posting: PostingService,
    private readonly audit: AuditService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  private async requireRegister(registerId: string, db: Prisma.TransactionClient): Promise<CashRegister> {
    if (!registerId || registerId.trim().length === 0) {
      throw new ValidationError('CashShiftOrchestratorService: registerId must be a non-empty string.');
    }
    const register = await db.cashRegister.findUnique({ where: { id: registerId } });
    if (!register) {
      throw new NotFoundError(`Cash register "${registerId}" not found.`, { registerId });
    }
    return register;
  }

  private async requireShift(shiftId: string, db: Prisma.TransactionClient): Promise<CashShift> {
    if (!shiftId || shiftId.trim().length === 0) {
      throw new ValidationError('CashShiftOrchestratorService: shiftId must be a non-empty string.');
    }
    const shift = await db.cashShift.findUnique({ where: { id: shiftId } });
    if (!shift) {
      throw new ShiftNotFoundError(`Cash shift "${shiftId}" not found.`, { shiftId });
    }
    return shift;
  }

  private assertOpen(shift: CashShift): void {
    if (shift.status !== SHIFT_STATUS.OPEN) {
      throw new ShiftClosedError(
        `Cash shift ${shift.shiftNumber} is ${shift.status} — drawer movements are locked.`,
        { shiftId: shift.id, status: shift.status },
      );
    }
  }

  async openShift(dto: OpenShiftDto, outerTx?: Prisma.TransactionClient): Promise<CashShift> {
    const run = async (db: Prisma.TransactionClient): Promise<CashShift> => {
      const register = await this.requireRegister(dto.registerId, db);
      if (!register.isActive) {
        throw new ValidationError(`Cash register "${register.name}" is inactive — shifts are blocked.`, {
          registerId: register.id,
        });
      }
      if (register.currentShiftId !== null) {
        throw new ActiveShiftExistsError(
          `Cash register "${register.name}" already has an active shift — close it before opening a new one.`,
          { registerId: register.id, currentShiftId: register.currentShiftId },
        );
      }
      if (!dto.cashierUserId || dto.cashierUserId.trim().length === 0) {
        throw new ValidationError('CashShiftOrchestratorService.openShift: cashierUserId must be a non-empty string.');
      }
      const opening = toMoney(dto.openingCash, 'openingCash');
      if (opening.isNegative()) {
        throw new InvalidCashCountError('CashShiftOrchestratorService.openShift: openingCash must be >= 0.', {
          openingCash: dto.openingCash,
        });
      }
      const shiftNumber = await this.sequences.nextNumber('SHF-', db, 6);
      const shift = await db.cashShift.create({
        data: {
          shiftNumber,
          registerId: register.id,
          cashierUserId: dto.cashierUserId,
          status: SHIFT_STATUS.OPEN,
          openingCash: opening.to2dp(),
          totalCashIn: '0.00',
          totalCashOut: '0.00',
          totalSalesCash: '0.00',
          expectedCash: opening.to2dp(),
          differenceAmount: '0.00',
          notes: dto.notes?.trim() ? dto.notes.trim() : null,
        },
      });
      await db.cashRegister.update({ where: { id: register.id }, data: { currentShiftId: shift.id } });
      await this.audit.record(
        {
          action: 'SHIFT.OPEN',
          entityType: 'CashShift',
          entityId: shift.id,
          after: { shiftNumber, registerId: register.id, openingCash: opening.to2dp() },
        },
        db,
      );
      return shift;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `shift-open:${dto.registerId}` });
  }

  async recordMovement(dto: RecordMovementDto, outerTx?: Prisma.TransactionClient): Promise<ShiftCashMovement> {
    const run = async (db: Prisma.TransactionClient): Promise<ShiftCashMovement> => {
      const shift = await this.requireShift(dto.shiftId, db);
      this.assertOpen(shift);
      if (!KNOWN_MOVEMENTS.has(dto.movementType)) {
        throw new InvalidCashMovementError(`Unknown drawer movement type "${dto.movementType}".`, {
          movementType: dto.movementType,
        });
      }
      let amount: Money;
      try {
        amount = Money.from(dto.amount);
      } catch {
        throw new InvalidCashMovementError('Drawer movement amount must be a valid decimal string.', {
          amount: dto.amount,
        });
      }
      if (!amount.isPositive()) {
        throw new InvalidCashMovementError('Drawer movement amount must be > 0.', { amount: dto.amount });
      }
      if (!dto.reason || dto.reason.trim().length === 0) {
        throw new InvalidCashMovementError('Drawer movement requires a non-empty reason.');
      }
      if (!dto.actorUserId || dto.actorUserId.trim().length === 0) {
        throw new ValidationError('CashShiftOrchestratorService.recordMovement: actorUserId must be a non-empty string.');
      }

      let journalEntryId: string | null = null;
      if (dto.movementType === SHIFT_MOVEMENT_TYPE.PETTY_CASH) {
        const posted = await this.posting.post(
          {
            documentType: 'EXPENSE',
            description: `Petty cash: ${dto.reason.trim()} (shift ${shift.shiftNumber})`,
            lines: [
              { accountCode: EXPENSE_GENERAL, debit: amount.to2dp(), memo: `Petty cash ${shift.shiftNumber}` },
              { accountCode: CASH_ON_HAND, credit: amount.to2dp(), memo: `Petty cash ${shift.shiftNumber}` },
            ],
            postingDate: new Date(),
            actorUserId: dto.actorUserId,
          },
          db,
        );
        journalEntryId = posted.id;
      }

      const movement = await db.shiftCashMovement.create({
        data: {
          shiftId: shift.id,
          movementType: dto.movementType,
          amount: amount.to2dp(),
          reason: dto.reason.trim(),
          actorUserId: dto.actorUserId,
          journalEntryId,
        },
      });

      const cashIn = Money.from(shift.totalCashIn);
      const cashOut = Money.from(shift.totalCashOut);
      const nextIn = dto.movementType === SHIFT_MOVEMENT_TYPE.DRAWER_IN ? cashIn.add(amount) : cashIn;
      const nextOut = dto.movementType === SHIFT_MOVEMENT_TYPE.DRAWER_IN ? cashOut : cashOut.add(amount);
      const expected = expectedCashOf(Money.from(shift.openingCash), Money.from(shift.totalSalesCash), nextIn, nextOut);
      await db.cashShift.update({
        where: { id: shift.id },
        data: {
          totalCashIn: nextIn.to2dp(),
          totalCashOut: nextOut.to2dp(),
          expectedCash: expected.to2dp(),
        },
      });
      await this.audit.record(
        {
          actorUserId: dto.actorUserId,
          action: 'SHIFT.MOVEMENT',
          entityType: 'ShiftCashMovement',
          entityId: movement.id,
          after: { shiftId: shift.id, movementType: dto.movementType, amount: amount.to2dp(), journalEntryId },
        },
        db,
      );
      return movement;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `shift-movement:${dto.shiftId}` });
  }

  async closeShift(dto: CloseShiftDto, outerTx?: Prisma.TransactionClient): Promise<CashShift> {
    const run = async (db: Prisma.TransactionClient): Promise<CashShift> => {
      const shift = await this.requireShift(dto.shiftId, db);
      this.assertOpen(shift);
      if (!dto.actorUserId || dto.actorUserId.trim().length === 0) {
        throw new ValidationError('CashShiftOrchestratorService.closeShift: actorUserId must be a non-empty string.');
      }
      const actual = toMoney(dto.actualCash, 'actualCash');
      if (actual.isNegative()) {
        throw new InvalidCashCountError('CashShiftOrchestratorService.closeShift: actualCash must be >= 0.', {
          actualCash: dto.actualCash,
        });
      }
      const expected = expectedCashOf(
        Money.from(shift.openingCash),
        Money.from(shift.totalSalesCash),
        Money.from(shift.totalCashIn),
        Money.from(shift.totalCashOut),
      );
      const difference = actual.sub(expected);

      let discrepancyJournalId: string | null = null;
      if (difference.isPositive()) {
        const posted = await this.posting.post(
          {
            documentType: 'MANUAL',
            description: `Shift ${shift.shiftNumber} cash overage`,
            lines: [
              { accountCode: CASH_ON_HAND, debit: difference.to2dp(), memo: `Shift ${shift.shiftNumber} overage` },
              { accountCode: OVERAGE_REVENUE, credit: difference.to2dp(), memo: `Shift ${shift.shiftNumber} overage` },
            ],
            postingDate: new Date(),
            actorUserId: dto.actorUserId,
          },
          db,
        );
        discrepancyJournalId = posted.id;
      } else if (difference.isNegative()) {
        const shortage = difference.abs();
        const posted = await this.posting.post(
          {
            documentType: 'MANUAL',
            description: `Shift ${shift.shiftNumber} cash shortage`,
            lines: [
              { accountCode: SHORTAGE_EXPENSE, debit: shortage.to2dp(), memo: `Shift ${shift.shiftNumber} shortage` },
              { accountCode: CASH_ON_HAND, credit: shortage.to2dp(), memo: `Shift ${shift.shiftNumber} shortage` },
            ],
            postingDate: new Date(),
            actorUserId: dto.actorUserId,
          },
          db,
        );
        discrepancyJournalId = posted.id;
      }

      const closed = await db.cashShift.update({
        where: { id: shift.id },
        data: {
          status: SHIFT_STATUS.CLOSED,
          closedAt: new Date(),
          expectedCash: expected.to2dp(),
          actualCash: actual.to2dp(),
          differenceAmount: difference.to2dp(),
          discrepancyJournalId,
          notes: dto.notes?.trim() ? dto.notes.trim() : shift.notes,
        },
      });
      await db.cashRegister.update({ where: { id: shift.registerId }, data: { currentShiftId: null } });
      await this.audit.record(
        {
          actorUserId: dto.actorUserId,
          action: 'SHIFT.CLOSE',
          entityType: 'CashShift',
          entityId: shift.id,
          after: {
            shiftNumber: shift.shiftNumber,
            expectedCash: expected.to2dp(),
            actualCash: actual.to2dp(),
            differenceAmount: difference.to2dp(),
            discrepancyJournalId,
          },
        },
        db,
      );
      return closed;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `shift-close:${dto.shiftId}` });
  }

  /**
   * DIRECTIVE-019 Stage 9.2 — shift read models.
   *
   * `getActiveShift` resolves the register's `currentShiftId` pointer
   * (null when no shift is open); `getShiftDetails` returns the shift
   * with its register, ordered movements and drawer totals snapshot.
   * Read-only: joins the caller tx or reads directly.
   */
  async getActiveShift(registerId: string, tx?: Prisma.TransactionClient): Promise<ShiftDetailsResult | null> {
    const db = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    const register = await this.requireRegister(registerId, db);
    if (!register.currentShiftId) return null;
    return this.getShiftDetails(register.currentShiftId, db);
  }

  async getShiftDetails(shiftId: string, tx?: Prisma.TransactionClient): Promise<ShiftDetailsResult> {
    const db = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    const shift = await this.requireShift(shiftId, db);
    const register = await this.requireRegister(shift.registerId, db);
    const movements = await db.shiftCashMovement.findMany({
      where: { shiftId: shift.id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      shift,
      register,
      movements,
      totals: {
        openingCash: shift.openingCash,
        totalCashIn: shift.totalCashIn,
        totalCashOut: shift.totalCashOut,
        totalSalesCash: shift.totalSalesCash,
        expectedCash: shift.expectedCash,
        actualCash: shift.actualCash,
        differenceAmount: shift.differenceAmount,
      },
    };
  }
}
