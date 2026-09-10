import { IsString, IsOptional, IsISO8601, Matches } from 'class-validator';

/** AD-77 settlement voucher payload (TB-143). amount is a positive decimal
 * string; paymentDate allows backdating and defaults to now. */
export class SettlementPaymentDto {
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @IsOptional()
  @IsISO8601()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  createdById?: string;
}
