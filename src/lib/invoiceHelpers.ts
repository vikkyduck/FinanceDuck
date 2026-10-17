import { schemePolicy } from "@shared/schemePolicies";

/**
 * Небольшие чистые помощники по счетам. Вынесены из god-компонентов
 * (InvoiceDetailsDialog, UnifiedInvoicesList и др.), где дублировались.
 */

/**
 * Агентская схема (30% или 40%): маржа делится админ/партнёр, и клиенту
 * показывается раскладка «комиссия/доступно/потрачено/осталось».
 * Проверка `scheme === 'agency_30' || scheme === 'agency_40'` встречалась
 * в 6 файлах — теперь одна точка правды.
 */
export function isAgencyScheme(scheme: string | null | undefined): boolean {
  return schemePolicy(scheme)?.kind === "agency";
}

/**
 * Единые подписи статусов счёта (единственное число, для отображения).
 * Раньше этот словарь дословно повторялся в 5 файлах. ВНИМАНИЕ: у фильтров
 * (InvoiceFilters) — ДРУГОЙ словарь (множественное число + overdue), он живёт
 * отдельно и сюда не сводится.
 */
export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлен",
  paid: "Оплачен",
  cancelled: "Отменён",
};

/**
 * invoice_calculations из API приходит то массивом (join), то объектом, то
 * null. Приводим к «объект или null». Заменяет повторяющийся костыль
 * `Array.isArray(calc) ? calc[0] : calc` (5× в InvoiceDetailsDialog).
 */
export function normalizeCalculations<T>(raw: T | T[] | null | undefined): T | null {
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return (raw as T) ?? null;
}
