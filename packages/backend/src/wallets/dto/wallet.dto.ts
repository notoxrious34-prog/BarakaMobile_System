import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, Matches, MaxLength } from 'class-validator';

export const MONEY_RE = /^\d+(\.\d{1,2})?$/;
export const SIGNED_MONEY_RE = /^-?\d+(\.\d{1,2})?$/;
export const RATE_RE = /^\d+(\.\d{1,4})?$/;
export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEnum(['FLEXY', 'GAMING', 'FOREIGN_CURRENCY', 'GENERIC'] as any)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  defaultSupplierId?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_RE)
  lowBalanceThreshold?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWalletDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  defaultSupplierId?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_RE)
  lowBalanceThreshold?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWalletServiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_RE)
  networkBrandColor?: string;

  @IsOptional()
  @IsString()
  @Matches(RATE_RE)
  commissionRate?: string;

  @IsOptional()
  @IsEnum(['PERCENTAGE', 'FIXED_MARGIN'] as any)
  pricingMode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWalletServiceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_RE)
  networkBrandColor?: string;

  @IsOptional()
  @IsString()
  @Matches(RATE_RE)
  commissionRate?: string;

  @IsOptional()
  @IsEnum(['PERCENTAGE', 'FIXED_MARGIN'] as any)
  pricingMode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdjustLedgerDto {
  @IsString()
  @IsNotEmpty()
  @Matches(SIGNED_MONEY_RE)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class TopupWalletDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(MONEY_RE)
  topupAmount!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(MONEY_RE)
  paidAmount!: string;

  @IsOptional()
  @IsEnum(['CASH', 'BANK_TRANSFER'] as any)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SellFlexyDto {
  @IsString()
  @IsNotEmpty()
  walletServiceId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(MONEY_RE)
  nominalAmount!: string;

  @IsOptional()
  @IsString()
  @Matches(/^0[567]\d{8}$/)
  @MaxLength(20)
  beneficiaryPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateWalletServicePatchDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  // Decimal rate string ('0.0350') or plain number (0.035); means fraction of 1.
  @IsOptional()
  @IsNotEmpty()
  commissionRate?: string | number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_RE)
  networkBrandColor?: string;

  @IsOptional()
  @IsEnum(['PERCENTAGE', 'FIXED_MARGIN'] as any)
  pricingMode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdjustWalletBalanceDto {
  @IsNotEmpty()
  amount!: string | number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
