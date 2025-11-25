/**
 * Rate Limiter utility for preventing spam and abuse
 * Implements token bucket algorithm for request throttling
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
}

interface RateLimitState {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockedUntil?: number;
}

class RateLimiter {
  private states: Map<string, RateLimitState> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      blockDurationMs: 60000, // 1 minute default
      ...config,
    };
  }

  /**
   * Check if a request is allowed
   * @param key - Unique identifier for the rate limit (e.g., user ID, IP, action name)
   * @returns Object with allowed status and remaining requests
   */
  checkLimit(key: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    let state = this.states.get(key);

    // Initialize state if doesn't exist
    if (!state) {
      state = {
        count: 0,
        resetTime: now + this.config.windowMs,
        blocked: false,
      };
      this.states.set(key, state);
    }

    // Check if blocked
    if (state.blocked && state.blockedUntil) {
      if (now < state.blockedUntil) {
        return {
          allowed: false,
          remaining: 0,
          resetIn: state.blockedUntil - now,
        };
      } else {
        // Unblock
        state.blocked = false;
        state.blockedUntil = undefined;
        state.count = 0;
        state.resetTime = now + this.config.windowMs;
      }
    }

    // Reset window if expired
    if (now > state.resetTime) {
      state.count = 0;
      state.resetTime = now + this.config.windowMs;
    }

    // Check if limit exceeded
    if (state.count >= this.config.maxRequests) {
      // Block the key
      state.blocked = true;
      state.blockedUntil = now + (this.config.blockDurationMs || 60000);
      
      return {
        allowed: false,
        remaining: 0,
        resetIn: state.resetTime - now,
      };
    }

    // Increment counter
    state.count++;

    return {
      allowed: true,
      remaining: this.config.maxRequests - state.count,
      resetIn: state.resetTime - now,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(key: string): void {
    this.states.delete(key);
  }

  /**
   * Clear all rate limit states
   */
  clearAll(): void {
    this.states.clear();
  }
}

// Pre-configured rate limiters for common use cases
export const apiRateLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60000, // 60 requests per minute
  blockDurationMs: 300000, // Block for 5 minutes if exceeded
});

export const formSubmitLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 60000, // 5 submissions per minute
  blockDurationMs: 180000, // Block for 3 minutes
});

export const searchRateLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60000, // 30 searches per minute
});

/**
 * Debounce function to limit execution frequency
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, waitMs);
  };
}

/**
 * Throttle function to ensure execution at most once per interval
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastRun >= limitMs) {
      func.apply(this, args);
      lastRun = now;
    } else {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastRun = Date.now();
      }, limitMs - (now - lastRun));
    }
  };
}

export default RateLimiter;
