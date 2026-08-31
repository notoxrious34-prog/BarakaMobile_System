import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 7 default Settings (idempotent upsert)
  const settings: Array<{ key: string; value: string }> = [
    { key: 'business_name', value: 'BarakaMobile' },
    { key: 'business_phone', value: '+213 000 000 000' },
    { key: 'business_address', value: 'Algeria' },
    { key: 'currency_symbol', value: 'د.ج' },
    { key: 'low_stock_threshold', value: '5' },
    { key: 'invoice_footer_note', value: 'شكرا لتعاملكم معنا' },
    { key: 'invoice_sequence_next', value: '1' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // Single CashAccount
  const existingCash = await (prisma as any).cashAccount.findFirst();
  if (!existingCash) {
    await (prisma as any).cashAccount.create({ data: { currentBalance: '0.00' } });
  }

  // Default ExpenseCategories (4)
  const categories = ['كهرباء وماء', 'إيجار', 'صيانة', 'أخرى'];
  for (const name of categories) {
    const existing = await (prisma as any).expenseCategory.findFirst({ where: { name } });
    if (!existing) {
      await (prisma as any).expenseCategory.create({ data: { name } });
    }
  }

  // Walk-in customer Contact + CUSTOMER Account
  const walkIn = await prisma.contact.findFirst({ where: { isWalkIn: true } });
  if (!walkIn) {
    const c = await prisma.contact.create({
      data: {
        name: 'زبون عابر',
        role: 'CUSTOMER',
        isWalkIn: true,
        isActive: true,
      },
    });
    const existingAcc = await (prisma as any).account.findFirst({
      where: { contactId: c.id, role: 'CUSTOMER' },
    });
    if (!existingAcc) {
      await (prisma as any).account.create({
        data: {
          contactId: c.id,
          role: 'CUSTOMER',
          openingBalance: '0.00',
          currentBalance: '0.00',
        },
      });
    }
  } else {
    // Ensure account exists even if contact already present
    const existingAcc = await (prisma as any).account.findFirst({
      where: { contactId: walkIn.id, role: 'CUSTOMER' },
    });
    if (!existingAcc) {
      await (prisma as any).account.create({
        data: {
          contactId: walkIn.id,
          role: 'CUSTOMER',
          openingBalance: '0.00',
          currentBalance: '0.00',
        },
      });
    }
  }

  console.log('Seed completed: Settings 7, CashAccount 1, ExpenseCategory 4, WalkIn 1');
  const counts = {
    settings: await prisma.setting.count(),
    cashAccount: await (prisma as any).cashAccount.count(),
    expenseCategory: await (prisma as any).expenseCategory.count(),
    walkIn: await prisma.contact.count({ where: { isWalkIn: true } }),
  };
  console.log(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
