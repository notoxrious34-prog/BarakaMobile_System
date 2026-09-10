import { IsString, IsOptional, MinLength, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OpeningBalanceDto } from './opening-balance.dto';

/** AD-76 supplier creation payload (TB-141). */
export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OpeningBalanceDto)
  openingBalance?: OpeningBalanceDto;
}
