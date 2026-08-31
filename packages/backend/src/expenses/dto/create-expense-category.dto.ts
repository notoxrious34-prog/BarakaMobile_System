import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;
}
