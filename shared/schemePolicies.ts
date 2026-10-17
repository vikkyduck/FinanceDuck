import type { InvoiceScheme } from "./domainTypes";

type SchemePolicy =
  | { kind: "agency"; marginRate: number | null; partnerRate: number | null }
  | { kind: "commission"; commissionRate: number | null };
/** Exhaustive registry: a new scheme must explicitly choose a financial policy. */
export const SCHEME_POLICIES = {
  agency_30: { kind: "agency", marginRate: 30, partnerRate: 15 },
  agency_40: { kind: "agency", marginRate: 40, partnerRate: 16 },
  agency: { kind: "agency", marginRate: null, partnerRate: null },
  partner_10: { kind: "commission", commissionRate: 10 },
  partner_15: { kind: "commission", commissionRate: 15 },
  commission_based: { kind: "commission", commissionRate: null },
} as const satisfies Record<InvoiceScheme, SchemePolicy>;
export function schemePolicy(scheme: unknown): SchemePolicy | undefined {
  return typeof scheme === "string" &&
    Object.prototype.hasOwnProperty.call(SCHEME_POLICIES, scheme)
    ? SCHEME_POLICIES[scheme as InvoiceScheme]
    : undefined;
}
