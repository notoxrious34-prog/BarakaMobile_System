import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

/**
 * DIRECTIVE-018 Stage 9.1 — v3 HTTP DTOs (presentation layer).
 *
 * class-validator shapes for the global ValidationPipe
 * (whitelist + forbidNonWhitelisted): unknown fields are rejected,
 * money travels as strict 2dp decimal strings (Rule ③), ids are
 * non-empty strings (cuid/uuid — never asserted as UUIDv4).
 */

export const MONEY_2DP = /^\d+(\.\d{1,2})?$/;

export const SALE_PAYMENT_METHODS = ['CASH', 'DIGITAL_WALLET', 'BANK_TRANSFER'] as const;
export const REFUND_METHODS = ['CASH', 'BANK_TRANSFER', 'CUSTOMER_CREDIT_REDUCTION'] as const;
export const RETURN_CONDITIONS = ['RESTOCKED_INVENTORY', 'DEFECTIVE_QUARANTINE'] as const;
export const REPAIR_STATUSES = [
  'DIAGNOSING',
  'QUOTED',
  'APPROVED',
  'IN_PROGRESS', // Alias of the FSM's IN_REPAIR (accepted by the controller).
  'IN_REPAIR',
  'READY',
  'DELIVERED',
  'CANCELLED',
] as const;

export class SaleLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsOptional()
  @IsString()
  serialId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @Matches(MONEY_2DP, { message: 'unitPrice must be a decimal string like "150.00".' })
  unitPrice!: string;
}

export class PaymentSplitDto {
  @IsIn([...SALE_PAYMENT_METHODS])
  paymentMethod!: (typeof SALE_PAYMENT_METHODS)[number];

  @IsString()
  @Matches(MONEY_2DP, { message: 'amount must be a decimal string like "150.00".' })
  amount!: string;
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  partyId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  lines!: SaleLineDto[];

  @IsOptional()
  @IsString()
  @Matches(MONEY_2DP, { message: 'discountAmount must be a decimal string like "10.00".' })
  discountAmount?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  payments!: PaymentSplitDto[];
}

export class PurchaseSerialDto {
  @IsString()
  @IsNotEmpty()
  imei1!: string;

  @IsOptional()
  @IsString()
  imei2?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  warrantyMonths?: number;
}

export class PurchaseLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @Matches(MONEY_2DP, { message: 'unitCost must be a decimal string like "150.00".' })
  unitCost!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseSerialDto)
  serials?: PurchaseSerialDto[];
}

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  partyId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];

  @IsOptional()
  @IsString()
  @Matches(MONEY_2DP, { message: 'discountAmount must be a decimal string like "10.00".' })
  discountAmount?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  payments!: PaymentSplitDto[];
}

export class SalesReturnLineDto {
  @IsString()
  @IsNotEmpty()
  documentLineId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsIn([...RETURN_CONDITIONS])
  condition!: (typeof RETURN_CONDITIONS)[number];
}

export class CreateSalesReturnDto {
  @IsString()
  @IsNotEmpty()
  originalDocumentId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesReturnLineDto)
  lines!: SalesReturnLineDto[];

  @IsIn([...REFUND_METHODS])
  refundMethod!: (typeof REFUND_METHODS)[number];

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreateRepairDto {
  @IsString()
  @IsNotEmpty()
  partyId!: string;

  @IsString()
  @IsNotEmpty()
  deviceType!: string;

  @IsString()
  @IsNotEmpty()
  brand!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsOptional()
  @IsString()
  serialOrImei?: string;

  @IsString()
  @IsNotEmpty()
  reportedIssue!: string;
}

export class UpdateRepairStatusDto {
  @IsIn([...REPAIR_STATUSES])
  status!: (typeof REPAIR_STATUSES)[number];

  @IsOptional()
  @IsString()
  technicianId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  diagnosisNotes?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_2DP, { message: 'laborPrice must be a decimal string like "150.00".' })
  laborPrice?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_2DP, { message: 'estimatedCost must be a decimal string like "150.00".' })
  estimatedCost?: string;
}

export class AddRepairPartDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @Matches(MONEY_2DP, { message: 'unitPrice must be a decimal string like "150.00".' })
  unitPrice!: string;
}

export class DeliverRepairDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  payments!: PaymentSplitDto[];

  @IsOptional()
  @IsString()
  @Matches(MONEY_2DP, { message: 'discountAmount must be a decimal string like "10.00".' })
  discountAmount?: string;
}
