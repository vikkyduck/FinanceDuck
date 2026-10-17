/**
 * useAuth — thin wrapper around AuthContext.
 * All auth logic lives in src/contexts/AuthContext.tsx.
 * This re-export keeps the existing import paths across the codebase unchanged.
 */
export type { UserRole } from '@shared/domainTypes';
export type { LoginResult } from '@/contexts/auth-context';
export { useAuthContext as useAuth } from '@/contexts/auth-context';
