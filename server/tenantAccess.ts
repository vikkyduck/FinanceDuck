import type { UserRole } from "../shared/schema";

/**
 * Минимальный security context для tenant-aware чтения.
 * Идентификаторы берутся только из проверенной серверной сессии — никогда из
 * query/body клиента.
 */
export interface TenantActor {
  role: UserRole;
  partnerId?: string;
  clientId?: string;
}

/**
 * Scope обязателен даже для внутренних вызовов репозитория. Благодаря этому
 * `undefined` больше нельзя случайно интерпретировать как "вернуть всех".
 */
export type ClientCollectionScope =
  | { kind: "all" }
  | { kind: "partner"; partnerId: string }
  | { kind: "client"; clientId: string };

const CLIENT_CATALOG_ROLES: ReadonlySet<UserRole> = new Set([
  "admin",
  "assistant",
  "accountant",
]);

export function resolveClientCollectionScope(
  actor: TenantActor,
): ClientCollectionScope | null {
  if (CLIENT_CATALOG_ROLES.has(actor.role)) return { kind: "all" };
  if (actor.role === "partner" && actor.partnerId) {
    return { kind: "partner", partnerId: actor.partnerId };
  }
  if (actor.role === "client" && actor.clientId) {
    return { kind: "client", clientId: actor.clientId };
  }
  return null;
}

export function canReadClient(
  actor: TenantActor,
  clientId: string,
  linkedPartnerIds: readonly string[] = [],
): boolean {
  if (CLIENT_CATALOG_ROLES.has(actor.role)) return true;
  if (actor.role === "client") return actor.clientId === clientId;
  if (actor.role === "partner") {
    return !!actor.partnerId && linkedPartnerIds.includes(actor.partnerId);
  }
  return false;
}

/**
 * Assistant/accountant по текущей бизнес-политике не видят структуру связей.
 * Partner видит только связи уже доступного ему клиента, client — только свои.
 */
export function canReadClientRelationships(
  actor: TenantActor,
  clientId: string,
  linkedPartnerIds: readonly string[] = [],
): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "client") return actor.clientId === clientId;
  if (actor.role === "partner") {
    return !!actor.partnerId && linkedPartnerIds.includes(actor.partnerId);
  }
  return false;
}

export function canListClientRelationships(actor: TenantActor): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "partner") return !!actor.partnerId;
  if (actor.role === "client") return !!actor.clientId;
  return false;
}

export function canReadPartner(
  actor: TenantActor,
  partnerId: string,
  ownClientPartnerIds: readonly string[] = [],
): boolean {
  if (CLIENT_CATALOG_ROLES.has(actor.role)) return true;
  if (actor.role === "partner") return actor.partnerId === partnerId;
  if (actor.role === "client") {
    return !!actor.clientId && ownClientPartnerIds.includes(partnerId);
  }
  return false;
}

export function canReadPartnerClients(
  actor: TenantActor,
  partnerId: string,
  ownClientPartnerIds: readonly string[] = [],
): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "partner") return actor.partnerId === partnerId;
  if (actor.role === "client") {
    return !!actor.clientId && ownClientPartnerIds.includes(partnerId);
  }
  return false;
}

/**
 * Партнёр не должен узнавать о других партнёрах того же клиента.
 * Клиенту разрешены только имена собственных связанных партнёров (DTO ниже
 * дополнительно отсекает их внутренние условия и контакты).
 */
export function filterRelationshipPartnerIds(
  actor: TenantActor,
  partnerIds: readonly string[],
): string[] {
  if (actor.role === "admin" || actor.role === "client") return [...partnerIds];
  if (actor.role === "partner" && actor.partnerId) {
    return partnerIds.filter(id => id === actor.partnerId);
  }
  return [];
}
