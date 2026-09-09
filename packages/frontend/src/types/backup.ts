/**
 * Backup & Recovery contracts — mirrors GET /api/backup/* (TB-128, BMBAK1 .bak).
 * Field names follow the backend ground truth; the brief's UI health model
 * (healthy|overdue|failed|never) is derived client-side via backupHealth().
 */

export type BakBackupItem = {
  filename: string;
  size: number;
  sha256: string;
  createdAt: string;
  appVersion: string;
  schemaMigration: string | null;
};

export type BakStatus = {
  lastBackupAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  autoEnabled: boolean;
  intervalHours: number;
  retentionCount: number;
  backupCount: number;
  destinationDir: string;
};

export type BakCreateResult = {
  success: boolean;
  filename: string;
  path: string;
  size: number;
  sha256: string;
  createdAt: string;
};

export type BakRestoreResult = {
  success: boolean;
  rollbackPath: string;
  integrity: string;
  requiresReload: boolean;
};

export type BakSettings = {
  autoEnabled: boolean;
  intervalHours: number;
  retentionCount: number;
  destinationDir: string;
};

export type BackupHealth = 'healthy' | 'warning' | 'critical' | 'never';

const DAY_MS = 86_400_000;

/**
 * UI health (AD-66): healthy <24h · warning 24h–7d ·
 * critical >7d or last FAILED · never (no backup yet).
 */
export function backupHealth(s: BakStatus | undefined): BackupHealth {
  if (!s || !s.lastBackupAt) return 'never';
  if ((s.lastStatus ?? '').toUpperCase() === 'FAILED') return 'critical';
  const age = Date.now() - new Date(s.lastBackupAt).getTime();
  if (Number.isNaN(age)) return 'never';
  if (age <= DAY_MS) return 'healthy';
  if (age <= 7 * DAY_MS) return 'warning';
  return 'critical';
}

export type BakVerifyResult = {
  ok: boolean;
  filename: string;
  metadata: {
    magic: string;
    appVersion: string;
    schemaMigration: string | null;
    createdAt: string;
    dbSizeBytes: number;
    sha256: string;
  };
  dbSizeBytes: number;
  integrity: string;
};

/** Short Arabic relative time (no deps). */
export function backupAgo(iso: string | null): string {
  if (!iso) return 'لا توجد نسخة بعد';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'الآن';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'قبل لحظات';
  if (mins < 60) return `قبل ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} س`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'قبل يوم' : days === 2 ? 'قبل يومين' : `قبل ${days} أيام`;
}

/** Byte sizes are display-only (never monetary — Rule ② N/A). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
