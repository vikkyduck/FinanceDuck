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
  return scheme === "agency_30" || scheme === "agency_40";
}
