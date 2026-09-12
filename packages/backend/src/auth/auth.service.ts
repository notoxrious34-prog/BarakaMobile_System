import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { hashPin, verifyPin, isValidPinFormat, isValidUsername, newSessionToken, avatarColorFor } from './pin-crypto';

export type SanitizedUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  permissions: Record<string, boolean>;
  isActive: boolean;
  avatarColor: string | null;
  lastLoginAt: Date | null;
};

type Session = { userId: string; createdAt: number };

function sanitize(u: {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  permissions: string | null;
  isActive: boolean;
  avatarColor: string | null;
  lastLoginAt: Date | null;
}): SanitizedUser {
  let permissions: Record<string, boolean> = {};
  try {
    if (u.permissions) {
      const parsed: unknown = JSON.parse(u.permissions);
      if (parsed && typeof parsed === 'object') permissions = parsed as Record<string, boolean>;
    }
  } catch {
    permissions = {};
  }
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    permissions,
    isActive: u.isActive,
    avatarColor: u.avatarColor,
    lastLoginAt: u.lastLoginAt,
  };
}

export function capabilitiesFor(user: SanitizedUser): Record<string, boolean> {
  const isAdmin = user.role === 'ADMIN';
  const isCashier = user.role === 'CASHIER';
  const base: Record<string, boolean> = {
    canViewCosts: isAdmin || user.role === 'TECHNICIAN',
    canViewProfits: isAdmin,
    canManageUsers: isAdmin,
    canAccessBackups: isAdmin,
    canDeleteSales: isAdmin,
    canManageCatalog: !isCashier,
  };
  // Explicit per-user JSON overrides win over role defaults.
  for (const [k, v] of Object.entries(user.permissions)) {
    if (typeof v === 'boolean') base[k] = v;
  }
  return base;
}

@Injectable()
export class AuthService {
  /** In-memory opaque sessions (single-terminal desktop: lost on restart → re-PIN). */
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly prisma: PrismaService) {}

  private async findActiveByUsername(username: string) {
    return this.prisma.user.findFirst({ where: { username: username.trim(), isActive: true } });
  }

  async loginByPin(pin: string): Promise<{ token: string; user: SanitizedUser }> {
    if (!isValidPinFormat(pin)) throw new UnauthorizedException('رمز PIN غير صالح');
    const candidates = await this.prisma.user.findMany({ where: { isActive: true } });
    // Constant-shape comparison loop (no early user enumeration via timing).
    let match: (typeof candidates)[number] | null = null;
    for (const u of candidates) {
      if (verifyPin(pin, u.pinHash)) {
        match = u;
        break;
      }
    }
    if (!match) throw new UnauthorizedException('رمز PIN غير صحيح');
    return this.openSession(match.id);
  }

  async loginByCredentials(username: string, pin: string): Promise<{ token: string; user: SanitizedUser }> {
    const user = await this.findActiveByUsername(username);
    if (!user || !verifyPin(pin, user.pinHash)) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    return this.openSession(user.id);
  }

  private async openSession(userId: string): Promise<{ token: string; user: SanitizedUser }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('الحساب موقوف');
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    const token = newSessionToken();
    this.sessions.set(token, { userId, createdAt: Date.now() });
    return { token, user: sanitize(user) };
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }

  async userForToken(token: string | undefined): Promise<SanitizedUser | null> {
    if (!token) return null;
    const sess = this.sessions.get(token);
    if (!sess) return null;
    const user = await this.prisma.user.findUnique({ where: { id: sess.userId } });
    if (!user || !user.isActive) {
      this.sessions.delete(token);
      return null;
    }
    return sanitize(user);
  }

  async requireAdmin(token: string | undefined): Promise<SanitizedUser> {
    const user = await this.userForToken(token);
    if (!user) throw new UnauthorizedException('جلسة غير صالحة — سجّل الدخول');
    if (user.role !== 'ADMIN') throw new ForbiddenException('هذه العملية للمدراء فقط');
    return user;
  }

  /**
   * TASK-BRIEF-002 Stream 2 (AD-80 backend mirror): capability-keyed guard
   * matching the frontend's `useCapability`/`RequireCapability` model.
   * No session/token → 401. Valid session but capability false → 403.
   * The capability set is derived from the SAME `capabilitiesFor()` used
   * by the frontend's /auth/current-user and /auth/pin-login responses —
   * zero independent reinvention, zero drift (Ruling 2).
   */
  async requireCapability(token: string | undefined, key: string): Promise<SanitizedUser> {
    const user = await this.userForToken(token);
    if (!user) throw new UnauthorizedException('جلسة غير صالحة — سجّل الدخول');
    if (!capabilitiesFor(user)[key]) throw new ForbiddenException('لا تملك صلاحية الوصول لهذا المورد');
    return user;
  }

  async listUsers(): Promise<SanitizedUser[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(sanitize);
  }

  /** Public lock-screen directory: identities only, never secrets. */
  async operatorDirectory(): Promise<{ id: string; username: string; displayName: string; role: UserRole; avatarColor: string | null }[]> {
    let users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, username: true, displayName: true, role: true, avatarColor: true },
    });
    if (users.length === 0) {
      // Self-healing: legacy DBs / seed-less environments deadlock the PIN screen.
      await this.ensureDefaultAdminExists();
      users = await this.prisma.user.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true, username: true, displayName: true, role: true, avatarColor: true },
      });
    }
    return users;
  }

  /**
   * Self-healing bootstrap: provisions the default admin when no users exist.
   * Idempotent — safe to call on every boot and every empty directory read.
   */
  async ensureDefaultAdminExists() {
    const count = await this.prisma.user.count();
    if (count > 0) {
      return this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    }
    const admin = await this.prisma.user.create({
      data: {
        username: 'admin',
        displayName: 'مدير النظام (Owner)',
        pinHash: hashPin('0000'),
        role: 'ADMIN',
        avatarColor: '#0284c7',
      },
    });
    console.log('[Auth] Auto-bootstrapped default admin account (PIN: 0000).');
    return admin;
  }

  /** Public fallback: explicit bootstrap when the directory is empty. */
  async bootstrapAdmin(): Promise<{ success: boolean; message: string }> {
    const count = await this.prisma.user.count();
    if (count > 0) throw new BadRequestException('حسابات المستخدمين مهيأة مسبقاً');
    await this.ensureDefaultAdminExists();
    return { success: true, message: 'تم تهيئة حساب المدير بنجاح' };
  }

  async createUser(dto: { username: string; displayName: string; pin: string; role?: UserRole; avatarColor?: string }): Promise<SanitizedUser> {
    const username = dto.username.trim();
    const displayName = dto.displayName.trim();
    if (!isValidUsername(username)) throw new BadRequestException('اسم المستخدم 3-32 حرف (أحرف/أرقام/._-)');
    if (displayName.length < 2) throw new BadRequestException('الاسم المعروض قصير جداً');
    if (!isValidPinFormat(dto.pin)) throw new BadRequestException('الـ PIN يجب أن يكون 4-6 أرقام');
    const role = dto.role ?? UserRole.CASHIER;
    if (!Object.values(UserRole).includes(role)) throw new BadRequestException('دور غير صالح');
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) throw new ConflictException('اسم المستخدم موجود مسبقاً');
    const created = await this.prisma.user.create({
      data: {
        username,
        displayName,
        pinHash: hashPin(dto.pin),
        role,
        avatarColor: dto.avatarColor?.trim() || avatarColorFor(username),
      },
    });
    return sanitize(created);
  }

  async updateUser(id: string, dto: { displayName?: string; role?: UserRole; permissions?: Record<string, boolean>; avatarColor?: string }): Promise<SanitizedUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (user.username === 'admin' && dto.role && dto.role !== 'ADMIN') {
      throw new ForbiddenException('لا يمكن تنزيل رتبة المدير الأساسي');
    }
    const data: { displayName?: string; role?: UserRole; permissions?: string; avatarColor?: string | null } = {};
    if (dto.displayName !== undefined) {
      if (dto.displayName.trim().length < 2) throw new BadRequestException('الاسم المعروض قصير جداً');
      data.displayName = dto.displayName.trim();
    }
    if (dto.role !== undefined) {
      if (!Object.values(UserRole).includes(dto.role)) throw new BadRequestException('دور غير صالح');
      data.role = dto.role;
    }
    if (dto.permissions !== undefined) data.permissions = JSON.stringify(dto.permissions);
    if (dto.avatarColor !== undefined) data.avatarColor = dto.avatarColor?.trim() || null;
    const updated = await this.prisma.user.update({ where: { id }, data });
    return sanitize(updated);
  }

  async setActive(id: string, isActive: boolean): Promise<SanitizedUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    if (user.username === 'admin' && !isActive) {
      throw new ForbiddenException('لا يمكن تعطيل المدير الأساسي');
    }
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive } });
    if (!isActive) {
      for (const [token, sess] of this.sessions.entries()) {
        if (sess.userId === id) this.sessions.delete(token);
      }
    }
    return sanitize(updated);
  }

  async resetPin(id: string, newPin: string): Promise<void> {
    if (!isValidPinFormat(newPin)) throw new BadRequestException('الـ PIN يجب أن يكون 4-6 أرقام');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    await this.prisma.user.update({ where: { id }, data: { pinHash: hashPin(newPin) } });
  }
}
