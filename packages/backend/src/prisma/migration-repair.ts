import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface BootMigrationResult {
  applied: string[];
  skipped: string | null;
}

/**
 * DEF-DESK-BOOT-MIGRATE — Atomic Boot-Migration Engine (zero external deps).
 *
 * Packaged Electron boots against a userData SQLite file created by an older
 * installer, so pending `prisma/migrations` MUST be applied before the HTTP
 * server binds its port (see `src/main.ts`: this runner executes strictly
 * BEFORE `app.listen`, and any failure aborts the boot via `process.exit(1)`
 * so the desktop shell surfaces an explicit startup error instead of serving
 * a schema-inconsistent API).
 *
 * Prisma-ledger compatibility (table `_prisma_migrations`, sha256 checksum of
 * the raw `migration.sql` bytes, started/finished timestamps, migration name,
 * applied-steps count) is preserved, so `prisma migrate deploy` stays fully
 * synchronized with databases healed by this runner.
 *
 * Atomicity: every pending migration runs inside ONE interactive Prisma
 * transaction (same SQLite connection for all statements + the ledger row).
 * A statement failure rolls the whole migration back and aborts the boot —
 * the database is never left half-migrated.
 */

const SELECT_LIKE = /^\s*(SELECT|WITH|VALUES|EXPLAIN|PRAGMA)\b/i;
const PRAGMA_STMT = /^\s*PRAGMA\b/i;
/** CREATE/DROP objects that are safe to skip when already (un)applied. */
const IDEMPOTENT_DDL = /^\s*(CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+(INDEX|TABLE))\b/i;
const BENIGN_CONFLICT = /already exists|duplicate column name|no such (table|index|column)/i;

/**
 * Split a `migration.sql` file into executable statements.
 *
 * The previous naive `split(/;[\r\n]+/)` broke on `;` inside string
 * literals (e.g. `WHERE "type" = 'OPENING_BALANCE';` continuations) and on
 * comment-embedded semicolons. This splitter strips `--` line comments and
 * `/* … *\/` blocks and splits on `;` only outside `'...'`/`"..."` literals
 * (with `''` escape handling), matching Prisma's statement semantics for
 * our generated DDL-only files.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  const n = sql.length;
  let inSingle = false;
  let inDouble = false;

  const push = () => {
    const stmt = current.trim();
    if (stmt.length > 0 && stmt !== ';') statements.push(stmt.endsWith(';') ? stmt : `${stmt};`);
    current = '';
  };

  while (i < n) {
    const ch = sql[i];
    const next = i + 1 < n ? sql[i + 1] : '';
    if (inSingle) {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i += 1;
      continue;
    }
    if (inDouble) {
      current += ch;
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }
    // Outside literals: comments, quotes, statement terminator.
    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && i + 1 < n && sql[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === ';') {
      current += ch;
      push();
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  push();
  return statements;
}

/**
 * Ledger checksum: sha256 hex of the raw `migration.sql` file bytes.
 * Verified byte-identical to the checksums `prisma migrate deploy` recorded
 * in production seed databases for every migration at HEAD.
 */
export function checksumMigrationSql(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

type RawClient = Pick<PrismaClient, '$queryRaw' | '$executeRawUnsafe' | '$queryRawUnsafe' | '$transaction'>;

async function executeStatement(tx: RawClient, stmt: string): Promise<void> {
  if (SELECT_LIKE.test(stmt)) {
    await tx.$queryRawUnsafe(stmt);
    return;
  }
  await tx.$executeRawUnsafe(stmt);
}

export async function repairPendingMigrations(
  prisma: PrismaClient,
  migrationsDir: string,
): Promise<BootMigrationResult> {
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
      '[BootMigration] _prisma_migrations absent, skipping repair:',
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

  console.log(`[BootMigration] ${pending.length} pending migration(s): ${pending.join(', ')}`);
  const applied: string[] = [];
  for (const name of pending) {
    const sqlPath = join(migrationsDir, name, 'migration.sql');
    if (!existsSync(sqlPath)) {
      throw new Error(`[BootMigration] migration.sql missing for ${name}`);
    }
    const sql = readFileSync(sqlPath, 'utf8');
    const all = splitSqlStatements(sql);
    // RedefineTables envelope PRAGMAs (defer_foreign_keys/foreign_keys
    // toggles) are connection-scoped no-ops inside an explicit transaction —
    // the interactive transaction below already gives us atomicity on a
    // single connection, and our seeds carry consistent FK data, so the
    // toggles are skipped while every real DDL/DML statement is applied.
    const statements = all.filter((s) => !PRAGMA_STMT.test(s));
    const started = new Date();
    const startedIso = started.toISOString();
    console.log(`[BootMigration] applying ${name} (${statements.length} steps)…`);
    try {
      await (prisma as unknown as RawClient).$transaction(
        async (tx) => {
          for (const stmt of statements) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await executeStatement(tx as unknown as RawClient, stmt);
            } catch (stmtErr) {
              const stmtMsg = stmtErr instanceof Error ? stmtErr.message : String(stmtErr);
              // Idempotency: re-encountering existing schema objects (or
              // dropping already-absent ones) on CREATE/DROP DDL is a benign
              // no-op. Anything else fails the whole migration hard so the
              // transaction rolls back and the boot aborts — never a
              // half-applied schema.
              if (IDEMPOTENT_DDL.test(stmt) && BENIGN_CONFLICT.test(stmtMsg)) {
                console.warn(`[BootMigration] ${name}: skipping no-op (${stmtMsg.split('\n').pop()})`);
                continue;
              }
              throw stmtErr;
            }
          }
          const checksum = checksumMigrationSql(sql);
          const finishedIso = new Date().toISOString();
          await (tx as unknown as RawClient).$executeRawUnsafe(
            `INSERT INTO _prisma_migrations (id, migration_name, checksum, started_at, finished_at, logs, applied_steps_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            randomUUID(),
            name,
            checksum,
            startedIso,
            finishedIso,
            '',
            statements.length,
          );
        },
        { timeout: 60000, maxWait: 15000 },
      );
      applied.push(name);
      console.log(`[BootMigration] applied ${name} (${statements.length} steps)`);
    } catch (e) {
      // Unmasked: exact migration + statement failure, never a bare 500.
      // The transaction rolled back; the caller (main.ts) halts the boot.
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`[BootMigration] FAILED applying ${name}: ${msg}`);
    }
  }
  return { applied, skipped: null };
}

/** Resolve the bundled migrations directory (packaged Electron vs dev). */
export function resolveMigrationsDir(): string {
  const candidates: string[] = [];
  const fromEnv = process.env.PRISMA_MIGRATIONS_DIR;
  if (fromEnv) candidates.push(fromEnv);
  const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) candidates.push(join(resourcesPath, 'backend', 'prisma', 'migrations'));
  // ncc bundle layout: <resources>/backend/index.js → <resources>/backend/prisma/migrations.
  candidates.push(join(__dirname, 'prisma', 'migrations'));
  // ts-node/tsc dev layout: <repo>/packages/backend/src/prisma/*.js → <repo>/packages/backend/prisma/migrations.
  candidates.push(join(__dirname, '..', '..', 'prisma', 'migrations'));
  for (const dir of candidates) {
    if (dir && existsSync(dir)) return dir;
  }
  return fromEnv ?? candidates[0] ?? '';
}
