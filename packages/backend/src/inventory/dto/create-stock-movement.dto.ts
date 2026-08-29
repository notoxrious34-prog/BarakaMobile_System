import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { MovementType } from '@prisma/client';

export class CreateStockMovementDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsEnum(MovementType)
  @IsNotEmpty()
  type!: MovementType;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  reference?: string;
}
