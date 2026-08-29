import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateOffsetDto {
  @IsString()
  @IsNotEmpty()
  contactId!: string;

  @IsString()
  @IsOptional()
  note?: string;
}
