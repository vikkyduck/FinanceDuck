/**
 * Whitelist-based request-body sanitizing (anti mass-assignment).
 *
 * Роуты раньше делали `storage.createX({ ...req.body })` — клиент мог
 * проставить любое поле, включая серверные (id, createdBy, createdAt,
 * updatedAt) и подменить служебные. `pick` берёт ТОЛЬКО разрешённые поля
 * и молча выкидывает остальные. Это не отклоняет валидные запросы
 * (в отличие от строгой схемы), а именно вырезает лишнее.
 */

// Возвращаем any: результат — динамический срез, который скармливается в
// storage.createX/updateX с их точными Insert-типами; жёсткая типизация
// здесь только мешала бы без пользы (роуты и так на нестрогих типах).
export function pick(body: unknown, allowed: readonly string[]): any {
  const src = (body && typeof body === "object") ? (body as Record<string, any>) : {};
  const out: Record<string, any> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = src[key];
  }
  return out;
}

// Поля счёта, которые клиент вправе задавать. Исключены серверные:
// id, createdBy, createdAt, updatedAt, recurringInvoiceId (ставит система).
export const INVOICE_WRITABLE_FIELDS = [
  "invoiceNumber", "clientId", "partnerId", "scheme", "status", "clientBill",
  "commissionAmount", "partnerCommissionRate", "description", "clientTitle",
  "issueDate", "paymentDate", "actualPaymentDate", "notes", "hideFromAssistant",
  "plannedExpenses", "closingDocumentUrl", "serviceType", "periodUnit",
  "pricePerPeriod", "totalPeriods", "periodsUsed",
] as const;

// Поля клиента. Исключены: id, createdAt, updatedAt.
export const CLIENT_WRITABLE_FIELDS = [
  "name", "email", "phone", "telegram", "contactPerson", "partnerId",
  "tgChatId", "tgBotToken",
] as const;

// Поля расхода. invoiceId и createdBy навязываются роутом отдельно;
// исключены id, createdAt.
export const EXPENSE_WRITABLE_FIELDS = [
  "description", "amount", "paidByAdmin", "date",
] as const;
