import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { MONEY_2DP } from './v3.dto';

/**
 * DIRECTIVE-019 Stage 9.2 — v3 treasury & accounting HTTP DTOs.
 *
 * Same presentation contract as the commercial DTOs: strict 2dp money
 * strings (Rule ③), non-empty id strings, enum whitelists. `actorUserId`
 * and cashier identity are server-derived from `CurrentUser` — never
 * client-supplied. Date-range / as-of inputs travel as query strings and
 * are parsed by the controllers (invalid dates → 400).
 */

export class OpenShiftDto {
  @IsString()
  @IsNotEmpty()
  registerId!: string;

  @IsString()
  @Matches(MONEY_2DP, { message: 'openingCash must be a decimal string like "200.00".' })
  openingCash!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseShiftDto {
  @IsString()
  @Matches(MONEY_2DP, { message: 'actualCash must be a decimal string like "215.50".' })
  actualCash!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ShiftCashMovementDto {
  @IsString()
  @Matches(MONEY_2DP, { message: 'amount must be a decimal string like "50.00".' })
  amount!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class FlexyTopUpDto {
  @IsString()
  @IsNotEmpty()
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  targetPhoneNumber!: string;

  @IsString()
  @Matches(MONEY_2DP, { message: 'faceAmount must be a decimal string like "100.00".' })
  faceAmount!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_2DP, { message: 'costAmount must be a decimal string like "90.00".' })
  costAmount?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_2DP, { message: 'feeAmount must be a decimal string like "5.00".' })
  feeAmount?: string;

  @IsIn(['CASH', 'ON_ACCOUNT'])
  paymentMethod!: 'CASH' | 'ON_ACCOUNT';

  @IsOptional()
  @IsString()
  partyId?: string;
}

export class FloatTransferDto {
  @IsIn(['CASH', 'BANK', 'WALLET'])
  sourceAccountType!: 'CASH' | 'BANK' | 'WALLET';

  @IsOptional()
  @IsString()
  sourceWalletId?: string;

  @IsIn(['CASH', 'BANK', 'WALLET'])
  targetAccountType!: 'CASH' | 'BANK' | 'WALLET';

  @IsOptional()
  @IsString()
  targetWalletId?: string;

  @IsString()
  @Matches(MONEY_2DP, { message: 'amount must be a decimal string like "200.00".' })
  amount!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CloseFiscalPeriodDto {
  @IsString()
  @IsNotEmpty()
  periodId!: string;
}
