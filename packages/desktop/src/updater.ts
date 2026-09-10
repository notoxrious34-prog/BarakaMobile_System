import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';

/**
 * Native GitHub Releases updater (TB-137, AD-74) — zero third-party deps.
 * Checks notoxrious34-prog/BarakaMobile_System, streams the installer to
 * %TEMP%/baraka-updates, tracks progress, runs it detached on demand.
 */

const REPO_LATEST_URL = 'https://api.github.com/repos/notoxrious34-prog/BarakaMobile_System/releases/latest';
const HEADERS = {
  'User-Agent': 'BarakaMobile-Desktop-Updater',
  Accept: 'application/vnd.github.v3+json',
};

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type UpdaterState = {
  status: UpdaterStatus;
  currentVersion: string;
  targetVersion: string | null;
  releaseNotes: string | null;
  installerPath: string | null;
  totalBytes: number;
  transferredBytes: number;
  percent: number;
  bytesPerSecond: number;
  error: string | null;
};

export type StatusListener = (state: UpdaterState) => void;

/**
 * Application version (DIRECTIVE-138): NEVER trust bare app.getVersion() in
 * dev — it can resolve Electron's own package (33.4.11). Read BarakaMobile's
 * own package.json first; app.getVersion() is only the packaged fallback.
 */
export function getAppVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../package.json') as { version?: string };
    if (pkg?.version && /^\d+\.\d+\.\d+$/.test(pkg.version)) return pkg.version;
  } catch {
    /* packaged asar edge — fall through */
  }
  try {
    return app.getVersion();
  } catch {
    return '2.7.0';
  }
}

function parseVersion(tag: string): [number, number, number] | null {
  const m = tag.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** True only when remote is strictly greater (AD-74). */
export function isRemoteNewer(local: string, remoteTag: string): boolean {
  const l = parseVersion(local);
  const r = parseVersion(remoteTag);
  if (!l || !r) return false;
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
}

class UpdaterEngine {
  private state: UpdaterState;
  private listeners = new Set<StatusListener>();
  private abort: AbortController | null = null;
  private downloadStartMs = 0;

  constructor() {
    this.state = this.fresh();
  }

  private fresh(): UpdaterState {
    return {
      status: 'idle',
      currentVersion: this.currentVersion(),
      targetVersion: null,
      releaseNotes: null,
      installerPath: null,
      totalBytes: 0,
      transferredBytes: 0,
      percent: 0,
      bytesPerSecond: 0,
      error: null,
    };
  }

  currentVersion(): string {
    return getAppVersion();
  }

  getStatus(): UpdaterState {
    return { ...this.state };
  }

  onStatusChange(cb: StatusListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(patch: Partial<UpdaterState>) {
    this.state = { ...this.state, ...patch };
    for (const cb of this.listeners) {
      try {
        cb({ ...this.state });
      } catch {
        /* listener failure must not break the engine */
      }
    }
  }

  async check(): Promise<UpdaterState> {
    if (this.state.status === 'checking' || this.state.status === 'downloading') {
      return this.getStatus();
    }
    this.emit({ status: 'checking', error: null });
    try {
      const res = await fetch(REPO_LATEST_URL, { headers: HEADERS });
      if (res.status === 404) {
        this.emit({ status: 'not-available', targetVersion: null, releaseNotes: null });
        return this.getStatus();
      }
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
      const rel = (await res.json()) as { tag_name?: string; body?: string; assets?: Array<{ name?: string; size?: number; browser_download_url?: string }> };
      const tag = rel.tag_name ?? '';
      const exe = (rel.assets ?? []).find((a) => typeof a?.name === 'string' && a.name.endsWith('.exe'));
      if (!tag || !exe?.browser_download_url) {
        this.emit({ status: 'not-available', targetVersion: null, releaseNotes: null });
        return this.getStatus();
      }
      if (!isRemoteNewer(this.currentVersion(), tag)) {
        this.emit({ status: 'not-available', targetVersion: tag.replace(/^v/i, ''), releaseNotes: rel.body ?? null });
        return this.getStatus();
      }
      this.emit({
        status: 'available',
        targetVersion: tag.replace(/^v/i, ''),
        releaseNotes: rel.body ?? null,
        totalBytes: exe.size ?? 0,
        transferredBytes: 0,
        percent: 0,
      });
      // Stash the URL for the download step.
      (this as { pendingUrl?: string }).pendingUrl = exe.browser_download_url;
      (this as { pendingName?: string }).pendingName = exe.name as string;
      return this.getStatus();
    } catch (e) {
      this.emit({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      return this.getStatus();
    }
  }

  async startDownload(): Promise<UpdaterState> {
    const self = this as { pendingUrl?: string; pendingName?: string };
    if (this.state.status !== 'available' || !self.pendingUrl || !self.pendingName) {
      throw new Error('No update staged for download — run check first');
    }
    const dir = path.join(os.tmpdir(), 'baraka-updates');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, path.basename(self.pendingName));
    this.abort = new AbortController();
    this.downloadStartMs = Date.now();
    this.emit({ status: 'downloading', installerPath: dest, transferredBytes: 0, percent: 0, bytesPerSecond: 0 });
    try {
      const res = await fetch(self.pendingUrl, {
        headers: { 'User-Agent': HEADERS['User-Agent'] },
        signal: this.abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Download HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length') ?? this.state.totalBytes ?? 0);
      const file = fs.createWriteStream(dest);
      try {
        const reader = res.body.getReader();
        let transferred = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          transferred += value.byteLength;
          await new Promise<void>((resolve, reject) => {
            if (!file.write(value, (err) => (err ? reject(err) : resolve()))) {
              file.once('drain', () => resolve());
            }
          });
          const elapsed = Math.max(1, Date.now() - this.downloadStartMs);
          this.emit({
            transferredBytes: transferred,
            totalBytes: total || transferred,
            percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0,
            bytesPerSecond: Math.round((transferred / elapsed) * 1000),
          });
        }
      } finally {
        await new Promise<void>((resolve) => file.close(() => resolve()));
      }
      this.emit({ status: 'downloaded', percent: 100 });
      return this.getStatus();
    } catch (e) {
      try {
        fs.rmSync(dest, { force: true });
      } catch {
        /* best effort */
      }
      if ((e as Error)?.name === 'AbortError') {
        this.emit({ status: 'available', transferredBytes: 0, percent: 0, error: null });
      } else {
        this.emit({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
      return this.getStatus();
    } finally {
      this.abort = null;
    }
  }

  abortDownload() {
    this.abort?.abort();
  }

  installNow(): void {
    const p = this.state.installerPath;
    if (this.state.status !== 'downloaded' || !p || !fs.existsSync(p)) {
      throw new Error('No downloaded installer to run');
    }
    const child = spawn(p, [], { detached: true, stdio: 'ignore' });
    child.unref();
    app.quit();
  }
}

export const updater = new UpdaterEngine();
