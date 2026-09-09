import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  TERMINAL_REPAIR_STATUSES,
  computeRepairSeverity,
  computeDaysOverdue,
  computeWarrantyCategory,
  computeDaysRemaining,
  isValidDayCount,
  type RepairSeverity,
  type WarrantyCategory,
} from './sla';

export const GRACE_KEY = 'REPAIR_DELAY_GRACE_DAYS';
export const ALERT_KEY = 'WARRANTY_EXPIRY_ALERT_DAYS';
const DEFAULT_GRACE = 5;
const DEFAULT_ALERT = 15;

export type DelayedRepairItem = {
  id: string;
  ticketNumber: string;
  customerName: string;
  deviceName: string;
  faultType: string;
  expectedDate: string;
  daysOverdue: number;
  severity: Extract<RepairSeverity, 'DELAYED' | 'CRITICAL'>;
};

export type WarrantyAlertItem = {
  id: string;
  imei: string;
  productName: string;
  customerName: string;
  saleDate: string;
  warrantyEndDate: string;
  daysRemaining: number;
  status: WarrantyCategory;
};

@Injectable()
export class WatchdogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private parseDayCount(raw: string | undefined, fallback: number): number {
    const n = Number.parseInt(raw ?? '', 10);
    return Number.isInteger(n) && n >= 1 ? n : fallback;
  }

  async getSettings(): Promise<{ repairGraceDays: number; warrantyAlertDays: number }> {
    const bulk = await this.settings.getBulk([GRACE_KEY, ALERT_KEY]);
    return {
      repairGraceDays: this.parseDayCount(bulk[GRACE_KEY], DEFAULT_GRACE),
      warrantyAlertDays: this.parseDayCount(bulk[ALERT_KEY], DEFAULT_ALERT),
    };
  }

  async updateSettings(repairGraceDays: number, warrantyAlertDays: number) {
    if (!isValidDayCount(repairGraceDays) || !isValidDayCount(warrantyAlertDays)) {
      throw new BadRequestException('repairGraceDays and warrantyAlertDays must be positive integers >= 1');
    }
    // Atomic dual-key write (SettingsService.updateMany wraps in $transaction).
    await this.settings.updateMany({
      [GRACE_KEY]: String(repairGraceDays),
      [ALERT_KEY]: String(warrantyAlertDays),
    });
    return { repairGraceDays, warrantyAlertDays, updatedAt: new Date().toISOString() };
  }

  private async collectDelayed(graceDays: number): Promise<DelayedRepairItem[]> {
    const now = new Date();
    const tickets = await (this.prisma as any).repairTicket.findMany({
      where: {
        isActive: true,
        status: { notIn: [...TERMINAL_REPAIR_STATUSES] },
        estimatedCompletionDate: { not: null },
      },
      include: { contact: true, repairFaultType: true },
    });
    const items: DelayedRepairItem[] = [];
    for (const t of tickets) {
      const ecd: Date | null = t.estimatedCompletionDate ? new Date(t.estimatedCompletionDate) : null;
      const severity = computeRepairSeverity(ecd, now, graceDays);
      if (severity !== 'DELAYED' && severity !== 'CRITICAL') continue;
      items.push({
        id: t.id,
        ticketNumber: t.ticketNumber,
        customerName: t.contact?.name ?? '—',
        deviceName: [t.deviceBrand, t.deviceModel].filter(Boolean).join(' ') || t.deviceType,
        faultType: t.repairFaultType?.faultTypeName ?? '—',
        expectedDate: (ecd as Date).toISOString(),
        daysOverdue: computeDaysOverdue(ecd as Date, now),
        severity,
      });
    }
    items.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return items;
  }

  private async collectWarranties(alertDays: number): Promise<WarrantyAlertItem[]> {
    const now = new Date();
    const serials = await (this.prisma as any).deviceSerial.findMany({
      where: { status: 'SOLD', warrantyExpiresAt: { not: null } },
      include: { item: true },
    });
    const items: WarrantyAlertItem[] = [];
    for (const s of serials) {
      const end = new Date(s.warrantyExpiresAt);
      const status = computeWarrantyCategory(end, now, alertDays);
      if (status === 'ACTIVE') continue;
      items.push({
        id: s.id,
        imei: s.imei1,
        productName: s.item?.name ?? '—',
        customerName: s.customerName ?? s.customerContactId ?? '—',
        saleDate: s.saleDate ? new Date(s.saleDate).toISOString() : '',
        warrantyEndDate: end.toISOString(),
        daysRemaining: computeDaysRemaining(end, now),
        status,
      });
    }
    items.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return items;
  }

  async summary() {
    const { repairGraceDays, warrantyAlertDays } = await this.getSettings();
    const [delayed, warranties] = await Promise.all([
      this.collectDelayed(repairGraceDays),
      this.collectWarranties(warrantyAlertDays),
    ]);
    return {
      criticalCount: delayed.filter((d) => d.severity === 'CRITICAL').length,
      delayedCount: delayed.filter((d) => d.severity === 'DELAYED').length,
      expiringWarrantiesCount: warranties.filter((w) => w.status === 'EXPIRING_SOON').length,
      expiredWarrantiesCount: warranties.filter((w) => w.status === 'EXPIRED').length,
    };
  }

  async repairs(filter: string, page: number, limit: number) {
    const { repairGraceDays } = await this.getSettings();
    const all = await this.collectDelayed(repairGraceDays);
    const f = filter === 'critical' ? all.filter((i) => i.severity === 'CRITICAL')
      : filter === 'delayed' ? all.filter((i) => i.severity === 'DELAYED')
      : all;
    return this.paginate(f, page, limit);
  }

  async warranties(filter: string, page: number, limit: number) {
    const { warrantyAlertDays } = await this.getSettings();
    const all = await this.collectWarranties(warrantyAlertDays);
    const f = filter === 'expiring' ? all.filter((i) => i.status === 'EXPIRING_SOON')
      : filter === 'expired' ? all.filter((i) => i.status === 'EXPIRED')
      : all;
    return this.paginate(f, page, limit);
  }

  private paginate<T>(items: T[], page: number, limit: number): { items: T[]; total: number } {
    const p = Number.isInteger(page) && page >= 1 ? page : 1;
    const l = Number.isInteger(limit) && limit >= 1 && limit <= 200 ? limit : 50;
    return { items: items.slice((p - 1) * l, p * l), total: items.length };
  }
}
