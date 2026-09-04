/**
 * TB-069 zero-dependency POS audio engine — native Web Audio API only.
 * Preference persists in localStorage under `pos_audio_enabled` (default true).
 * The AudioContext is created lazily and resumed on each call so autoplay
 * policies are satisfied after the first user interaction (scan/click/key).
 */

const STORAGE_KEY = 'pos_audio_enabled';

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function isAudioEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setAudioEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* storage unavailable — play muted by default path */
  }
}

export function toggleAudio(): boolean {
  const next = !isAudioEnabled();
  setAudioEnabled(next);
  return next;
}

function tone(
  ac: AudioContext,
  opts: {
    from: number;
    to?: number;
    at?: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
  },
): void {
  const t0 = ac.currentTime + (opts.at ?? 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.from, t0);
  if (opts.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
  }
  // Soft exponential envelope — kills pops/clicks.
  const peak = opts.gain ?? 0.15;
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + opts.dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

/** Gentle high-pitch dual-tone sweep: 880Hz → 1320Hz over 0.08s. */
export function playScanSuccess(): void {
  if (!isAudioEnabled()) return;
  const ac = audioContext();
  if (!ac) return;
  try {
    tone(ac, { from: 880, to: 1320, dur: 0.08, type: 'sine', gain: 0.15 });
  } catch {
    /* audio must never break the scan flow */
  }
}

/** Low-pitch double buzz: 180Hz, 2 × 0.09s bursts, 0.04s silence gap. */
export function playScanError(): void {
  if (!isAudioEnabled()) return;
  const ac = audioContext();
  if (!ac) return;
  try {
    tone(ac, { from: 180, dur: 0.09, type: 'triangle', gain: 0.15 });
    tone(ac, { from: 180, dur: 0.09, at: 0.13, type: 'triangle', gain: 0.15 });
  } catch {
    /* audio must never break the scan flow */
  }
}

/** Melodic ascending triad: C5 → E5 → G5 over ~0.25s. */
export function playCheckoutSuccess(): void {
  if (!isAudioEnabled()) return;
  const ac = audioContext();
  if (!ac) return;
  try {
    tone(ac, { from: 523.25, dur: 0.12, type: 'sine', gain: 0.15 });
    tone(ac, { from: 659.25, dur: 0.12, at: 0.08, type: 'sine', gain: 0.15 });
    tone(ac, { from: 783.99, dur: 0.18, at: 0.16, type: 'sine', gain: 0.15 });
  } catch {
    /* audio must never break checkout */
  }
}
