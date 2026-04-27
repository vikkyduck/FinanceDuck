/**
 * useAuth — thin wrapper around AuthContext.
 * All auth logic lives in src/contexts/AuthContext.tsx.
 * This re-export keeps the existing import paths across the codebase unchanged.
 */
export type { UserRole, LoginResult } from '@/contexts/AuthContext';
export { useAuthContext as useAuth } from '@/contexts/AuthContext';
