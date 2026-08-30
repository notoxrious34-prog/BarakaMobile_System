import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll() {
    return this.settingsService.getAll();
  }

  @Get('bulk')
  getBulk(@Query('keys') keys: string) {
    const keyList = keys
      ? keys
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
      : [];
    return this.settingsService.getBulk(keyList);
  }

  @Patch()
  updateMany(@Body() body: Record<string, string>) {
    return this.settingsService.updateMany(body);
  }

  @Get(':key')
  getOne(@Param('key') key: string) {
    return this.settingsService.get(key).then((value) => ({ key, value }));
  }

  @Patch(':key')
  updateOne(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.settingsService.update(key, dto.value);
  }
}
