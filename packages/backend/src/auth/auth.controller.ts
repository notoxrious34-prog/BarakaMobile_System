import { Controller, Get, Post, Patch, Body, Param, Headers, InternalServerErrorException, HttpException } from '@nestjs/common';
import { AuthService, capabilitiesFor } from './auth.service';
import { UserRole } from '@prisma/client';

function tokenOf(headers: Record<string, string | string[] | undefined>): string | undefined {
  const raw = headers['x-session-token'] ?? headers['X-Session-Token'];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

/** Re-throw unexpected failures with the exact DB cause (never a bare 500). */
function unmask(action: string, e: unknown): never {
  if (e instanceof HttpException) throw e;
  const err = e as { message?: string; code?: string };
  console.error(`CRITICAL AUTH ERROR [${action}]:`, e);
  throw new InternalServerErrorException({
    error: `${action} Failed`,
    message: err?.message || 'Unknown database error',
    code: err?.code,
  });
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/pin-login')
  async pinLogin(@Body() dto: { pin?: string; username?: string }) {
    try {
      const pin = (dto.pin ?? '').trim();
      const result = dto.username?.trim()
        ? await this.auth.loginByCredentials(dto.username, pin)
        : await this.auth.loginByPin(pin);
      return { ...result, capabilities: capabilitiesFor(result.user) };
    } catch (e) {
      unmask('PIN Login', e);
    }
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
    try {
      return await this.auth.operatorDirectory();
    } catch (e) {
      unmask('Operators Directory', e);
    }
  }

  @Post('auth/bootstrap-admin')
  async bootstrapAdmin() {
    try {
      return await this.auth.bootstrapAdmin();
    } catch (e) {
      unmask('Bootstrap', e);
    }
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
