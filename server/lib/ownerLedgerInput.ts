import Decimal from 'decimal.js';
import { z } from 'zod';
import { MAX_MONEY } from '../../shared/money';
import { OWNERS } from '../../shared/domainTypes';
import { isoDate } from './recurringInput';

// Округление до копеек идет до проверок: 0.001 не проходит как положительная сумма.
const amount = z.union([z.number().finite(), z.string().trim().regex(/^-?\d{1,13}(?:[.,]\d{1,2})?$/)])
  .transform(value => new Decimal(String(value).replace(',', '.')).toDecimalPlaces(2, Decimal.ROUND_HALF_UP))
  .refine(value => value.abs().lte(MAX_MONEY), 'Сумма превышает допустимый предел');

export const ownerPayoutInput = z.object({
  owner: z.enum(OWNERS),
  amount: amount.refine(value => value.gt(0), 'Сумма должна быть больше 0').transform(value => value.toFixed(2)),
  transferDate: isoDate,
  notes: z.string().trim().max(1000).nullish(),
}).strict();

// Остаток на дату начала бывает отрицательным: Кот получил вперед или Кря забрала больше доли.
export const ownerLedgerStartInput = z.object({
  since: isoDate,
  kot: amount.transform(value => value.toFixed(2)),
  krya: amount.transform(value => value.toFixed(2)),
}).strict();
