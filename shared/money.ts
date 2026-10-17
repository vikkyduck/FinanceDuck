import Decimal from 'decimal.js';

/** numeric(15,2), shared by command validation and every persisted calculation. */
export const MAX_MONEY = '9999999999999.99';
export class MoneyRangeError extends Error {
  readonly status = 400;
  constructor() { super('Сумма выходит за допустимый диапазон денежных значений'); }
}
export function moneyDecimal(value: Decimal.Value): Decimal {
  const amount = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (!amount.isFinite() || amount.abs().gt(MAX_MONEY)) throw new MoneyRangeError();
  return amount;
}
export function moneyString(value: Decimal.Value): string {
  return moneyDecimal(value).toFixed(2);
}
