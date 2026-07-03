import { describe, it, expect } from "vitest";
import { calculateFinancials, parseNum } from "./financialEngine";

// Характеризующие тесты: фиксируют ТЕКУЩЕЕ поведение денежного движка,
// чтобы будущий рефакторинг (или патч 2.4) не изменил расчёты незаметно.
// Деньги во float → сверяем с точностью до копеек (toBeCloseTo(..., 2)).
const money = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 2);

describe("calculateFinancials — agency_30 (30% маржа: 15% админ + 15% партнёр)", () => {
  const r = calculateFinancials("agency_30", 1000, 0, 200);
  it("маржа и доли", () => {
    money(r.agencyMargin!, 300);
    money(r.partnerShareFromMargin!, 150);
    money(r.adminShareFromMargin!, 150);
    money(r.clientBaseAfterMargin!, 700);
  });
  it("клиентские поля: расходы из 70% бюджета", () => {
    money(r.clientSpent!, 200);
    money(r.clientRemaining!, 500); // 700 - 200
  });
  it("прибыль админа фиксирована (15%), делится пополам", () => {
    money(r.partnerTransferDue, 150);
    money(r.netProfitAdmin, 150);
    money(r.adminShare50, 75);
    money(r.catShare50, 75);
  });
});

describe("calculateFinancials — agency_40 (40% маржа: 24% админ + 16% партнёр)", () => {
  const r = calculateFinancials("agency_40", 1000, 0, 100);
  it("маржа и доли", () => {
    money(r.agencyMargin!, 400);
    money(r.partnerShareFromMargin!, 160);
    money(r.adminShareFromMargin!, 240);
    money(r.clientBaseAfterMargin!, 600);
  });
  it("остаток и прибыль", () => {
    money(r.clientRemaining!, 500); // 600 - 100
    money(r.netProfitAdmin, 240);
    money(r.adminShare50, 120);
    money(r.catShare50, 120);
  });
});

describe("calculateFinancials — partner_10", () => {
  it("без planned: остаток = 0, перевод = amountToAdmin - расходы партнёра", () => {
    const r = calculateFinancials("partner_10", 1000, 0, 0, 50);
    money(r.commissionAmount!, 100);
    money(r.amountToAdmin!, 900);
    money(r.partnerTransferDue, 850); // 900 - 50
    money(r.netProfitAdmin, 850);
    money(r.clientRemaining!, 0);
    money(r.adminShare50, 425);
  });
  it("с planned: остаток пропорционален прогрессу, вычитается расход админа", () => {
    // clientBill=1000, planned=400, executorExpenses=100, byPartner=30, byAdmin=20
    const r = calculateFinancials("partner_10", 1000, 0, 100, 30, 20, 400);
    money(r.partnerTransferDue, 500); // 900 - 400(planned)
    money(r.netProfitAdmin, 480);     // 500 - 20(byAdmin)
    money(r.clientRemaining!, 750);   // 1000 * (1 - 100/400)
  });
});

describe("calculateFinancials — partner_15", () => {
  it("с planned", () => {
    const r = calculateFinancials("partner_15", 1000, 0, 150, 0, 0, 300);
    money(r.commissionAmount!, 150);
    money(r.amountToAdmin!, 850);
    money(r.partnerTransferDue, 550); // 850 - 300
    money(r.netProfitAdmin, 550);
    money(r.clientRemaining!, 500);   // 1000 * (1 - 150/300)
  });
});

describe("calculateFinancials — commission_based", () => {
  it("кастомная ставка 20%", () => {
    const r = calculateFinancials("commission_based", 1000, 20);
    money(r.commissionAmount!, 200);
    money(r.amountToAdmin!, 800);
    money(r.netProfitAdmin, 800);
    money(r.adminShare50, 400);
  });
  it("ставка 0% по умолчанию — весь счёт админу", () => {
    const r = calculateFinancials("commission_based", 500, 0);
    money(r.commissionAmount!, 0);
    money(r.amountToAdmin!, 500);
    money(r.netProfitAdmin, 500);
  });
});

describe("инварианты / крайние случаи", () => {
  it("clientRemaining никогда не отрицателен (расходы > planned)", () => {
    const r = calculateFinancials("partner_10", 1000, 0, 200, 0, 0, 100);
    expect(r.clientRemaining!).toBeGreaterThanOrEqual(0);
    money(r.clientRemaining!, 0);
  });
  it("partnerTransferDue не уходит в минус", () => {
    const r = calculateFinancials("commission_based", 100, 0, 0, 500);
    expect(r.partnerTransferDue).toBeGreaterThanOrEqual(0);
  });
});

describe("parseNum", () => {
  it("парсит числовые строки", () => {
    money(parseNum("123.45"), 123.45);
    money(parseNum("1000"), 1000);
  });
  it("пустое/null/undefined/мусор → 0", () => {
    expect(parseNum("")).toBe(0);
    expect(parseNum(null)).toBe(0);
    expect(parseNum(undefined)).toBe(0);
    expect(parseNum("abc")).toBe(0);
  });
});
