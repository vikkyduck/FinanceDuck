import type { Frequency } from './schema';

export function calendarDate(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Math.max(1, day), last))).toISOString().slice(0, 10);
}

/** Keep the configured anchor (31 Jan -> 28 Feb -> 31 Mar), independent of timezone. */
export function nextOccurrence(current: string, frequency: Frequency, anchorDay: number): string {
  const date = new Date(`${current}T00:00:00Z`);
  const months: Record<Frequency, number> = { monthly: 1, quarterly: 3, yearly: 12 };
  const step = months[frequency];
  if (!step || !Number.isFinite(date.getTime()) || anchorDay < 1 || anchorDay > 31) throw new Error('Invalid recurring schedule');
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step, 1));
  return calendarDate(target.getUTCFullYear(), target.getUTCMonth(), anchorDay);
}
