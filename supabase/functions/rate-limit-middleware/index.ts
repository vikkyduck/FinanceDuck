/**
 * Rate Limiting Middleware for Edge Functions
 * 
 * Usage in your edge function:
 * ```typescript
 * import { createRateLimiter } from '../rate-limit-middleware/index.ts';
 * 
 * const rateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60000 });
 * 
 * serve(async (req) => {
 *   const clientId = req.headers.get('x-client-id') || 'anonymous';
 *   const limitResult = rateLimiter.checkLimit(clientId);
 *   
 *   if (!limitResult.allowed) {
 *     return new Response(
 *       JSON.stringify({ error: 'Rate limit exceeded' }),
 *       { 
 *         status: 429,
 *         headers: {
 *           'Content-Type': 'application/json',
 *           'Retry-After': String(Math.ceil(limitResult.resetIn / 1000))
 *         }
 *       }
 *     );
 *   }
 *   
 *   // Your function logic here
 * });
 * ```
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitState {
  count: number;
  resetTime: number;
}

export class EdgeRateLimiter {
  private states: Map<string, RateLimitState> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: number;

  constructor(config: RateLimitConfig) {
    this.config = config;
    
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, state] of this.states.entries()) {
        if (now > state.resetTime + 60000) { // 1 minute grace period
          this.states.delete(key);
        }
      }
    }, 300000);
  }

  checkLimit(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    let state = this.states.get(key);

    if (!state) {
      state = {
        count: 0,
        resetTime: now + this.config.windowMs,
      };
      this.states.set(key, state);
    }

    // Reset window if expired
    if (now > state.resetTime) {
      state.count = 0;
      state.resetTime = now + this.config.windowMs;
    }

    // Check if limit exceeded
    if (state.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetIn: state.resetTime - now,
      };
    }

    state.count++;

    return {
      allowed: true,
      remaining: this.config.maxRequests - state.count,
      resetIn: state.resetTime - now,
    };
  }

  reset(key: string): void {
    this.states.delete(key);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.states.clear();
  }
}

export function createRateLimiter(config: RateLimitConfig): EdgeRateLimiter {
  return new EdgeRateLimiter(config);
}

// CORS headers helper
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-id',
};

// Helper to extract client identifier
export function getClientId(req: Request): string {
  // Try to get from header first
  const clientId = req.headers.get('x-client-id');
  if (clientId) return clientId;

  // Try to get from authorization header
  const auth = req.headers.get('authorization');
  if (auth) {
    try {
      // Extract token and use as identifier
      const token = auth.replace('Bearer ', '');
      return token.substring(0, 32); // Use first 32 chars as ID
    } catch {
      // Ignore parsing errors
    }
  }

  // Fallback to IP if available
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return 'anonymous';
}
