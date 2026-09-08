import { Module } from '@nestjs/common';
import { DeviceSerialService } from './device-serial.service';
import { DeviceSerialController } from './device-serial.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [DeviceSerialController],
  providers: [DeviceSerialService],
  exports: [DeviceSerialService],
})
export class SerialsModule {}
