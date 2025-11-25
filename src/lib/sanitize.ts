/**
 * Утилиты для защиты от XSS-атак
 * Санитизация пользовательского ввода
 */

/**
 * Экранирует HTML-символы для предотвращения XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Удаляет все HTML-теги из строки
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Безопасная санитизация текста для отображения
 * Удаляет HTML и экранирует спецсимволы
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text) return '';
  
  // Удаляем HTML теги
  let clean = stripHtml(text);
  
  // Экранируем оставшиеся спецсимволы
  clean = escapeHtml(clean);
  
  return clean;
}

/**
 * Безопасная санитизация для имен файлов
 * Удаляет потенциально опасные символы
 */
export function sanitizeFileName(fileName: string): string {
  // Оставляем только безопасные символы: буквы, цифры, точки, дефисы, подчеркивания
  return fileName
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.') // Убираем множественные точки
    .substring(0, 255); // Ограничиваем длину
}

/**
 * Валидация и санитизация email
 */
export function sanitizeEmail(email: string): string {
  if (!email) return '';
  
  // Базовая валидация email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return '';
  }
  
  // Приводим к нижнему регистру и удаляем пробелы
  return email.toLowerCase().trim();
}

/**
 * Валидация и санитизация телефона
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return '';
  
  // Оставляем только цифры, +, -, (, ), пробелы
  return phone.replace(/[^0-9+\-() ]/g, '').trim();
}

/**
 * Валидация и санитизация Telegram username
 */
export function sanitizeTelegram(telegram: string): string {
  if (!telegram) return '';
  
  // Удаляем лишние пробелы и приводим к нижнему регистру
  let clean = telegram.trim().toLowerCase();
  
  // Удаляем @ в начале, если есть
  if (clean.startsWith('@')) {
    clean = clean.substring(1);
  }
  
  // Оставляем только допустимые символы (буквы, цифры, подчеркивание)
  clean = clean.replace(/[^a-z0-9_]/g, '');
  
  // Ограничиваем длину (5-32 символа для Telegram)
  if (clean.length < 5 || clean.length > 32) {
    return '';
  }
  
  return '@' + clean;
}

/**
 * Валидация числовых значений
 */
export function sanitizeNumber(value: string | number): number | null {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }
  
  return num;
}

/**
 * Безопасная санитизация для URL параметров
 */
export function sanitizeUrlParam(param: string): string {
  if (!param) return '';
  
  // Удаляем потенциально опасные символы
  return encodeURIComponent(param)
    .replace(/[<>'"]/g, '')
    .substring(0, 500); // Ограничиваем длину
}

/**
 * Валидация UUID
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Безопасное получение текстового контента для отображения
 * React автоматически экранирует текст в JSX, но эта функция 
 * дополнительно очищает от HTML если данные приходят из API
 */
export function safeDisplayText(text: string | null | undefined): string {
  if (!text) return '';
  
  // Убираем HTML теги и ограничиваем длину
  const cleaned = stripHtml(text.toString());
  
  // Ограничиваем длину для предотвращения DOS
  return cleaned.substring(0, 10000);
}

/**
 * Валидация даты
 */
export function sanitizeDate(date: string): string | null {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return null;
  }
  
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  
  return date;
}
