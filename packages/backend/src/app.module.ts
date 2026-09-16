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
import { WatchdogModule } from './watchdog/watchdog.module';
import { CoreModule } from './core/core.module';
import { AccountingModule } from './accounting/accounting.module';
import { PartiesModule } from './parties/parties.module';
import { SalesModule } from './sales/sales.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { ReturnsModule } from './returns/returns.module';
import { RepairsModule } from './modules/repairs/repairs.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { FlexyWalletsModule } from './modules/wallets/wallets.module';

@Module({
  imports: [CoreModule, AccountingModule, PartiesModule, SalesModule, PurchasingModule, ReturnsModule, RepairsModule, ShiftsModule, FlexyWalletsModule, PrismaModule, ContactsModule, AccountsModule, InventoryModule, ServicesModule, TransactionsModule, ReportsModule, SettingsModule, SearchModule, CashModule, ExpensesModule, RepairModule, WalletsModule, BackupModule, CustomersModule, SalesReturnsModule, AuthModule, SerialsModule, WatchdogModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
