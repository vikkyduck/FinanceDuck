import { db } from '../db';
import { processAllDueRecurringInvoices } from '../repositories/recurringRepo';
import { hourly, type Job } from './jobRunner';

/** A broken template is named in the job result and the log; it must not fail the job or block a release. */
export const recurringInvoicesJob = (database = db): Job => ({
  key: 'recurring-invoices', nextRunAt: hourly,
  run: async () => {
    const result = await processAllDueRecurringInvoices(database);
    for (const error of result.errors) console.error('[jobs] recurring-invoices', error);
    return result;
  },
});
