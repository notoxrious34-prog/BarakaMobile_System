import { IsString, IsOptional, MinLength, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OpeningBalanceDto } from './opening-balance.dto';

/** AD-76 customer creation payload (TB-141). */
export class CreateCustomerDto {
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
  @IsString()
  creditLimit?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OpeningBalanceDto)
  openingBalance?: OpeningBalanceDto;
}
