import { Controller, Get, Param, Query, Headers } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AuthService, capabilitiesFor } from '../auth/auth.service';
import { sessionTokenOf } from '../auth/session-header';

type H = Record<string, string | string[] | undefined>;

/** TASK-BRIEF-002 Stream 2 (AD-80 backend mirror) profit-related keys — Ruling 1.A.
 *  Per the discovery log: profit.* subtree (todayProfit/monthProfit), the
 *  flat todayProfit/monthProfit/repairProfit aliases, and digital.profitToday
 *  are profit-related; digital.nominalToday/countToday/liquidity are NOT
 *  (non-profit stats) and must remain visible to every authenticated role.
 */
const TOP_LEVEL_PROFIT_KEYS = ['profit', 'todayProfit', 'monthProfit', 'repairProfit'] as const;

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly authService: AuthService,
  ) {}

  @Get('capital')
  async getCapital(@Headers() headers: H) {
    await this.authService.requireCapability(sessionTokenOf(headers), 'canViewProfits');
    return this.reportsService.getCapital();
  }

  @Get('profit')
  async getProfit(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Headers() headers: H,
  ) {
    await this.authService.requireCapability(sessionTokenOf(headers), 'canViewProfits');
    return this.reportsService.getNetProfit(startDate, endDate);
  }

  @Get('debt-summary')
  async getDebtSummary(@Headers() headers: H) {
    await this.authService.requireCapability(sessionTokenOf(headers), 'canViewProfits');
    return this.reportsService.getDebtSummary();
  }

  /**
   * TASK-BRIEF-002 Ruling 1.A: dual-audience endpoint. Stays reachable by
   * every authenticated role (no route-level block) but strips every
   * profit-related key from the payload when the caller lacks
   * canViewProfits — omitted entirely, not masked/zeroed client-side.
   */
  @Get('summary')
  async getSummary(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Headers() headers: H,
  ) {
    const full = await this.reportsService.getSummary(startDate, endDate);
    const user = await this.authService.userForToken(sessionTokenOf(headers));
    const canViewProfits = user ? !!capabilitiesFor(user).canViewProfits : false;
    if (canViewProfits) return full;
    const stripped: Record<string, unknown> = { ...full };
    for (const key of TOP_LEVEL_PROFIT_KEYS) delete stripped[key];
    if (stripped.digital && typeof stripped.digital === 'object') {
      const { profitToday: _omit, ...rest } = stripped.digital as Record<string, unknown>;
      stripped.digital = rest;
    }
    return stripped;
  }

  @Get('contacts/:contactId/position')
  getContactPosition(@Param('contactId') contactId: string) {
    return this.reportsService.getContactPosition(contactId);
  }

  @Get('accounts/:accountId/ledger')
  getLedger(@Param('accountId') accountId: string) {
    return this.reportsService.getLedger(accountId);
  }

  @Get('expenses')
  getExpensesReport(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.reportsService.getExpenseReport(startDate, endDate);
  }
}
