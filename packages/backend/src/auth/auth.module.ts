import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController, UsersController } from './auth.controller';

@Module({
  controllers: [AuthController, UsersController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
