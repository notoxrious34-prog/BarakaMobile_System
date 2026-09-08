import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

/**
 * Offline self-healing migration repair (desktop hotfix).
 *
 * Production userData databases created by older installers never received
 * `prisma migrate deploy` for newer migrations (e.g. Migration 20 `User`),
 * deadlocking auth with a masked SQLite error. On every boot this routine:
 *   1. Reads the applied list from `_prisma_migrations` (skips entirely if the
 *      table itself is absent — a non-pipeline database we must not touch).
 *   2. Applies each bundled-but-missing `migration.sql` statement-by-statement
 *      (our generated files contain plain DDL, no triggers — naive split safe).
 *   3. Records a proper `_prisma_migrations` row (sha256 checksum of the file,
 *      matching `migrate deploy` semantics so future deploys stay consistent).
 */
export async function repairPendingMigrations(
  prisma: PrismaClient,
  migrationsDir: string,
): Promise<{ applied: string[]; skipped: string | null }> {
  if (!migrationsDir || !existsSync(migrationsDir)) {
    return { applied: [], skipped: `migrations dir not found: ${migrationsDir}` };
  }

  let appliedNames: Set<string>;
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
    `;
    appliedNames = new Set(rows.map((r) => r.migration_name));
  } catch (e) {
    // No migrations ledger — not a pipeline database. Never touch it.
    console.warn(
      '[SchemaRepair] _prisma_migrations absent, skipping repair:',
      e instanceof Error ? e.message : e,
    );
    return { applied: [], skipped: 'no migrations ledger' };
  }

  const bundled = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const pending = bundled.filter((name) => !appliedNames.has(name));
  if (pending.length === 0) return { applied: [], skipped: null };

  console.log(`[SchemaRepair] ${pending.length} pending migration(s): ${pending.join(', ')}`);
  const applied: string[] = [];
  for (const name of pending) {
    const sqlPath = join(migrationsDir, name, 'migration.sql');
    if (!existsSync(sqlPath)) {
      throw new Error(`[SchemaRepair] migration.sql missing for ${name}`);
    }
    const sql = readFileSync(sqlPath, 'utf8');
    const statements = sql
      .split(/;[\r\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== ';');
    const started = new Date();
    try {
      for (const stmt of statements) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await prisma.$executeRawUnsafe(stmt.endsWith(';') ? stmt : `${stmt};`);
        } catch (stmtErr) {
          const stmtMsg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
          // Idempotency: partially-applied migrations (or overlapping ALTERs
          // from legacy seeds) re-encounter existing schema objects. Only
          // these benign SQLite conflicts are tolerated — anything else fails hard.
          if (/duplicate column name|already exists/i.test(stmtMsg)) {
            console.warn(`[SchemaRepair] ${name}: skipping no-op (${stmtMsg.split('\n').pop()})`);
            continue;
          }
          throw stmtErr;
        }
      }
      const checksum = createHash('sha256').update(sql, 'utf8').digest('hex');
      const finished = new Date();
      await prisma.$executeRawUnsafe(
        `INSERT INTO _prisma_migrations (id, migration_name, checksum, started_at, finished_at, logs, applied_steps_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        name,
        checksum,
        started.toISOString(),
        finished.toISOString(),
        '',
        statements.length,
      );
      applied.push(name);
      console.log(`[SchemaRepair] applied ${name} (${statements.length} steps)`);
    } catch (e) {
      // Unmasked: exact migration + statement failure, never a bare 500.
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`[SchemaRepair] FAILED applying ${name}: ${msg}`);
    }
  }
  return { applied, skipped: null };
}

/** Resolve the bundled migrations directory (packaged Electron vs dev). */
export function resolveMigrationsDir(): string {
  const fromEnv = process.env.PRISMA_MIGRATIONS_DIR;
  if (fromEnv) return fromEnv;
  // Dev fallback: <repo>/packages/backend/prisma/migrations (cwd-agnostic).
  return join(__dirname, '..', '..', 'prisma', 'migrations');
}
