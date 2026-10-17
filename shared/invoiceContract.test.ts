import { expect, it } from 'vitest';
import { expenseDtoSchema } from './invoiceContract';

it('accepts client-redacted expenses without inventing or exposing an amount', () => {
  const redacted = { id: '00000000-0000-4000-8000-000000000001', invoiceId: '00000000-0000-4000-8000-000000000002', description: 'Completed work', date: '2026-10-17' };
  expect(expenseDtoSchema.parse(redacted)).toEqual(redacted);
  expect(expenseDtoSchema.parse({ ...redacted, amount: '123.45' }).amount).toBe('123.45');
  expect(expenseDtoSchema.safeParse({ ...redacted, amount: 'invalid' }).success).toBe(false);
});
