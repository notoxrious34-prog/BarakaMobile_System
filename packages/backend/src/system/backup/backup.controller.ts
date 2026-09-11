import { Controller, Get, Post, Body, Param, Res, UploadedFile, UseInterceptors, Header, Headers } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StreamableFile } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BackupService } from './backup.service';
import { PreflightBackupDto, RestoreBackupDto, CreateBackupDto } from './dto/backup.dto';
import { AuthService } from '../../auth/auth.service';
import { sessionTokenOf } from '../../auth/session-header';

type H = Record<string, string | string[] | undefined>;

/**
 * TB-112 legacy .akb engine (DIRECTIVE-004 / DEF-DS-007). Every route is
 * admin-gated — identical guard to BackupV2Controller. In particular
 * POST restore overwrites the live SQLite file and must never be reachable
 * by unauthenticated or non-admin callers.
 */
@Controller('system/backup')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly authService: AuthService,
  ) {}

  @Post('now')
  async createManual(@Body() dto: CreateBackupDto, @Headers() headers: H) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.backupService.createBackup('manual', dto.note);
  }

  @Post('auto')
  async createAuto(@Body() dto: CreateBackupDto, @Headers() headers: H) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.backupService.createBackup('auto', dto.note);
  }

  @Get()
  async listBackups(@Headers() headers: H) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.backupService.listBackups();
  }

  @Get('download/:id')
  @Header('Content-Type', 'application/gzip')
  async download(@Param('id') id: string, @Res({ passthrough: true }) res: any, @Headers() headers: H) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    const full = this.backupService.getBackupFilePath(id);
    res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(full) + '"');
    return new StreamableFile(fs.createReadStream(full));
  }

  @Post('preflight')
  async preflight(@Body() dto: PreflightBackupDto, @Headers() headers: H) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.backupService.preflight(dto.path);
  }

  @Post('restore')
  async restore(@Body() dto: RestoreBackupDto, @Headers() headers: H) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.backupService.restore(dto.path);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir(), limits: { fileSize: 512 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: { path: string; originalname: string; size: number },
    @Headers() headers: H,
  ) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    if (!file) {
      return { ok: false as const, error: 'NO_FILE' };
    }
    const report = await this.backupService.preflight(file.path);
    return { ...report, originalName: file.originalname, sizeBytes: file.size };
  }
}
