/** Extract the opaque operator session token from request headers. */
export function sessionTokenOf(headers: Record<string, string | string[] | undefined>): string | undefined {
  const raw = headers['x-session-token'] ?? headers['X-Session-Token'];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}
