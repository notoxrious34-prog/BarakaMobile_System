import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Party } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Money } from '../core/money';
import { NotFoundError, ValidationError } from '../core/result';
import { TransactionOrchestrator } from '../core/transaction-orchestrator';
import { AuditService } from '../core/audit.service';

/**
 * TASK BRIEF-013 Stage 4 — party master data (v3.0 parties domain).
 *
 * `Party` replaces the v2.x `Contact + dual Account` split with a single
 * identity per counterparty (CUSTOMER, SUPPLIER, BOTH). Balances live on
 * append-only `PartySubledgerEntry` chains — this service owns the master
 * row only; `PartySubledgerService` owns the money movement.
 */

export type PartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';

const PARTY_TYPES: readonly string[] = ['CUSTOMER', 'SUPPLIER', 'BOTH'];

export interface CreatePartyParams {
  name: string;
  phone?: string;
  address?: string;
  type: PartyType;
  creditLimit?: string | Money;
  actorUserId?: string;
}

function toMoney(value: string | Money, what: string): Money {
  if (value instanceof Money) return value;
  try {
    return Money.from(value);
  } catch {
    throw new ValidationError(`PartiesService: ${what} is not a valid amount.`, { value });
  }
}

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: TransactionOrchestrator,
    private readonly audit: AuditService,
  ) {}

  private db(tx?: Prisma.TransactionClient): Prisma.TransactionClient {
    return tx ?? (this.prisma as unknown as Prisma.TransactionClient);
  }

  async createParty(params: CreatePartyParams, outerTx?: Prisma.TransactionClient): Promise<Party> {
    const name = (params.name ?? '').trim();
    if (name.length < 2) {
      throw new ValidationError('PartiesService.createParty: name must be at least 2 characters.');
    }
    if (!PARTY_TYPES.includes(params.type)) {
      throw new ValidationError(
        `PartiesService.createParty: type must be one of ${PARTY_TYPES.join(', ')}.`,
      );
    }
    const limit = toMoney(params.creditLimit ?? '0.00', 'creditLimit');
    if (limit.isNegative()) {
      throw new ValidationError('PartiesService.createParty: creditLimit must be >= 0 (0 = unlimited).');
    }

    const run = async (db: Prisma.TransactionClient): Promise<Party> => {
      const party = await db.party.create({
        data: {
          name,
          phone: params.phone?.trim() ? params.phone.trim() : null,
          address: params.address?.trim() ? params.address.trim() : null,
          type: params.type,
          creditLimit: limit.to2dp(),
        },
      });
      if (params.actorUserId) {
        await this.audit.record(
          {
            actorUserId: params.actorUserId,
            action: 'PARTY.CREATE',
            entityType: 'Party',
            entityId: party.id,
            after: { name, type: params.type, creditLimit: limit.to2dp() },
          },
          db,
        );
      }
      return party;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: 'party-create' });
  }

  async getParty(partyId: string, tx?: Prisma.TransactionClient): Promise<Party> {
    if (!partyId || partyId.trim().length === 0) {
      throw new ValidationError('PartiesService.getParty: partyId must be a non-empty string.');
    }
    const party = await this.db(tx).party.findUnique({ where: { id: partyId } });
    if (!party) {
      throw new NotFoundError(`Party "${partyId}" not found.`, { partyId });
    }
    return party;
  }

  async listParties(type?: string, tx?: Prisma.TransactionClient): Promise<Party[]> {
    let where: { type?: string } = {};
    if (type !== undefined) {
      const normalized = type.trim().toUpperCase();
      if (!PARTY_TYPES.includes(normalized)) {
        throw new ValidationError(
          `PartiesService.listParties: unknown type "${type}" (expected one of ${PARTY_TYPES.join(', ')}).`,
        );
      }
      where = { type: normalized };
    }
    return this.db(tx).party.findMany({ where, orderBy: { name: 'asc' } });
  }

  async updateCreditLimit(
    partyId: string,
    newLimit: string | Money,
    actorUserId?: string,
    outerTx?: Prisma.TransactionClient,
  ): Promise<Party> {
    const limit = toMoney(newLimit, 'newLimit');
    if (limit.isNegative()) {
      throw new ValidationError('PartiesService.updateCreditLimit: newLimit must be >= 0 (0 = unlimited).');
    }

    const run = async (db: Prisma.TransactionClient): Promise<Party> => {
      const party = await this.getParty(partyId, db);
      const before = party.creditLimit;
      const updated = await db.party.update({
        where: { id: party.id },
        data: { creditLimit: limit.to2dp() },
      });
      if (actorUserId) {
        await this.audit.record(
          {
            actorUserId,
            action: 'PARTY.CREDIT_LIMIT',
            entityType: 'Party',
            entityId: party.id,
            before: { creditLimit: before },
            after: { creditLimit: limit.to2dp() },
          },
          db,
        );
      }
      return updated;
    };

    if (outerTx) return run(outerTx);
    return this.orchestrator.run((otx) => run(otx), { operationName: `party-limit:${partyId}` });
  }

  /**
   * Latest subledger `balanceAfter` snapshot. No entries → Money.zero().
   * (No existence check by design: unknown parties simply have no balance.)
   */
  async getPartyBalance(partyId: string, tx?: Prisma.TransactionClient): Promise<Money> {
    if (!partyId || partyId.trim().length === 0) {
      throw new ValidationError('PartiesService.getPartyBalance: partyId must be a non-empty string.');
    }
    const latest = await this.db(tx).partySubledgerEntry.findFirst({
      where: { partyId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return Money.zero();
    return Money.from(latest.balanceAfter);
  }
}
