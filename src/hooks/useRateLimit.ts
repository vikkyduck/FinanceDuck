import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { apiRateLimiter, formSubmitLimiter, searchRateLimiter } from '@/lib/rateLimiter';

type RateLimitType = 'api' | 'form' | 'search';

/**
 * Hook for rate limiting API calls and user actions
 */
export function useRateLimit(type: RateLimitType = 'api', key?: string) {
  const userKey = useRef(key || `user-${Date.now()}`);

  const checkLimit = useCallback(() => {
    let limiter;
    let actionName;

    switch (type) {
      case 'form':
        limiter = formSubmitLimiter;
        actionName = 'отправку формы';
        break;
      case 'search':
        limiter = searchRateLimiter;
        actionName = 'поиск';
        break;
      case 'api':
      default:
        limiter = apiRateLimiter;
        actionName = 'запрос';
        break;
    }

    const result = limiter.checkLimit(userKey.current);

    if (!result.allowed) {
      const resetInSeconds = Math.ceil(result.resetIn / 1000);
      toast.error(
        `Слишком много запросов. Попробуйте снова через ${resetInSeconds} сек.`,
        {
          description: `Превышен лимит на ${actionName}`,
        }
      );
    }

    return result;
  }, [type]);

  return { checkLimit };
}
