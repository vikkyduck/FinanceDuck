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

// Поля клиента. Исключены: id, createdAt, updatedAt. partnerId НЕ здесь —
// связь клиент↔партнёр пишется ТОЛЬКО через setClientPartners (единый источник),
// иначе partner_id и client_partners дрейфуют.
export const CLIENT_WRITABLE_FIELDS = [
  "name", "email", "phone", "telegram", "contactPerson",
  "tgChatId", "tgBotToken",
] as const;

// Поля расхода. invoiceId и createdBy навязываются роутом отдельно;
// исключены id, createdAt.
export const EXPENSE_WRITABLE_FIELDS = [
  "description", "amount", "paidByAdmin", "date",
] as const;

// Описание расхода — простой текст. Старый клиент экранировал его в HTML
// ПЕРЕД сохранением (sanitizeText → escapeHtml), а React экранирует еще раз
// при показе: в таблице «&#x2F;» и «&quot;» вместо «/» и «"», ссылка из
// чека становилась сплошной строкой без переносов и распирала окно счета.
// Храним то, что человек набрал; экранирует тот, кто выводит (React, escapeHtml
// для Telegram). Повтор до стабильности снимает и двойное экранирование
// (правка уже экранированного описания давала «&amp;#x2F;»).
const ENTITY_RE = /&(amp|lt|gt|quot|#x27|#39|#x2F|#47);/gi;
const ENTITY_MAP: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'", "#x2f": "/", "#47": "/",
};
export function decodeHtmlEntities(text: string): string {
  let cur = text;
  for (let i = 0; i < 5; i++) {
    const next = cur.replace(ENTITY_RE, (_m, name: string) => ENTITY_MAP[name.toLowerCase()]);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

export function pickExpense(body: unknown): any {
  const out = pick(body, EXPENSE_WRITABLE_FIELDS);
  if (typeof out.description === "string") out.description = decodeHtmlEntities(out.description).trim();
  return out;
}

// Поля партнёра. leverageRole дополнительно ограничен: значение из
// LEVERAGE_ROLES и менять может только админ (см. routes/partners.ts).
export const PARTNER_WRITABLE_FIELDS = [
  "name", "email", "phone", "telegram", "commissionRate", "leverageRole",
] as const;

// Роли партнёра для коэффициента эффективности (см. shared/schema.ts).
export const LEVERAGE_ROLES = ["external", "managed_asset", "owner"] as const;

// Поля платежа партнёра. createdBy навязывается роутом; исключены id, createdAt.
export const PARTNER_PAYMENT_WRITABLE_FIELDS = [
  "partnerId", "invoiceId", "amount", "paymentDate", "notes",
] as const;
