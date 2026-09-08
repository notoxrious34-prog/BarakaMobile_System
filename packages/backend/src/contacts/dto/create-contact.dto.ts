import { IsString, IsNotEmpty, MinLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { ContactRole } from '@prisma/client';

export class CreateContactDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsEnum(ContactRole)
  @IsNotEmpty()
  role!: ContactRole;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  openingBalanceSupplier?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  openingBalanceCustomer?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  creditLimit?: string;
}
