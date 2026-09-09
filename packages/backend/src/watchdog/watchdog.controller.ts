import { Controller, Get, Put, Body, Query, Headers } from '@nestjs/common';
import { WatchdogService } from './watchdog.service';
import { AuthService } from '../auth/auth.service';
import { sessionTokenOf } from '../auth/session-header';

@Controller('watchdog')
export class WatchdogController {
  constructor(
    private readonly watchdog: WatchdogService,
    private readonly authService: AuthService,
  ) {}

  @Get('summary')
  summary() {
    return this.watchdog.summary();
  }

  @Get('repairs')
  repairs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ) {
    return this.watchdog.repairs(
      filter ?? 'all',
      Number.parseInt(page ?? '1', 10),
      Number.parseInt(limit ?? '50', 10),
    );
  }

  @Get('warranties')
  warranties(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
  ) {
    return this.watchdog.warranties(
      filter ?? 'all',
      Number.parseInt(page ?? '1', 10),
      Number.parseInt(limit ?? '50', 10),
    );
  }

  @Get('settings')
  settings() {
    return this.watchdog.getSettings();
  }

  @Put('settings')
  async updateSettings(
    @Body() dto: { repairGraceDays: number; warrantyAlertDays: number },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.watchdog.updateSettings(dto.repairGraceDays, dto.warrantyAlertDays);
  }
}
