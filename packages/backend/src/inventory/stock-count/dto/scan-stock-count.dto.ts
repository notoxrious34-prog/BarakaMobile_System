import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class ScanStockCountDto {
  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  inventoryItemId?: string;

  @IsInt()
  @IsOptional()
  quantityDelta?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  exactQuantity?: number;
}
