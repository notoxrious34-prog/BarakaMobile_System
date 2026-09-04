/**
 * TB-072 shared repair domain maps — single source of truth for statuses,
 * device/repair types, condition + accessory chip presets (DRY).
 * Status strings MUST match the backend literals exactly (AD-58).
 */

export type StatusTone = 'cyan' | 'amber' | 'violet' | 'emerald' | 'slate' | 'rose';

export const REPAIR_STATUS_ORDER = [
  'RECEIVED',
  'DIAGNOSING',
  'IN_REPAIR',
  'READY',
  'DELIVERED',
  'CANCELLED',
] as const;

export type RepairStatus = (typeof REPAIR_STATUS_ORDER)[number];

export const REPAIR_STATUS_MAP: Record<string, { label: string; tone: StatusTone }> = {
  RECEIVED: { label: 'مستلم', tone: 'cyan' },
  DIAGNOSING: { label: 'قيد التشخيص', tone: 'amber' },
  IN_REPAIR: { label: 'قيد الإصلاح', tone: 'violet' },
  READY: { label: 'جاهز', tone: 'emerald' },
  DELIVERED: { label: 'تم التسليم', tone: 'slate' },
  CANCELLED: { label: 'ملغى', tone: 'rose' },
};

const TONE_BOX: Record<StatusTone, string> = {
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  slate: 'border-navy-border/40 bg-white/[0.04] text-slate-400',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

export function statusLabel(status: string): string {
  return REPAIR_STATUS_MAP[status]?.label ?? status;
}

export function statusTone(status: string): StatusTone {
  return REPAIR_STATUS_MAP[status]?.tone ?? 'slate';
}

export function statusBox(status: string): string {
  return TONE_BOX[statusTone(status)];
}

/** Stepper stages — terminal CANCELLED shown separately, not as a step. */
export const STEPPER_STAGES = ['RECEIVED', 'DIAGNOSING', 'IN_REPAIR', 'READY', 'DELIVERED'] as const;

export const DEVICE_TYPE_MAP: Record<string, string> = {
  PHONE: 'هاتف',
  TABLET: 'تابلت',
  LAPTOP: 'حاسوب محمول',
  OTHER: 'جهاز آخر',
};

export const REPAIR_TYPE_MAP: Record<string, string> = {
  INTERNAL: 'داخلي (الورشة)',
  EXTERNAL: 'خارجي',
};

export function deviceLabel(t: string): string {
  return DEVICE_TYPE_MAP[t] ?? t;
}

export function repairTypeLabel(t: string): string {
  return REPAIR_TYPE_MAP[t] ?? t;
}

/** CSV-code presets (backend stores CSV strings for condition/accessories). */
export const CONDITION_PRESETS: { value: string; label: string }[] = [
  { value: 'SCRATCHES', label: 'خدوش طفيفة' },
  { value: 'CRACKED_SCREEN', label: 'شاشة مكسورة' },
  { value: 'BROKEN_BACK', label: 'كسر في الهيكل' },
  { value: 'WATER_DAMAGE', label: 'ضرر مائي' },
  { value: 'DENTS', label: 'انبعاج' },
  { value: 'NOT_WORKING', label: 'لا يعمل' },
  { value: 'NONE', label: 'سليم' },
];

export const ACCESSORY_PRESETS: { value: string; label: string }[] = [
  { value: 'CHARGER', label: 'شاحن' },
  { value: 'CABLE', label: 'كابل' },
  { value: 'EARPHONES', label: 'سماعات' },
  { value: 'CASE', label: 'كفر حماية' },
  { value: 'SIM_CARD', label: 'شريحة اتصال' },
  { value: 'MEMORY_CARD', label: 'بطاقة ذاكرة' },
  { value: 'BOX', label: 'علبة الجهاز' },
  { value: 'NONE', label: 'بدون ملحقات' },
];

export function toggleCsv(current: string[], value: string): string[] {
  if (value === 'NONE') return ['NONE'];
  const next = current.filter((v) => v !== 'NONE');
  return next.includes(value) ? next.filter((v) => v !== value) : [...next, value];
}
