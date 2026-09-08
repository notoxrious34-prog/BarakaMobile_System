import { IsString, IsNotEmpty, IsEnum, IsOptional, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReturnConditionDto {
  RESTOCKED_INVENTORY = 'RESTOCKED_INVENTORY',
  DEFECTIVE_QUARANTINE = 'DEFECTIVE_QUARANTINE',
}

export enum RefundMethodDto {
  CASH = 'CASH',
  CUSTOMER_CREDIT_REDUCTION = 'CUSTOMER_CREDIT_REDUCTION',
  STORE_CREDIT = 'STORE_CREDIT',
}

export class CreateSalesReturnItemDto {
  @IsString()
  @IsNotEmpty()
  transactionItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsEnum(ReturnConditionDto)
  condition!: ReturnConditionDto;

  @IsOptional()
  @IsString()
  serialNumber?: string;
}

export class CreateSalesReturnDto {
  @IsString()
  @IsNotEmpty()
  originalTransactionId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsEnum(RefundMethodDto)
  refundMethod!: RefundMethodDto;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesReturnItemDto)
  items!: CreateSalesReturnItemDto[];

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;
}
