/**
 * Периодические счета: поля потребления должны доходить до КАЖДОЙ роли.
 *
 * Почему это отдельный тест. По периодическому счёту «Остаток» считается не по
 * деньгам, а по непрожитым периодам (invoiceRepo.applyPeriodicOverrides), и
 * двигает его только periods_used. Пока эти поля отдавались одному клиенту,
 * админ не видел, что счёт вообще периодический, кнопка «Закрыть месяц» не
 * рисовалась — и остаток счёта 0899 семь месяцев стоял на полной сумме, хотя
 * расходы по нему шли.
 */
import { describe, it, expect } from "vitest";
import { projectInvoiceForRole } from "./permissions";
import type { UserRole } from "../shared/schema";

const periodicInvoice = {
  id: "inv-1",
  invoiceNumber: "0899",
  scheme: "commission_based",
  status: "paid",
  serviceType: "periodic",
  periodUnit: "month",
  pricePerPeriod: "270000.00",
  totalPeriods: 9,
  periodsUsed: 7,
  calculations: {
    clientBill: "2430000.00",
    clientSpent: "1890000.00",
    clientRemaining: "540000.00",
    executorExpensesTotal: "910000.00",
  },
};

const ALL_ROLES: UserRole[] = ["admin", "partner", "client", "assistant", "accountant"];

describe("проекция периодического счёта по ролям", () => {
  it.each(ALL_ROLES)("роль %s видит, что счёт периодический и сколько закрыто", (role) => {
    const projected = projectInvoiceForRole(periodicInvoice, role);

    expect(projected.serviceType).toBe("periodic");
    expect(projected.periodUnit).toBe("month");
    expect(projected.pricePerPeriod).toBe("270000.00");
    expect(projected.totalPeriods).toBe(9);
    expect(projected.periodsUsed).toBe(7);
    // Остаток и поля периодики должны приходить вместе: одно без другого —
    // это число без единиц измерения.
    expect(projected.calculations?.clientRemaining).toBe("540000.00");
  });

  it("клиенту по неагентской схеме по-прежнему не видны наши расходы", () => {
    const projected = projectInvoiceForRole(periodicInvoice, "client");

    expect(projected.calculations).not.toHaveProperty("executorExpensesTotal");
    expect(projected.calculations?.clientSpent).toBe("1890000.00");
  });
});
