import { IsString, IsOptional, IsIn, IsISO8601, Matches } from 'class-validator';

/**
 * AD-76 opening balance payload (TB-141). amount is an unsigned decimal
 * string; direction carries the sign (DEBIT = counterparty owes shop,
 * CREDIT = shop owes counterparty). date defaults to now.
 */
export class OpeningBalanceDto {
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @IsIn(['DEBIT', 'CREDIT'])
  direction!: 'DEBIT' | 'CREDIT';

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  createdById?: string;
}
