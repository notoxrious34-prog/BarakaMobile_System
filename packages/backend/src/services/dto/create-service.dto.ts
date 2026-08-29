import { IsString, IsNotEmpty, MinLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { PricingType } from '@prisma/client';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsEnum(PricingType)
  @IsNotEmpty()
  pricingType!: PricingType;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  fixedProfit?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  commissionPct?: string;
}
