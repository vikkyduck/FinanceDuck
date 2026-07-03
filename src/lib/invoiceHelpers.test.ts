import { describe, it, expect } from "vitest";
import { isAgencyScheme } from "./invoiceHelpers";

describe("isAgencyScheme", () => {
  it("true для агентских схем", () => {
    expect(isAgencyScheme("agency_30")).toBe(true);
    expect(isAgencyScheme("agency_40")).toBe(true);
  });
  it("false для остальных схем", () => {
    expect(isAgencyScheme("partner_10")).toBe(false);
    expect(isAgencyScheme("partner_15")).toBe(false);
    expect(isAgencyScheme("commission_based")).toBe(false);
  });
  it("false для null/undefined/пустой строки", () => {
    expect(isAgencyScheme(null)).toBe(false);
    expect(isAgencyScheme(undefined)).toBe(false);
    expect(isAgencyScheme("")).toBe(false);
  });
});
