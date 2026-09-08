import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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

/**
 * Pillar 1 (TB-112): disaster recovery for standalone SQLite (WAL mode).
 * .akb = gzip(JSON({ manifest, sqliteBase64 })). No new dependencies:
 * fs/path/crypto/zlib/os are Node built-ins.
 */
@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

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
}
