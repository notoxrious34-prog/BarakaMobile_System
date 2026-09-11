import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCapability } from '@/features/auth/AuthContext';

type Props = {
  /** Capability key from capabilitiesFor (e.g. canManageUsers, canViewProfits, canAccessBackups). */
  capability: string;
  /** Where to send callers that lack the capability. Defaults to the POS terminal. */
  fallback?: string;
  children: ReactNode;
};

/**
 * DIRECTIVE-004 / DEF-DS-015: capability-checked route guard (AD-68).
 * Sidebar hiding is not access control — direct-URL navigation to admin or
 * financial shells must redirect callers without the capability instead of
 * rendering protected components and firing their data queries.
 */
export function RequireCapability({ capability, fallback = '/pos', children }: Props) {
  const ok = useCapability(capability);
  if (!ok) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
