import { ASSISTANT_BONUS_PER_PACKAGE } from "@shared/financialEngine";

/** Бонус ассистента по правилу пакетов (сервер: getAssistantBonusSummary). */
export interface AssistantBonusSummary {
  since: string;
  accepted: { client: number; executor: number };
  earned: number;
  paid: number;
  unpaid: number;
  pending: number;
  returned: number;
}

export const bonusRows = (summary: AssistantBonusSummary) => [
  { key: "client", label: "Документы клиентов", count: summary.accepted.client, rate: ASSISTANT_BONUS_PER_PACKAGE.client },
  { key: "executor", label: "Пакеты исполнителей", count: summary.accepted.executor, rate: ASSISTANT_BONUS_PER_PACKAGE.executor },
] as const;
