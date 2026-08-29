import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CreatePaymentDto {
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
}
