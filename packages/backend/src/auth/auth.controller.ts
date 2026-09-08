import { Controller, Get, Post, Patch, Body, Param, Headers } from '@nestjs/common';
import { AuthService, capabilitiesFor } from './auth.service';
import { UserRole } from '@prisma/client';

function tokenOf(headers: Record<string, string | string[] | undefined>): string | undefined {
  const raw = headers['x-session-token'] ?? headers['X-Session-Token'];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/pin-login')
  async pinLogin(@Body() dto: { pin?: string; username?: string }) {
    const pin = (dto.pin ?? '').trim();
    const result = dto.username?.trim()
      ? await this.auth.loginByCredentials(dto.username, pin)
      : await this.auth.loginByPin(pin);
    return { ...result, capabilities: capabilitiesFor(result.user) };
  }

  @Post('auth/logout')
  logout(@Headers() headers: Record<string, string | string[] | undefined>) {
    const token = tokenOf(headers);
    if (token) this.auth.logout(token);
    return { ok: true };
  }

  @Get('auth/current-user')
  async current(@Headers() headers: Record<string, string | string[] | undefined>) {
    const user = await this.auth.userForToken(tokenOf(headers));
    if (!user) return { user: null, capabilities: {} };
    return { user, capabilities: capabilitiesFor(user) };
  }

  @Get('auth/operators')
  async operators() {
    return this.auth.operatorDirectory();
  }

  @Post('auth/bootstrap-admin')
  async bootstrapAdmin() {
    return this.auth.bootstrapAdmin();
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  private admin(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.auth.requireAdmin(tokenOf(headers));
  }

  @Get()
  async list(@Headers() headers: Record<string, string | string[] | undefined>) {
    await this.admin(headers);
    return this.auth.listUsers();
  }

  @Post()
  async create(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() dto: { username: string; displayName: string; pin: string; role?: UserRole; avatarColor?: string },
  ) {
    await this.admin(headers);
    return this.auth.createUser(dto);
  }

  @Patch(':id')
  async update(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: { displayName?: string; role?: UserRole; permissions?: Record<string, boolean>; avatarColor?: string },
  ) {
    await this.admin(headers);
    return this.auth.updateUser(id, dto);
  }

  @Post(':id/active')
  async setActive(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: { isActive: boolean },
  ) {
    await this.admin(headers);
    return this.auth.setActive(id, !!dto.isActive);
  }

  @Post(':id/reset-pin')
  async resetPin(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: { newPin: string },
  ) {
    const admin = await this.admin(headers);
    void admin;
    return this.auth.resetPin(id, dto.newPin).then(() => ({ ok: true }));
  }
}
