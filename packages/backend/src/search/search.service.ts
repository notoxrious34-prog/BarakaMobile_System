import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SearchResult = {
  query: string;
  contacts: Array<{
    id: string;
    name: string;
    phone: string | null;
    role: string;
  }>;
  items: Array<{
    id: string;
    name: string;
    sku: string | null;
    sellingPrice: string;
    costPrice: string;
  }>;
  services: Array<{
    id: string;
    name: string;
    pricingType: string;
    fixedProfit: string | null;
    commissionPct: string | null;
  }>;
  totalCount: number;
};

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string, limit: number): Promise<SearchResult> {
    const [contacts, items, services] = await Promise.all([
      (this.prisma as any).contact.findMany({
        where: {
          isActive: true,
          OR: [{ name: { contains: q } }, { phone: { contains: q } }],
        },
        select: { id: true, name: true, phone: true, role: true },
        take: limit,
      }),
      (this.prisma as any).item.findMany({
        where: {
          isActive: true,
          OR: [{ name: { contains: q } }, { sku: { contains: q } }],
        },
        select: { id: true, name: true, sku: true, sellingPrice: true, costPrice: true },
        take: limit,
      }),
      (this.prisma as any).service.findMany({
        where: {
          isActive: true,
          OR: [{ name: { contains: q } }, { description: { contains: q } }],
        },
        select: { id: true, name: true, pricingType: true, fixedProfit: true, commissionPct: true },
        take: limit,
      }),
    ]);

    return {
      query: q,
      contacts,
      items,
      services,
      totalCount: contacts.length + items.length + services.length,
    };
  }
}
