import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, DeviceStatus, DeviceEventType } from '@prisma/client';
import Decimal from 'decimal.js';

type PrismaTx = Prisma.TransactionClient;

function normalizeImei(raw: string): string {
  return (raw ?? '').trim().replace(/[\s-]+/g, '');
}

/** Accepts 15-digit IMEIs (Luhn-checked) or 14–17 char alphanumeric serials. */
export function validateSerialFormat(value: string): { kind: 'IMEI' | 'SERIAL' } {
  const v = normalizeImei(value);
  if (/^\d{15}$/.test(v)) {
    // IMEI Luhn: double every second digit from the right (excluding check digit).
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let d = Number(v[i]);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    const check = (10 - (sum % 10)) % 10;
    if (check !== Number(v[14])) throw new BadRequestException('رقم IMEI غير صالح (فشل التحقق)');
    return { kind: 'IMEI' };
  }
  if (/^[A-Za-z0-9]{14,17}$/.test(v)) return { kind: 'SERIAL' };
  throw new BadRequestException('التسلسلي يجب أن يكون IMEI من 15 رقم أو 14-17 حرف/رقم');
}

function to2dp(v: string | Decimal): string {
  return new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

const VALID_TRANSITIONS: Record<DeviceStatus, DeviceStatus[]> = {
  IN_STOCK: ['SOLD', 'DEFECTIVE', 'RETURNED'],
  SOLD: ['UNDER_REPAIR', 'WARRANTY_CLAIMED', 'RETURNED'],
  UNDER_REPAIR: ['SOLD', 'WARRANTY_CLAIMED', 'DEFECTIVE'],
  WARRANTY_CLAIMED: ['SOLD', 'UNDER_REPAIR', 'RETURNED', 'DEFECTIVE'],
  RETURNED: ['IN_STOCK', 'DEFECTIVE'],
  DEFECTIVE: [],
};

const TERMINAL: DeviceStatus[] = ['DEFECTIVE'];

@Injectable()
export class DeviceSerialService {
  constructor(private readonly prisma: PrismaService) {}

  private async event(
    tx: PrismaTx,
    deviceSerialId: string,
    eventType: DeviceEventType,
    description: string,
    opts?: { referenceType?: string; referenceId?: string; operatorId?: string },
  ) {
    return tx.deviceLifecycleEvent.create({
      data: {
        deviceSerialId,
        eventType,
        description,
        referenceType: opts?.referenceType,
        referenceId: opts?.referenceId,
        operatorId: opts?.operatorId ?? null,
      },
    });
  }

  private transition(from: DeviceStatus, to: DeviceStatus) {
    if (from === to) return;
    if (TERMINAL.includes(from)) {
      throw new BadRequestException(`الجهاز بحالة نهائية (${from}) ولا يمكن تغييرها`);
    }
    const allowed = VALID_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`انتقال الحالة غير مسموح: ${from} → ${to}`);
    }
  }

  async registerSerial(dto: {
    imei1: string;
    imei2?: string;
    itemId: string;
    supplierContactId?: string;
    purchaseInvoiceRef?: string;
    purchaseCost?: string;
    warrantyMonths?: number;
    notes?: string;
    operatorId?: string;
  }) {
    const imei1 = normalizeImei(dto.imei1);
    validateSerialFormat(imei1);
    const imei2 = dto.imei2?.trim() ? normalizeImei(dto.imei2!) : undefined;
    if (imei2) validateSerialFormat(imei2);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.item.findFirst({ where: { id: dto.itemId, isActive: true } });
      if (!item) throw new NotFoundException('الصنف غير موجود أو موقوف');
      const clash = await tx.deviceSerial.findFirst({
        where: { OR: [{ imei1 }, ...(imei2 ? [{ imei2 }] : [])] },
      });
      if (clash) throw new ConflictException('هذا التسلسلي مسجل مسبقاً');
      let purchaseCost: string | null = null;
      if (dto.purchaseCost !== undefined) {
        purchaseCost = to2dp(dto.purchaseCost);
        if (new Decimal(purchaseCost).lt(0)) throw new BadRequestException('purchaseCost must be >= 0');
      }
      const months = dto.warrantyMonths ?? 12;
      if (!Number.isInteger(months) || months < 0 || months > 60) {
        throw new BadRequestException('warrantyMonths must be 0-60');
      }
      const device = await tx.deviceSerial.create({
        data: {
          imei1,
          imei2,
          itemId: item.id,
          status: 'IN_STOCK',
          supplierContactId: dto.supplierContactId || null,
          purchaseInvoiceRef: dto.purchaseInvoiceRef?.trim() || null,
          purchaseCost,
          warrantyMonths: months,
          notes: dto.notes?.trim() || null,
        },
      });
      await this.event(tx, device.id, 'PURCHASE_RECEIPT', `استلام شراء: ${item.name}`, {
        referenceType: 'SUPPLIER_BILL',
        referenceId: dto.purchaseInvoiceRef?.trim() || undefined,
        operatorId: dto.operatorId,
      });
      return tx.deviceSerial.findUnique({ where: { id: device.id }, include: { item: { select: { id: true, name: true, sku: true } } } });
    });
  }

  async attachToSale(
    imei: string,
    dto: { saleInvoiceId: string; customerContactId?: string; customerName?: string; customerPhone?: string; warrantyMonths?: number; operatorId?: string },
  ) {
    const code = normalizeImei(imei);
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.deviceSerial.findFirst({ where: { OR: [{ imei1: code }, { imei2: code }] } });
      if (!device) throw new NotFoundException('التسلسلي غير مسجل');
      this.transition(device.status, 'SOLD');
      const saleDate = new Date();
      const months = dto.warrantyMonths ?? device.warrantyMonths;
      const data: Record<string, unknown> = {
        status: 'SOLD',
        saleInvoiceId: dto.saleInvoiceId,
        saleDate,
        warrantyMonths: months,
        warrantyExpiresAt: addMonths(saleDate, months),
      };
      if (dto.customerContactId !== undefined) data.customerContactId = dto.customerContactId || null;
      if (dto.customerName !== undefined) data.customerName = dto.customerName?.trim() || null;
      if (dto.customerPhone !== undefined) data.customerPhone = dto.customerPhone?.trim() || null;
      const updated = await tx.deviceSerial.update({ where: { id: device.id }, data: data as never });
      await this.event(tx, device.id, 'SALE_DELIVERY', `تسليم بيع فاتورة ${dto.saleInvoiceId}`, {
        referenceType: 'INVOICE',
        referenceId: dto.saleInvoiceId,
        operatorId: dto.operatorId,
      });
      return updated;
    });
  }

  async attachToSaleById(
    id: string,
    dto: { saleInvoiceId: string; customerContactId?: string; customerName?: string; customerPhone?: string; warrantyMonths?: number; operatorId?: string },
  ) {
    const device = await this.prisma.deviceSerial.findUnique({ where: { id } });
    if (!device) throw new NotFoundException('الجهاز غير موجود');
    return this.attachToSale(device.imei1, dto);
  }

  async setStatus(id: string, status: DeviceStatus, opts?: { description?: string; operatorId?: string; referenceType?: string; referenceId?: string }) {
    if (!Object.values(DeviceStatus).includes(status)) throw new BadRequestException('حالة غير صالحة');
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.deviceSerial.findUnique({ where: { id } });
      if (!device) throw new NotFoundException('الجهاز غير موجود');
      this.transition(device.status, status);
      const updated = await tx.deviceSerial.update({ where: { id }, data: { status } });
      await this.event(tx, id, status === 'WARRANTY_CLAIMED' ? 'WARRANTY_CLAIM' : 'STATUS_CHANGE', opts?.description ?? `تغيير الحالة: ${device.status} → ${status}`, {
        referenceType: opts?.referenceType,
        referenceId: opts?.referenceId,
        operatorId: opts?.operatorId,
      });
      return updated;
    });
  }

  async lookup(imeiOrSerial: string) {
    const code = normalizeImei(imeiOrSerial);
    if (!code) throw new BadRequestException('أدخل IMEI أو تسلسلي');
    const device = await this.prisma.deviceSerial.findFirst({
      where: { OR: [{ imei1: code }, { imei2: code }] },
      include: {
        item: { select: { id: true, name: true, sku: true } },
        events: { orderBy: { createdAt: 'asc' } },
        claims: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!device) throw new NotFoundException('لا يوجد جهاز بهذا التسلسلي');
    const now = new Date();
    let isUnderWarranty = false;
    let remainingDays = 0;
    if (device.warrantyExpiresAt) {
      const diffMs = device.warrantyExpiresAt.getTime() - now.getTime();
      remainingDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      isUnderWarranty = diffMs > 0 && (device.status === 'SOLD' || device.status === 'UNDER_REPAIR' || device.status === 'WARRANTY_CLAIMED');
    }
    // Related repairs: IMEI folded into ticket notes (no schema column) + same customer/device match.
    const relatedRepairs = await this.prisma.repairTicket.findMany({
      where: {
        isActive: true,
        OR: [
          { notes: { contains: code } },
          ...(device.customerContactId ? [{ contactId: device.customerContactId } as const] : []),
        ],
      },
      select: { id: true, ticketNumber: true, status: true, deviceBrand: true, deviceModel: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    let supplier: { id: string; name: string; phone: string | null } | null = null;
    let customer: { id: string; name: string; phone: string | null } | null = null;
    const ids = [device.supplierContactId, device.customerContactId].filter(Boolean) as string[];
    if (ids.length > 0) {
      const contacts = await this.prisma.contact.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, phone: true },
      });
      supplier = contacts.find((c) => c.id === device.supplierContactId) ?? null;
      customer = contacts.find((c) => c.id === device.customerContactId) ?? null;
    }
    return { device, supplier, customer, isUnderWarranty, remainingDays, timeline: device.events, relatedRepairs };
  }

  async listSerials(filters?: { status?: DeviceStatus; itemId?: string; search?: string; take?: number }) {
    const where: Record<string, unknown> = {};
    if (filters?.status) {
      if (!Object.values(DeviceStatus).includes(filters.status)) throw new BadRequestException('حالة غير صالحة');
      where.status = filters.status;
    }
    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { imei1: { contains: q } },
        { imei2: { contains: q } },
        { customerName: { contains: q } },
        { customerPhone: { contains: q } },
        { saleInvoiceId: { contains: q } },
      ];
    }
    const take = Math.min(Math.max(filters?.take ?? 100, 1), 500);
    const [items, total] = await Promise.all([
      this.prisma.deviceSerial.findMany({
        where: where as never,
        include: { item: { select: { id: true, name: true, sku: true } } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.deviceSerial.count({ where: where as never }),
    ]);
    return { items, total };
  }

  async metrics() {
    const [inStock, underRepair, activeClaims, sold] = await Promise.all([
      this.prisma.deviceSerial.count({ where: { status: 'IN_STOCK' } }),
      this.prisma.deviceSerial.count({ where: { status: 'UNDER_REPAIR' } }),
      this.prisma.warrantyClaim.count({ where: { isResolved: false } }),
      this.prisma.deviceSerial.findMany({ where: { status: 'SOLD' }, select: { warrantyExpiresAt: true } }),
    ]);
    const now = new Date();
    const underWarranty = sold.filter((d) => d.warrantyExpiresAt && d.warrantyExpiresAt.getTime() > now.getTime()).length;
    return { inStock, underRepair, activeClaims, underWarranty };
  }

  async createClaim(dto: { deviceSerialId?: string; imei?: string; customerName: string; customerPhone: string; reportedIssue: string; operatorId?: string }) {
    const name = dto.customerName.trim();
    const phone = dto.customerPhone.trim();
    const issue = dto.reportedIssue.trim();
    if (name.length < 2) throw new BadRequestException('اسم الزبون قصير جداً');
    if (phone.length < 6) throw new BadRequestException('رقم الهاتف قصير جداً');
    if (issue.length < 3) throw new BadRequestException('صف العطل باختصار');
    return this.prisma.$transaction(async (tx) => {
      let device = dto.deviceSerialId
        ? await tx.deviceSerial.findUnique({ where: { id: dto.deviceSerialId } })
        : await tx.deviceSerial.findFirst({ where: { OR: [{ imei1: normalizeImei(dto.imei ?? '') }, { imei2: normalizeImei(dto.imei ?? '') }] } });
      if (!device) throw new NotFoundException('الجهاز غير موجود');
      this.transition(device.status, 'WARRANTY_CLAIMED');
      const year = new Date().getFullYear();
      let claimNumber = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const count = await tx.warrantyClaim.count({
          where: { createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
        });
        const candidate = `WAR-${year}-${String(count + 1 + attempt).padStart(5, '0')}`;
        if (!(await tx.warrantyClaim.findUnique({ where: { claimNumber: candidate } }))) {
          claimNumber = candidate;
          break;
        }
      }
      if (!claimNumber) throw new BadRequestException('تعذر توليد رقم مطالبة فريد');
      const claim = await tx.warrantyClaim.create({
        data: {
          claimNumber,
          deviceSerialId: device.id,
          customerName: name,
          customerPhone: phone,
          reportedIssue: issue,
          operatorId: dto.operatorId ?? null,
        },
      });
      await tx.deviceSerial.update({ where: { id: device.id }, data: { status: 'WARRANTY_CLAIMED' } });
      await this.event(tx, device.id, 'WARRANTY_CLAIM', `مطالبة ضمان ${claimNumber}: ${issue}`, {
        referenceType: 'MANUAL',
        referenceId: claimNumber,
        operatorId: dto.operatorId,
      });
      return claim;
    });
  }

  async resolveClaim(
    id: string,
    dto: { verdict: 'APPROVED_REPAIR' | 'APPROVED_REPLACEMENT' | 'REJECTED_MISUSE' | 'PENDING_INSPECTION'; actionTaken?: string; operatorId?: string },
  ) {
    const verdicts = ['APPROVED_REPAIR', 'APPROVED_REPLACEMENT', 'REJECTED_MISUSE', 'PENDING_INSPECTION'];
    if (!verdicts.includes(dto.verdict)) throw new BadRequestException('قرار غير صالح');
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.warrantyClaim.findUnique({ where: { id } });
      if (!claim) throw new NotFoundException('المطالبة غير موجودة');
      if (claim.isResolved) throw new BadRequestException('المطالبة محلولة مسبقاً');
      const resolved = dto.verdict !== 'PENDING_INSPECTION';
      const updated = await tx.warrantyClaim.update({
        where: { id },
        data: {
          technicianVerdict: dto.verdict,
          actionTaken: dto.actionTaken?.trim() || null,
          isResolved: resolved,
          resolvedAt: resolved ? new Date() : null,
        },
      });
      if (dto.verdict === 'APPROVED_REPAIR') {
        const device = await tx.deviceSerial.findUnique({ where: { id: claim.deviceSerialId } });
        if (device && device.status === 'WARRANTY_CLAIMED') {
          await tx.deviceSerial.update({ where: { id: device.id }, data: { status: 'UNDER_REPAIR' } });
          await this.event(tx, device.id, 'REPAIR_INTAKE', `تحويل للصيانة بموجب ${claim.claimNumber}`, {
            referenceType: 'MANUAL',
            referenceId: claim.claimNumber,
            operatorId: dto.operatorId,
          });
        }
      }
      return updated;
    });
  }

  async listClaims(activeOnly?: boolean) {
    return this.prisma.warrantyClaim.findMany({
      where: activeOnly ? { isResolved: false } : {},
      include: { device: { select: { id: true, imei1: true, item: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}
