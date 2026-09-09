import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupV2Controller } from './backup-v2.controller';
import { BackupService } from './backup.service';
import { SettingsModule } from '../../settings/settings.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [SettingsModule, AuthModule],
  controllers: [BackupController, BackupV2Controller],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
