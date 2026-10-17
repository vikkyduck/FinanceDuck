import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

it('migrates paid legacy duplicates without changing their financial facts and prevents new duplicate generation keys', async () => {
  const db = new PGlite();
  try {
    for (const file of ['0000_calm_susan_delgado.sql', '0001_clammy_korvac.sql']) {
      await db.exec(await readFile(`drizzle/${file}`, 'utf8'));
    }
    await db.exec(`
      INSERT INTO partners(id,name) VALUES('00000000-0000-0000-0000-000000000001','Fixture');
      INSERT INTO clients(id,name) VALUES('00000000-0000-0000-0000-000000000001','Fixture');
      INSERT INTO invoices(invoice_number,client_id,partner_id,created_by,scheme,status,client_bill,recurring_invoice_id,issue_date)
      SELECT 'LEGACY-' || n, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001', 'agency_30', 'paid', n*100, '00000000-0000-0000-0000-000000000002', '2025-12-01'
      FROM generate_series(1,2) n;
    `);
    const before = await db.query('SELECT to_jsonb(i) AS row FROM invoices i ORDER BY id');
    await db.exec(await readFile('drizzle/0002_financial_integrity.sql', 'utf8'));
    const after = await db.query("SELECT to_jsonb(i) - 'recurring_occurrence_key' AS row FROM invoices i ORDER BY id");
    expect(after.rows).toEqual(before.rows);
    const keys = await db.query<{ key: string }>('SELECT recurring_occurrence_key AS key FROM invoices WHERE recurring_occurrence_key IS NOT NULL');
    expect(keys.rows).toEqual([{ key: '00000000-0000-0000-0000-000000000002:2025-12-01' }]);
    await expect(db.query('UPDATE invoices SET recurring_occurrence_key=$1 WHERE recurring_occurrence_key IS NULL', [keys.rows[0].key])).rejects.toThrow('uq_invoices_recurring_occurrence');
  } finally { await db.close(); }
});
