import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray, ValidateNested, IsInt, Min, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '@prisma/client';

export class ItemLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  unitPrice!: string;
}

export class ServiceLineDto {
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;
}

export class CreateTransactionDto {
  @IsEnum(TransactionType)
  @IsNotEmpty()
  type!: TransactionType;

  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ItemLineDto)
  itemLines?: ItemLineDto[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ServiceLineDto)
  serviceLines?: ServiceLineDto[];
}
