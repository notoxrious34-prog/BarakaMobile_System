import { IsString, IsNotEmpty, Matches, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ExpensePaymentSource } from '@prisma/client';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  expenseDate?: string;

  @IsEnum(ExpensePaymentSource)
  @IsOptional()
  paymentSource?: ExpensePaymentSource;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  recipientName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  invoiceReference?: string;
}
