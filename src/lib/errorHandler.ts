import { toast } from "sonner";
import { PostgrestError } from "@supabase/supabase-js";

/**
 * Централизованная обработка ошибок API
 */

interface ErrorContext {
  operation: string;
  details?: Record<string, any>;
}

/**
 * Обработать ошибку Supabase и показать пользователю понятное сообщение
 */
export function handleSupabaseError(
  error: PostgrestError | Error | null,
  context: ErrorContext
): void {
  if (!error) return;

  console.error(`[${context.operation}] Error:`, {
    error,
    context: context.details,
  });

  // Определяем тип ошибки и показываем соответствующее сообщение
  let title = "Ошибка";
  let description = "Произошла ошибка при выполнении операции";

  if ("code" in error) {
    // PostgrestError
    switch (error.code) {
      case "PGRST116":
        title = "Нет данных";
        description = "Запрашиваемые данные не найдены";
        break;
      case "42501":
        title = "Нет доступа";
        description = "У вас нет прав для выполнения этой операции";
        break;
      case "23505":
        title = "Дубликат";
        description = "Такая запись уже существует";
        break;
      case "23503":
        title = "Ошибка связи";
        description = "Связанные данные не найдены";
        break;
      case "23502":
        title = "Неполные данные";
        description = "Не заполнены обязательные поля";
        break;
      default:
        description = error.message || description;
    }
  } else {
    // Generic Error
    description = error.message || description;
  }

  toast.error(title, {
    description,
    duration: 5000,
  });
}

/**
 * Обработать сетевую ошибку
 */
export function handleNetworkError(error: Error, context: ErrorContext): void {
  console.error(`[${context.operation}] Network error:`, {
    error,
    context: context.details,
  });

  toast.error("Ошибка сети", {
    description: "Проверьте подключение к интернету и попробуйте снова",
    duration: 5000,
  });
}

/**
 * Обработать ошибку валидации формы
 */
export function handleValidationError(
  field: string,
  message: string
): void {
  toast.error("Ошибка валидации", {
    description: `${field}: ${message}`,
    duration: 4000,
  });
}

/**
 * Показать сообщение об успехе
 */
export function showSuccess(title: string, description?: string): void {
  toast.success(title, {
    description,
    duration: 3000,
  });
}

/**
 * Обернуть async операцию с автоматической обработкой ошибок
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: ErrorContext
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("fetch") || error.message.includes("network")) {
        handleNetworkError(error, context);
      } else {
        handleSupabaseError(error, context);
      }
    }
    return null;
  }
}

/**
 * Безопасное выполнение Supabase запроса с обработкой ошибок
 */
export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  context: ErrorContext
): Promise<T | null> {
  try {
    const { data, error } = await queryFn();
    
    if (error) {
      handleSupabaseError(error, context);
      return null;
    }
    
    return data;
  } catch (error) {
    if (error instanceof Error) {
      handleNetworkError(error, context);
    }
    return null;
  }
}
