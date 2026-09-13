import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { PrismaService } from './prisma/prisma.service';
import { repairPendingMigrations, resolveMigrationsDir } from './prisma/migration-repair';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (origin === undefined || origin === 'null' || origin.startsWith('file://')) {
        callback(null, true);
        return;
      }
      if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3001;

  // DEF-DESK-BOOT-MIGRATE (atomic boot sequence): pending migrations MUST
  // complete BEFORE the HTTP server binds its port. The desktop shell polls
  // /api/health to decide the backend is ready — binding first would let the
  // UI issue queries against a stale schema (HTTP 500 on e.g.
  // RepairPartItem.reversalMovementId or the OPENING_BALANCE partial
  // indexes). Any migration failure halts the boot with a non-zero exit so
  // the Electron shell surfaces an explicit startup error (backend.log)
  // instead of serving an inconsistent database.
  try {
    const prisma = app.get(PrismaService);
    const repair = await repairPendingMigrations(prisma, resolveMigrationsDir());
    if (repair.skipped) console.log(`[BootMigration] skipped: ${repair.skipped}`);
    if (repair.applied.length > 0) {
      console.log(`[BootMigration] applied ${repair.applied.length} migration(s): ${repair.applied.join(', ')}`);
    }
  } catch (e) {
    console.error('[BootMigration] FATAL — aborting boot:', e instanceof Error ? e.message : e);
    await app.close().catch(() => null);
    process.exit(1);
  }

  await app.listen(port);
  // Self-healing: legacy/seed-less databases boot with zero operators otherwise.
  try {
    await app.get(AuthService).ensureDefaultAdminExists();
  } catch (e) {
    console.error('[Auth] Admin auto-bootstrap failed:', e instanceof Error ? e.message : e);
  }
  console.log(`BarakaMobile API listening on http://localhost:${port}/api`);
}

bootstrap();
