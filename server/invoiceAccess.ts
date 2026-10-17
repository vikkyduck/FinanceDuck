import type { UserRole } from "../shared/schema";
import type { InvoiceRepository } from "./storagePorts";

export interface InvoiceActor {
  role: UserRole;
  partnerId?: string;
  clientId?: string;
}

type InvoiceAccessStorage = Pick<InvoiceRepository, "getInvoiceForRole">;

/**
 * Единственный route-level шлюз к существующему счёту.
 * Внутри repository одновременно применяются tenant ownership и разделение
 * assistant/accountant по hideFromAssistant.
 */
export async function findAuthorizedInvoice(
  storage: InvoiceAccessStorage,
  actor: InvoiceActor,
  invoiceId: string,
) {
  return storage.getInvoiceForRole(
    invoiceId,
    actor.role,
    actor.partnerId,
    actor.clientId,
  );
}

/**
 * hideFromAssistant — security label, а не обычное редактируемое поле.
 * При создании partition определяется ролью; после создания менять label
 * может только admin.
 */
export function constrainInvoiceWrite<T extends Record<string, unknown>>(
  role: UserRole,
  fields: T,
  operation: "create" | "update",
): T {
  const constrained: T & { hideFromAssistant?: boolean } = { ...fields };

  if (operation === "create") {
    if (role === "assistant") constrained.hideFromAssistant = false;
    if (role === "accountant") constrained.hideFromAssistant = true;
  } else if (role !== "admin") {
    delete constrained.hideFromAssistant;
  }

  return constrained;
}

export type MessageInvoiceScope =
  | { kind: "all" }
  | { kind: "assistant" }
  | { kind: "client"; clientId: string };

/** Scope для агрегатных message-запросов, где нельзя вызвать getInvoiceForRole. */
export function resolveMessageInvoiceScope(
  actor: InvoiceActor,
): MessageInvoiceScope | null {
  if (actor.role === "admin") return { kind: "all" };
  if (actor.role === "assistant") return { kind: "assistant" };
  if (actor.role === "client" && actor.clientId) {
    return { kind: "client", clientId: actor.clientId };
  }
  return null;
}
