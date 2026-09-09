import { Module } from '@nestjs/common';
import { WatchdogService } from './watchdog.service';
import { WatchdogController } from './watchdog.controller';
import { SettingsModule } from '../settings/settings.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SettingsModule, AuthModule],
  controllers: [WatchdogController],
  providers: [WatchdogService],
  exports: [WatchdogService],
})
export class WatchdogModule {}
