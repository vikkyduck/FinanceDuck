import type { QueryClient } from "@tanstack/react-query";
import { ASSISTANT_BONUS_PER_PACKAGE } from "@shared/financialEngine";

/** Пакет документов ассистента: документы клиента по счету или одного исполнителя. */
export type PackageStatus = "pending" | "accepted" | "returned";

export interface PackageView {
  id: string;
  invoiceId: string;
  side: "client" | "executor";
  executorName: string | null;
  status: PackageStatus;
  reviewComment: string | null;
  reviewedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
  documents: number;
}

export interface PackageListItem extends PackageView {
  invoiceNumber: string;
  clientName: string | null;
}

export const packageStatusLabel: Record<PackageStatus, string> = {
  pending: "На проверке",
  accepted: "Принят",
  returned: "Возвращен",
};

export const packageStatusVariant = { pending: "warning", accepted: "success", returned: "destructive" } as const;

export const packageTitle = (pkg: Pick<PackageView, "side" | "executorName">) =>
  pkg.side === "client" ? "Документы клиента" : pkg.executorName ? `Исполнитель: ${pkg.executorName}` : "Исполнитель не указан";

export const packageBonus = (pkg: Pick<PackageView, "side">) => ASSISTANT_BONUS_PER_PACKAGE[pkg.side];

export const invoicePackagesKey = (invoiceId: string) => ["/api/invoices", invoiceId, "document-packages"] as const;
export const packagesByStatusKey = (status: PackageStatus) => ["/api/document-packages", status] as const;

/** После загрузки, удаления или решения по пакету: документы, пакеты, бонус и долги. */
export function refreshDocumentQueries(queryClient: QueryClient, invoiceId: string) {
  for (const queryKey of [
    ["/api/invoices", invoiceId, "acts"],
    invoicePackagesKey(invoiceId),
    ["/api/document-packages"],
    ["/api/acts-statistics"],
    ["/api/assistant/stats"],
    ["/api/admin/unpaid-bonus"],
    ["/api/admin/payables"],
    ["/api/admin/dashboard-stats"],
  ]) queryClient.invalidateQueries({ queryKey });
}
