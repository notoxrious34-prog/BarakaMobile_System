import { Controller, Get, Post, Body, Param, Res, UploadedFile, UseInterceptors, Header } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StreamableFile } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BackupService } from './backup.service';
import { PreflightBackupDto, RestoreBackupDto, CreateBackupDto } from './dto/backup.dto';

@Controller('system/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('now')
  createManual(@Body() dto: CreateBackupDto) {
    return this.backupService.createBackup('manual', dto.note);
  }

  @Post('auto')
  createAuto(@Body() dto: CreateBackupDto) {
    return this.backupService.createBackup('auto', dto.note);
  }

  @Get()
  listBackups() {
    return this.backupService.listBackups();
  }

  @Get('download/:id')
  @Header('Content-Type', 'application/gzip')
  download(@Param('id') id: string, @Res({ passthrough: true }) res: any) {
    const full = this.backupService.getBackupFilePath(id);
    res.setHeader('Content-Disposition', 'attachment; filename="' + path.basename(full) + '"');
    return new StreamableFile(fs.createReadStream(full));
  }

  @Post('preflight')
  preflight(@Body() dto: PreflightBackupDto) {
    return this.backupService.preflight(dto.path);
  }

  @Post('restore')
  restore(@Body() dto: RestoreBackupDto) {
    return this.backupService.restore(dto.path);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir(), limits: { fileSize: 512 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: { path: string; originalname: string; size: number }) {
    if (!file) {
      return { ok: false as const, error: 'NO_FILE' };
    }
    const report = await this.backupService.preflight(file.path);
    return { ...report, originalName: file.originalname, sizeBytes: file.size };
  }
}
