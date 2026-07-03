import { describe, it, expect } from "vitest";
import { isAgencyScheme, normalizeCalculations, INVOICE_STATUS_LABELS } from "./invoiceHelpers";

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

describe("normalizeCalculations", () => {
  it("массив → первый элемент", () => {
    expect(normalizeCalculations([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
  });
  it("пустой массив → null", () => {
    expect(normalizeCalculations([])).toBeNull();
  });
  it("объект → тот же объект", () => {
    const o = { clientBill: "100" };
    expect(normalizeCalculations(o)).toBe(o);
  });
  it("null/undefined → null", () => {
    expect(normalizeCalculations(null)).toBeNull();
    expect(normalizeCalculations(undefined)).toBeNull();
  });
});

describe("INVOICE_STATUS_LABELS", () => {
  it("покрывает основные статусы", () => {
    expect(INVOICE_STATUS_LABELS.draft).toBe("Черновик");
    expect(INVOICE_STATUS_LABELS.sent).toBe("Отправлен");
    expect(INVOICE_STATUS_LABELS.paid).toBe("Оплачен");
    expect(INVOICE_STATUS_LABELS.cancelled).toBe("Отменён");
  });
});
