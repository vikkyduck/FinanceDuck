import type { AuthResponse } from "@shared/contracts";
import { createContext, useContext } from "react";

import type { UserRole } from "@shared/schema";

interface LoginResult {
  success: boolean;
  error?: string;
  message?: string;
  data?: AuthResponse;
  locked_until?: string;
  attempts_remaining?: number;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
  partnerId: string | null;
  clientId: string | null;
  csrfToken: string | null;
}

interface AuthContextValue extends AuthState {
  login: (code: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  validateSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within <AuthProvider>");
  }
  return ctx;
}

export type { LoginResult, AuthState, AuthContextValue };
export { AuthContext, useAuthContext };
