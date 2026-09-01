import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class UpdateRepairStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  actualCost?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
