import { Controller, Get, Post, Put, Delete, Body, Param, Res, UploadedFile, UseInterceptors, Headers, StreamableFile, NotFoundException, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BackupService } from './backup.service';
import { AuthService } from '../../auth/auth.service';
import { sessionTokenOf } from '../../auth/session-header';

/** TB-128: BMBAK1 .bak engine under /api/backup (TB-112 .akb engine untouched). */
@Controller('backup')
export class BackupV2Controller {
  constructor(
    private readonly backupService: BackupService,
    private readonly authService: AuthService,
  ) {}

  @Post('create')
  create(@Body() body?: { kind?: string }) {
    const kind = body?.kind === 'pre-update' ? 'pre-update' : body?.kind === 'auto' ? 'auto' : 'manual';
    return this.backupService.createBakBackup(kind);
  }

  @Get('download/:filename')
  async download(@Param('filename') filename: string, @Res({ passthrough: true }) res: any) {
    const destDir = await this.backupService.backupDestinationDir();
    const full = path.join(destDir, path.basename(filename));
    if (!fs.existsSync(full)) {
      throw new NotFoundException({ code: 'BACKUP_NOT_FOUND', path: filename });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(full) + '"');
    return new StreamableFile(fs.createReadStream(full));
  }

  @Get('status')
  status() {
    return this.backupService.backupStatus();
  }

  @Get('list')
  list() {
    return this.backupService.listBakBackups();
  }

  @Post('restore')
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir(), limits: { fileSize: 512 * 1024 * 1024 } }))
  async restore(
    @UploadedFile() file: { path: string; originalname: string; size: number } | undefined,
    @Body() dto: { path?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    const input = file?.path ?? dto?.path;
    if (!input) {
      throw new BadRequestException({ code: 'BACKUP_NO_INPUT', hint: 'Provide multipart file or { path }' });
    }
    try {
      return await this.backupService.restoreBak(input);
    } finally {
      // Uploaded temp copies never linger.
      if (file?.path) {
        try { fs.rmSync(file.path, { force: true }); } catch { /* best effort */ }
      }
    }
  }

  @Post('verify')
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir(), limits: { fileSize: 512 * 1024 * 1024 } }))
  async verify(
    @UploadedFile() file: { path: string; originalname: string } | undefined,
    @Body() dto: { path?: string },
  ) {
    const cleanup: string[] = [];
    try {
      if (file?.path) {
        cleanup.push(file.path);
        return await this.backupService.verifyBak(fs.readFileSync(file.path), file.originalname);
      }
      if (dto?.path) {
        const destDir = await this.backupService.backupDestinationDir();
        const full = path.isAbsolute(dto.path) && fs.existsSync(dto.path)
          ? dto.path
          : path.join(destDir, path.basename(dto.path));
        if (!fs.existsSync(full)) throw new NotFoundException({ code: 'BACKUP_NOT_FOUND', path: dto.path });
        return await this.backupService.verifyBak(fs.readFileSync(full), path.basename(full));
      }
      throw new BadRequestException({ code: 'BACKUP_NO_INPUT', hint: 'Provide multipart file or { path }' });
    } finally {
      for (const p of cleanup) {
        try { fs.rmSync(p, { force: true }); } catch { /* best effort */ }
      }
    }
  }

  @Delete(':filename')
  async remove(
    @Param('filename') filename: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.backupService.deleteBak(filename);
  }

  @Get('settings')
  settings() {
    return this.backupService.getBackupSettings();
  }

  @Put('settings')
  async updateSettings(
    @Body() dto: { autoEnabled?: boolean; intervalHours?: number; retentionCount?: number; destinationDir?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    await this.authService.requireAdmin(sessionTokenOf(headers));
    return this.backupService.updateBackupSettings(dto);
  }
}
