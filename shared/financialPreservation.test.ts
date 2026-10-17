import { expect, it } from 'vitest';
import { calculateBookedFinancials } from './financialEngine';

// Independent oracle in integer kopecks: does not call Decimal or the policy
// registry. A formula/rounding regression must fail even when both UI and SQL
// adapters call the same changed engine.
const round = (n: bigint, d: bigint): bigint => n < 0n ? -round(-n, d) : (n + d / 2n) / d;
const amount = (n: bigint): string => `${n < 0n ? '-' : ''}${(n < 0n ? -n : n) / 100n}.${String((n < 0n ? -n : n) % 100n).padStart(2, '0')}`;
const max = (a: bigint, b: bigint) => a > b ? a : b;
const schemes = ['agency_30', 'agency_40', 'agency', 'partner_10', 'partner_15', 'commission_based'] as const;

it.each(schemes)('%s preserves each booked amount against an independent integer oracle', scheme => {
  let seed = 102026;
  const random = (limit: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return BigInt(seed % limit); };
  for (let i = 0; i < 1000; i++) {
    const bill = i === 0 ? 999999999999999n : i < 5 ? BigInt(i) : random(100000000);
    const partnerCost = random(10000000), adminCost = random(10000000), spent = partnerCost + adminCost;
    const planned = i % 3 ? random(10000000) : 0n, rate = random(10001), marginRate = random(10001);
    const computed = calculateBookedFinancials({ scheme, clientBill: amount(bill), partnerCommRate: amount(rate), agencyMarginRate: amount(marginRate),
      executorExpenses: amount(spent), expensesByPartner: amount(partnerCost), expensesByAdmin: amount(adminCost), plannedExpenses: amount(planned) });
    let profit: bigint;
    if (scheme.startsWith('agency')) {
      const margin = scheme === 'agency_30' ? 3000n : scheme === 'agency_40' ? 4000n : marginRate;
      const partner = scheme === 'agency_30' ? 1500n : scheme === 'agency_40' ? 1600n : rate < margin ? rate : margin;
      const agencyAmount = round(bill * margin, 10000n), partnerAmount = round(bill * partner, 10000n);
      profit = agencyAmount - partnerAmount;
      expect(computed).toMatchObject({ agencyMargin: amount(agencyAmount), partnerShareFromMargin: amount(partnerAmount), adminShareFromMargin: amount(profit),
        clientBaseAfterMargin: amount(bill - agencyAmount), clientRemaining: amount(bill - agencyAmount - spent), partnerTransferDue: amount(profit) });
    } else {
      const commission = round(bill * (scheme === 'partner_10' ? 1000n : scheme === 'partner_15' ? 1500n : rate), 10000n);
      const due = max(0n, bill - commission - (planned > 0n ? planned : partnerCost));
      profit = due - adminCost;
      const remaining = planned > 0n ? max(0n, round(bill * (planned - spent), planned)) : 0n;
      expect(computed).toMatchObject({ commissionAmount: amount(commission), amountToAdmin: amount(bill - commission), partnerTransferDue: amount(due), clientRemaining: amount(remaining) });
    }
    const half = round(profit, 2n);
    expect(computed).toMatchObject({ clientBill: amount(bill), clientSpent: amount(spent), executorExpensesTotal: amount(spent),
      netProfitAdmin: amount(profit), adminShare50: amount(half), catShare50: amount(profit - half) });
  }
});
