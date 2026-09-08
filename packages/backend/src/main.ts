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
  await app.listen(port);
  // Hotfix: heal behind-schema production databases BEFORE auth bootstrap.
  // Legacy userData DBs never received `migrate deploy` for newer migrations
  // (e.g. Migration 20 `User`) — without this, bootstrap 500s on missing tables.
  try {
    const prisma = app.get(PrismaService);
    const repair = await repairPendingMigrations(prisma, resolveMigrationsDir());
    if (repair.skipped) console.log(`[SchemaRepair] skipped: ${repair.skipped}`);
    if (repair.applied.length > 0) {
      console.log(`[SchemaRepair] healed ${repair.applied.length} migration(s): ${repair.applied.join(', ')}`);
    }
  } catch (e) {
    console.error('[SchemaRepair] FAILED:', e instanceof Error ? e.message : e);
  }
  // Self-healing: legacy/seed-less databases boot with zero operators otherwise.
  try {
    await app.get(AuthService).ensureDefaultAdminExists();
  } catch (e) {
    console.error('[Auth] Admin auto-bootstrap failed:', e instanceof Error ? e.message : e);
  }
  console.log(`BarakaMobile API listening on http://localhost:${port}/api`);
}

bootstrap();
