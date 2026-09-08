import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

/** scrypt PIN hash (zero-dep, offline-safe). Format: `scrypt$<saltHex>$<hashHex>`. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  try {
    const [algo, salt, expected] = stored.split('$');
    if (algo !== 'scrypt' || !salt || !expected) return false;
    const actual = scryptSync(pin, salt, SCRYPT_KEYLEN);
    const ref = Buffer.from(expected, 'hex');
    if (actual.length !== ref.length) return false;
    return timingSafeEqual(actual, ref);
  } catch {
    return false;
  }
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(username);
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** Stable avatar color derived from username (no user input needed). */
export function avatarColorFor(username: string): string {
  const palette = ['#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626', '#4f46e5', '#0d9488', '#c026d3'];
  const h = createHash('sha256').update(username.toLowerCase()).digest();
  return palette[h[0]! % palette.length]!;
}
