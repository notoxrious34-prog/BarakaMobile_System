import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class PreflightBackupDto {
  /** Server-side backup filename (automated dir) or temp upload path. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  path!: string;
}

export class RestoreBackupDto {
  /** Verified server-side path previously returned by preflight/upload. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  path!: string;
}

export class CreateBackupDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
