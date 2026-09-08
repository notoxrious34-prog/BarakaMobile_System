import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ContactsModule } from './contacts/contacts.module';
import { AccountsModule } from './accounts/accounts.module';
import { InventoryModule } from './inventory/inventory.module';
import { ServicesModule } from './services/services.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { SearchModule } from './search/search.module';
import { CashModule } from './cash/cash.module';
import { ExpensesModule } from './expenses/expenses.module';
import { RepairModule } from './repair/repair.module';
import { WalletsModule } from './wallets/wallets.module';
import { BackupModule } from './system/backup/backup.module';
import { CustomersModule } from './customers/customers.module';
import { SalesReturnsModule } from './returns/sales-returns.module';
import { AuthModule } from './auth/auth.module';
import { SerialsModule } from './serials/serials.module';

@Module({
  imports: [PrismaModule, ContactsModule, AccountsModule, InventoryModule, ServicesModule, TransactionsModule, ReportsModule, SettingsModule, SearchModule, CashModule, ExpensesModule, RepairModule, WalletsModule, BackupModule, CustomersModule, SalesReturnsModule, AuthModule, SerialsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
