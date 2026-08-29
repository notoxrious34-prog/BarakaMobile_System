import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ContactsModule } from './contacts/contacts.module';
import { AccountsModule } from './accounts/accounts.module';
import { InventoryModule } from './inventory/inventory.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [PrismaModule, ContactsModule, AccountsModule, InventoryModule, ServicesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
