import { Injectable, BadRequestException, NotFoundException, ConflictException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { repairPendingMigrations, resolveMigrationsDir } from '../../prisma/migration-repair';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as os from 'os';

export type BackupManifest = {
  format: 'akb-1';
  appVersion: string;
  schemaMigrationCount: number;
  schemaLatestMigration: string | null;
  createdAt: string;
  dbSizeBytes: number;
  sha256: string;
  note?: string;
};

export type BackupRecord = {
  id: string;
  createdAt: string;
  sizeBytes: number;
  sha256: string;
  appVersion: string;
  schemaLatestMigration: string | null;
};

const AUTO_KEEP = 10;

/** TB-128 keys in the generic Setting table (string-encoded). */
export const BACKUP_KEYS = {
  AUTO_ENABLED: 'BACKUP_AUTO_ENABLED',
  INTERVAL_HOURS: 'BACKUP_INTERVAL_HOURS',
  DESTINATION_DIR: 'BACKUP_DESTINATION_DIR',
  RETENTION_COUNT: 'BACKUP_RETENTION_COUNT',
  LAST_AT: 'BACKUP_LAST_AT',
  LAST_STATUS: 'BACKUP_LAST_STATUS',
  LAST_ERROR: 'BACKUP_LAST_ERROR',
} as const;

export const BACKUP_DEFAULTS: Record<string, string> = {
  [BACKUP_KEYS.AUTO_ENABLED]: 'true',
  [BACKUP_KEYS.INTERVAL_HOURS]: '24',
  [BACKUP_KEYS.DESTINATION_DIR]: '',
  [BACKUP_KEYS.RETENTION_COUNT]: '7',
  [BACKUP_KEYS.LAST_AT]: '',
  [BACKUP_KEYS.LAST_STATUS]: '',
  [BACKUP_KEYS.LAST_ERROR]: '',
};

/**
 * TB-128 .bak binary envelope (zero-dep, node:zlib only):
 *   6 bytes magic "BMBAK1" | 4 bytes BE uint32 metadata length |
 *   UTF-8 metadata JSON | gzip(SQLite bytes)
 */
export const BAK_MAGIC = 'BMBAK1';

export type BakMetadata = {
  magic: 'BMBAK1';
  appVersion: string;
  schemaMigration: string | null;
  createdAt: string;
  dbSizeBytes: number;
  sha256: string;
};

export function packBak(sqlite: Buffer, meta: BakMetadata): Buffer {
  const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8');
  const gz = zlib.gzipSync(sqlite);
  const head = Buffer.alloc(10);
  head.write(BAK_MAGIC, 0, 'utf8');
  head.writeUInt32BE(metaBuf.length, 6);
  return Buffer.concat([head, metaBuf, gz]);
}

export function unpackBak(buf: Buffer): { meta: BakMetadata; sqlite: Buffer } {
  if (buf.length < 10 || buf.subarray(0, 6).toString('utf8') !== BAK_MAGIC) {
    throw new BadRequestException({ code: 'BACKUP_BAD_MAGIC', hint: 'Not a BMBAK1 archive' });
  }
  const metaLen = buf.readUInt32BE(6);
  if (metaLen <= 0 || metaLen > buf.length - 10) {
    throw new BadRequestException({ code: 'BACKUP_CORRUPT', hint: 'Metadata length out of range' });
  }
  let meta: BakMetadata;
  try {
    meta = JSON.parse(buf.subarray(10, 10 + metaLen).toString('utf8'));
  } catch {
    throw new BadRequestException({ code: 'BACKUP_CORRUPT', hint: 'Metadata JSON unparseable' });
  }
  if (meta?.magic !== BAK_MAGIC || typeof meta?.sha256 !== 'string') {
    throw new BadRequestException({ code: 'BACKUP_CORRUPT', hint: 'Metadata validation failed' });
  }
  let sqlite: Buffer;
  try {
    sqlite = zlib.gunzipSync(buf.subarray(10 + metaLen));
  } catch {
    throw new BadRequestException({ code: 'BACKUP_UNREADABLE', hint: 'Payload gunzip failed' });
  }
  const actual = crypto.createHash('sha256').update(sqlite).digest('hex');
  if (actual !== meta.sha256) {
    throw new BadRequestException({ code: 'BACKUP_CHECKSUM_MISMATCH', expected: meta.sha256, actual });
  }
  return { meta, sqlite };
}

/**
 * Pillar 1 (TB-112): disaster recovery for standalone SQLite (WAL mode).
 * .akb = gzip(JSON({ manifest, sqliteBase64 })). No new dependencies:
 * fs/path/crypto/zlib/os are Node built-ins.
 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private autoTimer: ReturnType<typeof setInterval> | null = null;

  onModuleInit() {
    // Lightweight auto-backup watchdog: evaluated every 15 minutes, no deps.
    this.autoTimer = setInterval(() => {
      this.maybeAutoBackup().catch((e) => console.error('[Backup] auto-backup failed:', e instanceof Error ? e.message : e));
    }, 15 * 60 * 1000);
    if (this.autoTimer && typeof (this.autoTimer as any).unref === 'function') (this.autoTimer as any).unref();
  }

  onModuleDestroy() {
    if (this.autoTimer) clearInterval(this.autoTimer);
  }

  /** Resolve the live SQLite file from DATABASE_URL (env, else backend .env). */
  resolveDbPath(): string {
    let url = process.env.DATABASE_URL ?? '';
    if (!url) {
      try {
        const envPath = path.resolve(process.cwd(), 'prisma', '.env');
        const envPath2 = path.resolve(process.cwd(), '.env');
        for (const p of [envPath, envPath2]) {
          if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, 'utf8');
            const m = raw.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
            if (m) {
              url = m[1].trim();
              break;
            }
          }
        }
      } catch {
        /* fall through to error */
      }
    }
    const m = url.match(/^file:(.+)$/);
    if (!m) {
      throw new BadRequestException({ code: 'BACKUP_DB_PATH_UNKNOWN', hint: 'DATABASE_URL is not a file: URL' });
    }
    const p = m[1];
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  }

  private dirs() {
    const dbPath = this.resolveDbPath();
    const root = path.join(path.dirname(dbPath), 'backups');
    const automated = path.join(root, 'automated');
    fs.mkdirSync(automated, { recursive: true });
    return { dbPath, root, automated };
  }

  private appVersion(): string {
    try {
      const candidates = [
        path.resolve(process.cwd(), 'package.json'),
        path.resolve(__dirname, '..', '..', '..', 'package.json'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          const pkg = JSON.parse(fs.readFileSync(c, 'utf8'));
          if (pkg?.version) return String(pkg.version);
        }
      }
    } catch {
      /* fall through */
    }
    return '2.1.0';
  }

  private migrationDirCount(): number {
    try {
      const candidates = [
        path.resolve(process.cwd(), 'prisma', 'migrations'),
        path.resolve(__dirname, '..', '..', '..', 'prisma', 'migrations'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          const entries = fs.readdirSync(c, { withFileTypes: true });
          return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).length;
        }
      }
    } catch {
      /* ignore */
    }
    return 0;
  }

  private appliedMigrations(dbAlias?: string): Promise<Array<{ migration_name: string }>> {
    const table = dbAlias ? `"${dbAlias}"."_prisma_migrations"` : '"_prisma_migrations"';
    return this.prisma.$queryRawUnsafe(`SELECT migration_name FROM ${table} ORDER BY migration_name ASC;`) as Promise<
      Array<{ migration_name: string }>
    >;
  }

  private sha256File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      const s = fs.createReadStream(filePath);
      s.on('data', (d) => h.update(d));
      s.on('end', () => resolve(h.digest('hex')));
      s.on('error', reject);
    });
  }

  private stampName(prefix: string): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${prefix}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  /** Create a backup: checkpoint WAL, VACUUM INTO snapshot, manifest, gzip .akb. */
  async createBackup(kind: 'auto' | 'manual', note?: string): Promise<BackupRecord> {
    const { dbPath, automated } = this.dirs();
    if (!fs.existsSync(dbPath)) {
      throw new NotFoundException({ code: 'BACKUP_DB_MISSING', dbPath });
    }
    const stamp = this.stampName(kind === 'auto' ? 'auto' : 'manual');
    const snapshotPath = path.join(os.tmpdir(), `${stamp}.snapshot.sqlite`);
    try {
      await this.prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      const safe = snapshotPath.replace(/'/g, "''");
      await this.prisma.$queryRawUnsafe(`VACUUM INTO '${safe}';`);
      const [applied, stat] = await Promise.all([
        this.appliedMigrations(),
        fs.promises.stat(snapshotPath),
      ]);
      const sha256 = await this.sha256File(snapshotPath);
      const sqliteBase64 = await fs.promises.readFile(snapshotPath, 'base64');
      const manifest: BackupManifest = {
        format: 'akb-1',
        appVersion: this.appVersion(),
        schemaMigrationCount: this.migrationDirCount() || applied.length,
        schemaLatestMigration: applied.length > 0 ? applied[applied.length - 1].migration_name : null,
        createdAt: new Date().toISOString(),
        dbSizeBytes: stat.size,
        sha256,
        ...(note ? { note } : {}),
      };
      const envelope = JSON.stringify({ manifest, sqliteBase64 });
      const akb = zlib.gzipSync(Buffer.from(envelope, 'utf8'));
      const id = `${stamp}.akb`;
      const destDir = kind === 'auto' ? automated : automated;
      await fs.promises.writeFile(path.join(destDir, id), akb);
      if (kind === 'auto') await this.rotateAutomated(automated);
      return {
        id,
        createdAt: manifest.createdAt,
        sizeBytes: akb.length,
        sha256,
        appVersion: manifest.appVersion,
        schemaLatestMigration: manifest.schemaLatestMigration,
      };
    } finally {
      try {
        fs.rmSync(snapshotPath, { force: true });
      } catch {
        /* best effort */
      }
    }
  }

  private async rotateAutomated(automated: string): Promise<void> {
    const files = (await fs.promises.readdir(automated))
      .filter((f) => f.endsWith('.akb'))
      .map((f) => ({ f, t: fs.statSync(path.join(automated, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const extra of files.slice(AUTO_KEEP)) {
      try {
        await fs.promises.rm(path.join(automated, extra.f), { force: true });
      } catch {
        /* best effort */
      }
    }
  }

  private readEnvelope(akbPath: string): { manifest: BackupManifest; sqlite: Buffer } {
    let raw: Buffer;
    try {
      raw = zlib.gunzipSync(fs.readFileSync(akbPath));
    } catch {
      throw new BadRequestException({ code: 'BACKUP_UNREADABLE', hint: 'Not a valid .akb gzip archive' });
    }
    let envelope: any;
    try {
      envelope = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new BadRequestException({ code: 'BACKUP_CORRUPT', hint: 'Envelope JSON unparseable' });
    }
    if (!envelope?.manifest || typeof envelope?.sqliteBase64 !== 'string') {
      throw new BadRequestException({ code: 'BACKUP_CORRUPT', hint: 'Missing manifest or payload' });
    }
    return { manifest: envelope.manifest as BackupManifest, sqlite: Buffer.from(envelope.sqliteBase64, 'base64') };
  }

  private resolveCandidate(inputPath: string): string {
    if (path.isAbsolute(inputPath) && fs.existsSync(inputPath)) return inputPath;
    const { automated } = this.dirs();
    const inside = path.join(automated, path.basename(inputPath));
    if (fs.existsSync(inside)) return inside;
    if (fs.existsSync(inputPath)) return inputPath;
    throw new NotFoundException({ code: 'BACKUP_NOT_FOUND', path: inputPath });
  }

  async listBackups(): Promise<BackupRecord[]> {
    const { automated } = this.dirs();
    const files = (await fs.promises.readdir(automated).catch(() => [] as string[])).filter((f) => f.endsWith('.akb'));
    const out: BackupRecord[] = [];
    for (const f of files) {
      try {
        const full = path.join(automated, f);
        const { manifest } = this.readEnvelope(full);
        const stat = await fs.promises.stat(full);
        out.push({
          id: f,
          createdAt: manifest.createdAt,
          sizeBytes: stat.size,
          sha256: manifest.sha256,
          appVersion: manifest.appVersion,
          schemaLatestMigration: manifest.schemaLatestMigration,
        });
      } catch {
        /* skip unreadable entries */
      }
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  getBackupFilePath(id: string): string {
    return this.resolveCandidate(id);
  }

  /** Pre-flight: integrity of the archive + header + migration compatibility. */
  async preflight(inputPath: string) {
    const full = this.resolveCandidate(inputPath);
    const { manifest, sqlite } = this.readEnvelope(full);
    const actual = crypto.createHash('sha256').update(sqlite).digest('hex');
    if (actual !== manifest.sha256) {
      throw new BadRequestException({ code: 'BACKUP_CHECKSUM_MISMATCH', expected: manifest.sha256, actual });
    }
    const header = sqlite.subarray(0, 16).toString('utf8');
    if (!header.startsWith('SQLite format 3')) {
      throw new BadRequestException({ code: 'BACKUP_BAD_HEADER' });
    }
    const tmpPath = path.join(os.tmpdir(), `akb-preflight-${Date.now()}.sqlite`);
    await fs.promises.writeFile(tmpPath, sqlite);
    try {
      const safe = tmpPath.replace(/'/g, "''");
      await this.prisma.$queryRawUnsafe(`ATTACH DATABASE '${safe}' AS akb_check;`);
      try {
        const rows = await this.appliedMigrations('akb_check');
        const live = await this.appliedMigrations();
        const liveSet = new Set(live.map((r) => r.migration_name));
        const candidateLatest = rows.length > 0 ? rows[rows.length - 1].migration_name : null;
        const compatible = candidateLatest === null || liveSet.has(candidateLatest);
        if (!compatible) {
          throw new ConflictException({
            code: 'BACKUP_FUTURE_SCHEMA',
            candidateLatest,
            hint: 'Backup is from a newer schema than the running backend',
          });
        }
        return {
          ok: true as const,
          path: full,
          manifest,
          candidateMigrations: rows.length,
          liveMigrations: live.length,
          compatible,
        };
      } finally {
        await this.prisma.$queryRawUnsafe('DETACH DATABASE akb_check;').catch(() => null);
      }
    } finally {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        /* best effort */
      }
    }
  }

  /** Restore: safety copy → disconnect → overwrite → reconnect → integrity_check. */
  async restore(inputPath: string) {
    const checked = await this.preflight(inputPath);
    const { dbPath, root } = this.dirs();
    const stamp = this.stampName('active_rollback');
    const rollbackPath = path.join(root, `${stamp}.db`);
    await fs.promises.copyFile(dbPath, rollbackPath);
    const { manifest, sqlite } = this.readEnvelope(checked.path);
    void manifest;
    await this.prisma.$disconnect();
    try {
      await fs.promises.writeFile(dbPath, sqlite);
    } catch (e) {
      throw new ConflictException({ code: 'BACKUP_RESTORE_WRITE_FAILED', rollbackPath });
    }
    await this.prisma.$connect();
    let integrity = 'unknown';
    try {
      const rows = (await this.prisma.$queryRawUnsafe('PRAGMA integrity_check;')) as Array<{ integrity_check: string }>;
      integrity = rows?.[0]?.integrity_check ?? 'unknown';
    } catch {
      integrity = 'check-failed';
    }
    return { success: true as const, rollbackPath, integrity, requiresReload: true as const };
  }

  // ---------------------------------------------------------------- TB-128 ---

  /** Read raw Setting rows for the backup keys (missing → default, never throws). */
  private async backupKeyMap(): Promise<Record<string, string>> {
    const keys = Object.values(BACKUP_KEYS);
    try {
      const rows = (await (this.prisma as any).setting.findMany({ where: { key: { in: keys } } })) as Array<{ key: string; value: string }>;
      const map: Record<string, string> = { ...BACKUP_DEFAULTS };
      for (const r of rows) map[r.key] = r.value;
      return map;
    } catch {
      return { ...BACKUP_DEFAULTS };
    }
  }

  /** Destination dir: configured override, else <db-dir>/backups (userData in prod). */
  async backupDestinationDir(): Promise<string> {
    const map = await this.backupKeyMap();
    const configured = (map[BACKUP_KEYS.DESTINATION_DIR] ?? '').trim();
    const dir = configured !== '' ? configured : path.join(path.dirname(this.resolveDbPath()), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private retentionCount(map: Record<string, string>): number {
    const n = Number.parseInt(map[BACKUP_KEYS.RETENTION_COUNT] ?? '', 10);
    return Number.isInteger(n) && n >= 1 ? n : 7;
  }

  async getBackupSettings() {
    const map = await this.backupKeyMap();
    const interval = Number.parseInt(map[BACKUP_KEYS.INTERVAL_HOURS] ?? '', 10);
    return {
      autoEnabled: (map[BACKUP_KEYS.AUTO_ENABLED] ?? 'true') === 'true',
      intervalHours: Number.isInteger(interval) && interval >= 1 ? interval : 24,
      retentionCount: this.retentionCount(map),
      destinationDir: (map[BACKUP_KEYS.DESTINATION_DIR] ?? '').trim(),
    };
  }

  async updateBackupSettings(dto: { autoEnabled?: boolean; intervalHours?: number; retentionCount?: number; destinationDir?: string }) {
    const data: Record<string, string> = {};
    if (dto.autoEnabled !== undefined) {
      if (typeof dto.autoEnabled !== 'boolean') throw new BadRequestException('autoEnabled must be boolean');
      data[BACKUP_KEYS.AUTO_ENABLED] = dto.autoEnabled ? 'true' : 'false';
    }
    if (dto.intervalHours !== undefined) {
      if (!Number.isInteger(dto.intervalHours) || dto.intervalHours < 1) {
        throw new BadRequestException('intervalHours must be a positive integer >= 1');
      }
      data[BACKUP_KEYS.INTERVAL_HOURS] = String(dto.intervalHours);
    }
    if (dto.retentionCount !== undefined) {
      if (!Number.isInteger(dto.retentionCount) || dto.retentionCount < 1) {
        throw new BadRequestException('retentionCount must be a positive integer >= 1');
      }
      data[BACKUP_KEYS.RETENTION_COUNT] = String(dto.retentionCount);
    }
    if (dto.destinationDir !== undefined) {
      if (typeof dto.destinationDir !== 'string') throw new BadRequestException('destinationDir must be a string');
      const t = dto.destinationDir.trim();
      if (t !== '') fs.mkdirSync(t, { recursive: true });
      data[BACKUP_KEYS.DESTINATION_DIR] = t;
    }
    if (Object.keys(data).length > 0) await this.settings.updateMany(data);
    return this.getBackupSettings();
  }

  private async recordLast(status: 'SUCCESS' | 'FAILED', error: string, at?: string) {
    await this.settings.updateMany({
      [BACKUP_KEYS.LAST_AT]: at ?? new Date().toISOString(),
      [BACKUP_KEYS.LAST_STATUS]: status,
      [BACKUP_KEYS.LAST_ERROR]: error,
    });
  }

  /** Create a .bak backup (VACUUM INTO snapshot → sha256 → gzip → BMBAK1). */
  async createBakBackup(kind: 'auto' | 'manual') {
    const dbPath = this.resolveDbPath();
    if (!fs.existsSync(dbPath)) throw new NotFoundException({ code: 'BACKUP_DB_MISSING', dbPath });
    const destDir = await this.backupDestinationDir();
    const stamp = this.stampName(kind);
    const filename = `${stamp}.bak`;
    const snapshotPath = path.join(os.tmpdir(), `${stamp}.snapshot.sqlite`);
    try {
      await this.prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      await this.prisma.$queryRawUnsafe(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}';`);
      const sqlite = await fs.promises.readFile(snapshotPath);
      const sha256 = crypto.createHash('sha256').update(sqlite).digest('hex');
      const applied = await this.appliedMigrations();
      const meta: BakMetadata = {
        magic: BAK_MAGIC,
        appVersion: this.appVersion(),
        schemaMigration: applied.length > 0 ? applied[applied.length - 1].migration_name : null,
        createdAt: new Date().toISOString(),
        dbSizeBytes: sqlite.length,
        sha256,
      };
      const packed = packBak(sqlite, meta);
      await fs.promises.writeFile(path.join(destDir, filename), packed);
      await this.enforceBakRetention(destDir);
      await this.recordLast('SUCCESS', '', meta.createdAt);
      return { success: true as const, filename, path: path.join(destDir, filename), size: packed.length, sha256, createdAt: meta.createdAt };
    } catch (e) {
      await this.recordLast('FAILED', e instanceof Error ? e.message : String(e)).catch(() => null);
      throw e;
    } finally {
      try { fs.rmSync(snapshotPath, { force: true }); } catch { /* best effort */ }
    }
  }

  private async enforceBakRetention(destDir: string) {
    const map = await this.backupKeyMap();
    const keep = this.retentionCount(map);
    const files = (await fs.promises.readdir(destDir).catch(() => [] as string[]))
      .filter((f) => f.endsWith('.bak'))
      .map((f) => ({ f, t: fs.statSync(path.join(destDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const extra of files.slice(keep)) {
      try { await fs.promises.rm(path.join(destDir, extra.f), { force: true }); } catch { /* best effort */ }
    }
  }

  async listBakBackups() {
    const destDir = await this.backupDestinationDir();
    const files = (await fs.promises.readdir(destDir).catch(() => [] as string[])).filter((f) => f.endsWith('.bak'));
    const out: Array<{ filename: string; size: number; sha256: string; createdAt: string; appVersion: string; schemaMigration: string | null }> = [];
    for (const f of files) {
      try {
        const full = path.join(destDir, f);
        const { meta } = unpackBak(fs.readFileSync(full));
        const stat = await fs.promises.stat(full);
        out.push({ filename: f, size: stat.size, sha256: meta.sha256, createdAt: meta.createdAt, appVersion: meta.appVersion, schemaMigration: meta.schemaMigration });
      } catch { /* skip unreadable entries */ }
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async backupStatus() {
    const map = await this.backupKeyMap();
    const s = await this.getBackupSettings();
    const destDir = await this.backupDestinationDir();
    const count = (await fs.promises.readdir(destDir).catch(() => [] as string[])).filter((f) => f.endsWith('.bak')).length;
    return {
      lastBackupAt: map[BACKUP_KEYS.LAST_AT] || null,
      lastStatus: map[BACKUP_KEYS.LAST_STATUS] || null,
      lastError: map[BACKUP_KEYS.LAST_ERROR] || null,
      autoEnabled: s.autoEnabled,
      intervalHours: s.intervalHours,
      retentionCount: s.retentionCount,
      backupCount: count,
      destinationDir: destDir,
    };
  }

  private resolveBakCandidate(input: string, destDir: string): string {
    if (path.isAbsolute(input) && fs.existsSync(input)) return input;
    const inside = path.join(destDir, path.basename(input));
    if (fs.existsSync(inside)) return inside;
    if (fs.existsSync(input)) return input;
    throw new NotFoundException({ code: 'BACKUP_NOT_FOUND', path: input });
  }

  /**
   * Safe .bak restore: unpack+verify → integrity pre-check → emergency
   * safety_pre_restore.bak → disconnect → overwrite → reconnect → repair.
   */
  async restoreBak(input: string) {
    const destDir = await this.backupDestinationDir();
    const full = this.resolveBakCandidate(input, destDir);
    const { meta, sqlite } = unpackBak(fs.readFileSync(full));
    if (!sqlite.subarray(0, 16).toString('utf8').startsWith('SQLite format 3')) {
      throw new BadRequestException({ code: 'BACKUP_BAD_HEADER' });
    }
    // Integrity pre-check on a temp copy (never touches the live DB yet).
    const tmpPath = path.join(os.tmpdir(), `bak-restore-${Date.now()}.sqlite`);
    await fs.promises.writeFile(tmpPath, sqlite);
    try {
      const safe = tmpPath.replace(/'/g, "''");
      await this.prisma.$queryRawUnsafe(`ATTACH DATABASE '${safe}' AS bak_check;`);
      try {
        const rows = (await this.prisma.$queryRawUnsafe('PRAGMA bak_check.integrity_check;')) as Array<{ integrity_check: string }>;
        if ((rows?.[0]?.integrity_check ?? '') !== 'ok') {
          throw new BadRequestException({ code: 'BACKUP_INTEGRITY_FAILED' });
        }
      } finally {
        await this.prisma.$queryRawUnsafe('DETACH DATABASE bak_check;').catch(() => null);
      }
    } finally {
      try { fs.rmSync(tmpPath, { force: true }); } catch { /* best effort */ }
    }
    const dbPath = this.resolveDbPath();
    const safetyPath = path.join(destDir, `safety_pre_restore_${this.stampName('restore').replace(/^restore_/, '')}.bak`);
    // Emergency fallback uses the same verified .bak envelope.
    const live = fs.readFileSync(dbPath);
    const liveApplied = await this.appliedMigrations();
    const safetyPacked = packBak(live, {
      magic: BAK_MAGIC,
      appVersion: this.appVersion(),
      schemaMigration: liveApplied.length > 0 ? liveApplied[liveApplied.length - 1].migration_name : null,
      createdAt: new Date().toISOString(),
      dbSizeBytes: live.length,
      sha256: crypto.createHash('sha256').update(live).digest('hex'),
    });
    await fs.promises.writeFile(safetyPath, safetyPacked);
    await this.prisma.$disconnect();
    try {
      await fs.promises.writeFile(dbPath, sqlite);
    } catch (e) {
      throw new ConflictException({ code: 'BACKUP_RESTORE_WRITE_FAILED', rollbackPath: safetyPath });
    }
    await this.prisma.$connect();
    try {
      await repairPendingMigrations(this.prisma as any, resolveMigrationsDir());
    } catch (e) {
      console.error('[Backup] post-restore repair:', e instanceof Error ? e.message : e);
    }
    let integrity = 'unknown';
    try {
      const rows = (await this.prisma.$queryRawUnsafe('PRAGMA integrity_check;')) as Array<{ integrity_check: string }>;
      integrity = rows?.[0]?.integrity_check ?? 'unknown';
    } catch {
      integrity = 'check-failed';
    }
    await this.recordLast('SUCCESS', '').catch(() => null);
    void meta;
    return { success: true as const, rollbackPath: safetyPath, integrity, requiresReload: true as const };
  }

  /** Scheduler tick: auto-backup when enabled and interval elapsed. */
  async maybeAutoBackup(): Promise<{ ran: boolean }> {
    const s = await this.getBackupSettings();
    if (!s.autoEnabled) return { ran: false };
    const map = await this.backupKeyMap();
    const last = map[BACKUP_KEYS.LAST_AT];
    if (last) {
      const elapsed = Date.now() - new Date(last).getTime();
      if (!Number.isNaN(elapsed) && elapsed < s.intervalHours * 3_600_000) return { ran: false };
    }
    await this.createBakBackup('auto');
    return { ran: true };
  }
}
