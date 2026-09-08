import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { AccountRole, ContactRole } from '@prisma/client';
import Decimal from 'decimal.js';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAmount(value: string | undefined): string {
    const raw = value ?? '0.00';
    return new Decimal(raw).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  }

  async create(dto: CreateContactDto) {
    return this.prisma.$transaction(async (tx) => {
      const creditLimit = this.normalizeAmount((dto as any).creditLimit);
      const contact = await tx.contact.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          address: dto.address,
          role: dto.role,
          notes: dto.notes,
          creditLimit,
        },
      });

      if (dto.role === ContactRole.SUPPLIER || dto.role === ContactRole.BOTH) {
        const openingBalance = this.normalizeAmount(dto.openingBalanceSupplier);
        await tx.account.create({
          data: {
            contactId: contact.id,
            role: AccountRole.SUPPLIER,
            openingBalance,
            currentBalance: openingBalance,
          },
        });
      }

      if (dto.role === ContactRole.CUSTOMER || dto.role === ContactRole.BOTH) {
        const openingBalance = this.normalizeAmount(dto.openingBalanceCustomer);
        await tx.account.create({
          data: {
            contactId: contact.id,
            role: AccountRole.CUSTOMER,
            openingBalance,
            currentBalance: openingBalance,
          },
        });
      }

      return tx.contact.findUnique({
        where: { id: contact.id },
        include: { accounts: true },
      });
    });
  }

  async findAll() {
    return this.prisma.contact.findMany({
      where: { isActive: true },
      include: { accounts: true },
    });
  }

  async findOne(id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, isActive: true },
      include: { accounts: true },
    });
    if (!contact) {
      throw new NotFoundException(`Contact with id ${id} not found`);
    }
    return contact;
  }

  async update(id: string, dto: UpdateContactDto) {
    if ((dto as any).role !== undefined) {
      throw new BadRequestException('role is immutable and cannot be updated');
    }

    await this.findOne(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if ((dto as any).creditLimit !== undefined) data.creditLimit = this.normalizeAmount((dto as any).creditLimit);

    return this.prisma.contact.update({
      where: { id },
      data,
      include: { accounts: true },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.contact.update({
      where: { id },
      data: { isActive: false },
      include: { accounts: true },
    });
  }

  async findByRole(role: AccountRole) {
    return this.prisma.contact.findMany({
      where: {
        isActive: true,
        accounts: {
          some: { role },
        },
      },
      include: { accounts: true },
    });
  }
}
