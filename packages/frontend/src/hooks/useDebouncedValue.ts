import { useEffect, useState } from 'react';

/**
 * Zero-dependency debounce (Rule ⑨ — no lodash.debounce).
 * Returns `value` delayed by `delayMs` after the last change: rapid
 * keystrokes collapse into a single committed update, so server queries
 * keyed on the return value fire once per pause instead of per keystroke.
 * Timer is cleaned up on every change/unmount (no leaks).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
