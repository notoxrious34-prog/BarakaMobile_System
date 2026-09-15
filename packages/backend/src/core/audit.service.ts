import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from './result';

/**
 * TASK BRIEF-008 Stage 1.2 — immutable audit trail (v3.0 foundation).
 *
 * `AuditLog` rows are insert-only: this service exposes NO update/delete
 * path. `before`/`after` snapshots serialize to JSON safely (circular
 * structures degrade to a string marker instead of throwing).
 * Pass the caller's `tx` so the audit row commits atomically with the
 * mutation it describes.
 */
export interface AuditEntry {
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId: string;
  correlationId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ipAddress?: string;
}

function toJson(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  try {
    const serialized: string | undefined = JSON.stringify(value);
    return serialized === undefined ? undefined : serialized;
  } catch {
    try {
      return JSON.stringify(`[unserializable:${String(value)}]`);
    } catch {
      return undefined;
    }
  }
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<AuditLog> {
    if (!entry.action || entry.action.trim().length === 0) {
      throw new ValidationError('AuditService.record: action must be a non-empty string.');
    }
    if (!entry.entityType || entry.entityType.trim().length === 0) {
      throw new ValidationError('AuditService.record: entityType must be a non-empty string.');
    }
    if (!entry.entityId || entry.entityId.trim().length === 0) {
      throw new ValidationError('AuditService.record: entityId must be a non-empty string.');
    }
    const db: Prisma.TransactionClient = tx ?? (this.prisma as unknown as Prisma.TransactionClient);
    return db.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        correlationId: entry.correlationId ?? null,
        beforeJson: toJson(entry.before) ?? null,
        afterJson: toJson(entry.after) ?? null,
        reason: entry.reason ?? null,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }
}
