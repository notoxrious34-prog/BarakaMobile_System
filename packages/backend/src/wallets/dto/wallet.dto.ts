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
