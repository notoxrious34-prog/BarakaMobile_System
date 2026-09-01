import { IsString, IsNotEmpty, IsOptional, IsEnum, Matches } from 'class-validator';

export class CreateRepairTicketDto {
  @IsString()
  @IsNotEmpty()
  contactId!: string;

  @IsEnum(['PHONE', 'TABLET', 'LAPTOP', 'OTHER'] as any)
  @IsNotEmpty()
  deviceType!: string;

  @IsString()
  @IsNotEmpty()
  deviceBrand!: string;

  @IsString()
  @IsNotEmpty()
  deviceModel!: string;

  @IsString()
  @IsNotEmpty()
  problemDescription!: string;

  @IsOptional()
  @IsEnum(['INTERNAL', 'EXTERNAL'] as any)
  repairType?: string;

  @IsOptional()
  @IsString()
  technicianName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  estimatedCost?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  depositAmount?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
