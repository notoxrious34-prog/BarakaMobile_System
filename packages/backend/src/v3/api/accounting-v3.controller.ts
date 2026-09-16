import { Body, Controller, Get, Post, Query, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { ChartOfAccountsService } from '../../accounting/chart-of-accounts.service';
import { ReconciliationService } from '../../accounting/reconciliation.service';
import { FinancialStatementsService } from '../../accounting/financial-statements.service';
import { PeriodClosingService } from '../../accounting/period-closing.service';
import { ServerRbacGuard } from '../../core/guards/server-rbac.guard';
import { CurrentUser } from '../../core/guards/auth.decorator';
import type { SanitizedUser } from '../../auth/auth.service';
import { ValidationError } from '../../core/result';
import { DomainErrorFilter } from './common/domain-error.filter';
import { ResponseEnvelopeInterceptor } from './common/envelope.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { CloseFiscalPeriodDto } from './dto/v3-treasury-accounting.dto';

/**
 * DIRECTIVE-019 Stage 9.2 — v3 accounting gateway (`/api/v3/accounting`).
 *
 * Read-only reporting (COA matrix with live balances, trial balance,
 * income statement, balance sheet) plus the guarded period-close
 * mutation. Date inputs arrive as ISO query strings and are parsed here
 * (invalid dates → 400); all money math stays inside the domain
 * services. IdempotencyInterceptor is registered uniformly, though GETs
 * never carry a key and pass straight through.
 */
@Controller('v3/accounting')
@UseGuards(ServerRbacGuard)
@UseFilters(DomainErrorFilter)
@UseInterceptors(ResponseEnvelopeInterceptor, IdempotencyInterceptor)
export class AccountingV3Controller {
  constructor(
    private readonly coa: ChartOfAccountsService,
    private readonly reconciliation: ReconciliationService,
    private readonly statements: FinancialStatementsService,
    private readonly closing: PeriodClosingService,
  ) {}

  private parseDate(value: string | undefined, what: string): Date | undefined {
    if (value === undefined) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError(`AccountingV3Controller: ${what} must be a valid ISO date string.`, { [what]: value });
    }
    return date;
  }

  @Get('chart-of-accounts')
  async chartOfAccounts() {
    const [accounts, trial] = await Promise.all([
      this.coa.listAccounts(),
      this.reconciliation.getTrialBalance(new Date()),
    ]);
    const nets = new Map(trial.accounts.map((row) => [row.accountCode, row]));
    return accounts.map((account) => {
      const row = nets.get(account.accountCode);
      return {
        accountCode: account.accountCode,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        isControl: account.isControl,
        isActive: account.isActive,
        totalDebit: row?.totalDebit ?? '0.00',
        totalCredit: row?.totalCredit ?? '0.00',
        netBalance: row?.netBalance ?? '0.00',
      };
    });
  }

  @Get('trial-balance')
  trialBalance(@Query('asOfDate') asOfDate?: string, @Query('periodId') periodId?: string) {
    if (periodId) {
      return this.trialBalanceForPeriod(periodId);
    }
    return this.reconciliation.getTrialBalance(this.parseDate(asOfDate, 'asOfDate') ?? new Date());
  }

  private async trialBalanceForPeriod(periodId: string) {
    const sheet = await this.statements.getBalanceSheet({ periodId });
    return this.reconciliation.getTrialBalance(sheet.asOfDate);
  }

  @Get('income-statement')
  incomeStatement(
    @Query('periodId') periodId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.statements.getIncomeStatement({
      periodId,
      startDate: this.parseDate(startDate, 'startDate'),
      endDate: this.parseDate(endDate, 'endDate'),
    });
  }

  @Get('balance-sheet')
  balanceSheet(@Query('asOfDate') asOfDate?: string, @Query('periodId') periodId?: string) {
    return this.statements.getBalanceSheet({
      asOfDate: this.parseDate(asOfDate, 'asOfDate'),
      periodId,
    });
  }

  @Post('fiscal-periods/close')
  closePeriod(@Body() dto: CloseFiscalPeriodDto, @CurrentUser() user?: SanitizedUser) {
    return this.closing.closeFiscalPeriod({ periodId: dto.periodId, actorUserId: user?.id });
  }
}
