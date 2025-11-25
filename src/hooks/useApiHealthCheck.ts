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
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error('Отсутствует конфигурация API');
        }

        // Проверяем доступность edge function auth-validate
        const response = await fetch(`${supabaseUrl}/functions/v1/auth-validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({}),
        });

        if (!response.ok && response.status !== 401) {
          throw new Error(`Сервер недоступен (${response.status})`);
        }

        setStatus({
          isHealthy: true,
          isChecking: false,
          error: null,
        });
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
