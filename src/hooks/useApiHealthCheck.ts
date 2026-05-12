import { useState, useEffect } from 'react';

interface ApiHealthStatus {
  isHealthy: boolean;
  isChecking: boolean;
  error: string | null;
}

export function useApiHealthCheck() {
  const [status, setStatus] = useState<ApiHealthStatus>({
    isHealthy: true,
    isChecking: true,
    error: null,
  });

  useEffect(() => {
    const checkApiHealth = async () => {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Сервер недоступен (${response.status})`);
        }

        setStatus({ isHealthy: true, isChecking: false, error: null });
      } catch (error) {
        console.error('[API Health Check] Failed:', error);
        setStatus({
          isHealthy: false,
          isChecking: false,
          error: error instanceof Error ? error.message : 'Не удалось подключиться к серверу',
        });
      }
    };

    checkApiHealth();
  }, []);

  return status;
}
