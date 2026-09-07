// prepare-seed.js — rebuild packages/backend/prisma/production-seed.db from
// HEAD migrations + prisma seed, so the installer NEVER bundles a schema-stale DB.
// Idempotent: always builds a fresh temp file, verifies it, then promotes it.
// Usage: node packages/desktop/scripts/prepare-seed.js (wired into `electron:pack`).
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run(cmd, args, cwd, env) {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`[prepare-seed] FAILED: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

try {
  const root = path.resolve(__dirname, '..', '..', '..');
  const backendDir = path.join(root, 'packages', 'backend');
  const prismaDir = path.join(backendDir, 'prisma');
  const seedTarget = path.join(prismaDir, 'production-seed.db');
  const tmpDb = path.join(prismaDir, '.seed-build-tmp.db');

  if (!fs.existsSync(path.join(prismaDir, 'schema.prisma'))) {
    console.error('[prepare-seed] schema.prisma not found at', prismaDir);
    process.exit(1);
  }

  // Fresh temp file every run (atomic promote at the end).
  for (const f of [tmpDb, `${tmpDb}-journal`, `${tmpDb}-wal`, `${tmpDb}-shm`]) {
    try { fs.rmSync(f, { force: true }); } catch {}
  }

  const dbUrl = `file:${tmpDb.replace(/\\/g, '/')}`;
  const env = { ...process.env, DATABASE_URL: dbUrl };
  console.log(`[prepare-seed] Building fresh seed at ${tmpDb}`);

  run('pnpm', ['--filter', 'backend', 'exec', 'prisma', 'migrate', 'deploy'], root, env);
  run('pnpm', ['--filter', 'backend', 'exec', 'prisma', 'db', 'seed'], root, env);

  // Verify: every migration folder at HEAD must be applied in the fresh DB.
  // (via a temp .py file — inline -c quoting is unreliable under cmd.exe)
  const applied = (() => {
    const checker = path.join(os.tmpdir(), 'tb105-check-seed.py');
    fs.writeFileSync(
      checker,
      'import sqlite3, sys\nc = sqlite3.connect(sys.argv[1])\nprint("\\n".join(r[0] for r in c.execute("SELECT migration_name FROM _prisma_migrations")))\n',
      'utf8',
    );
    const r = spawnSync('python3', [checker, tmpDb], { cwd: root, encoding: 'utf8', shell: true });
    try { fs.rmSync(checker, { force: true }); } catch {}
    if (r.status !== 0) {
      console.error('[prepare-seed] Could not read _prisma_migrations from fresh seed');
      process.exit(1);
    }
    return r.stdout || '';
  })();
  const folders = fs.readdirSync(path.join(prismaDir, 'migrations')).filter((n) => n !== 'migration_lock.toml');
  const missing = folders.filter((m) => !applied.includes(m));
  if (missing.length > 0) {
    console.error('[prepare-seed] Migrations missing from fresh seed:', missing.join(', '));
    process.exit(1);
  }
  console.log(`[prepare-seed] Verified ${folders.length} migrations applied.`);

  fs.copyFileSync(tmpDb, seedTarget);
  console.log(`[prepare-seed] Promoted to ${seedTarget} (${fs.statSync(seedTarget).size} bytes)`);
  try { fs.rmSync(tmpDb, { force: true }); } catch {}
  console.log('[prepare-seed] DONE');
} catch (err) {
  console.error('[prepare-seed] Failed:', err);
  process.exit(1);
}
