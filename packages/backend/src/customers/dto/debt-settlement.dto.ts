import { IsString, IsOptional, Matches } from 'class-validator';

export class DebtSettlementDto {
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  createdById?: string;
}
