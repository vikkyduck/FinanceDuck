/** Сегодня по Москве, YYYY-MM-DD: владельцы закрывают счета по московскому времени. */
export function moscowToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
