import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await (this.prisma as any).setting.findMany();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async get(key: string): Promise<string> {
    const row = await (this.prisma as any).setting.findUnique({ where: { key } });
    if (!row) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }
    return row.value;
  }

  async getBulk(keys: string[]): Promise<Record<string, string>> {
    const rows = await (this.prisma as any).setting.findMany({
      where: { key: { in: keys } },
    });
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    const result: Record<string, string> = {};
    for (const key of keys) {
      result[key] = map[key] ?? '';
    }
    return result;
  }

  async update(key: string, value: string): Promise<{ key: string; value: string; updatedAt: Date }> {
    const row = await (this.prisma as any).setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    return { key: row.key, value: row.value, updatedAt: row.updatedAt };
  }

  async updateMany(data: Record<string, string>): Promise<Record<string, string>> {
    await (this.prisma as any).$transaction(
      Object.entries(data).map(([key, value]) =>
        (this.prisma as any).setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );
    return this.getAll();
  }
}
