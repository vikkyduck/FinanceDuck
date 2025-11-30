const ExcelJS = require('exceljs');
const { Pool } = require('pg');

console.log('Starting import script...');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function readExcelData(filePath) {
  console.log('Reading Excel file:', filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const data = { partners: [], clients: [], invoices: [], expenses: [] };
  
  workbook.worksheets.forEach(worksheet => {
    const rows = [];
    const headers = [];
    
    worksheet.eachRow((row, rowNumber) => {
      const rowData = [];
      row.eachCell((cell, colNumber) => {
        let value = cell.value;
        if (typeof value === 'object' && value !== null) {
          if (value.text) value = value.text;
          else if (value.result !== undefined) value = value.result;
          else value = JSON.stringify(value);
        }
        rowData.push(value);
      });
      
      if (rowNumber === 1) {
        headers.push(...rowData);
      } else {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = rowData[i] || null;
        });
        rows.push(obj);
      }
    });
    
    if (worksheet.name === 'Партнёры') data.partners = rows;
    if (worksheet.name === 'Клиенты') data.clients = rows;
    if (worksheet.name === 'Счета') data.invoices = rows;
    if (worksheet.name === 'Расходы') data.expenses = rows;
  });
  
  return data;
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^\d.-]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parsePercent(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val * 100;
  const str = String(val).replace('%', '').replace(',', '.').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  const str = String(val);
  const match = str.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
}

function mapScheme(scheme) {
  const schemeMap = {
    'Комиссионный': 'commission_based',
    'Партнёр 10%': 'partner_10',
    'Партнёр 15%': 'partner_15',
    'Агентство 30%': 'agency_30',
  };
  return schemeMap[scheme] || 'commission_based';
}

function mapStatus(status) {
  const statusMap = {
    'Оплачен': 'paid',
    'Черновик': 'draft',
    'Отправлен': 'sent',
    'Отменён': 'cancelled',
  };
  return statusMap[status] || 'draft';
}

async function importData() {
  console.log('Connecting to database...');
  const client = await pool.connect();
  console.log('Connected!');
  
  try {
    const data = await readExcelData('attached_assets/export_full_filtered_2025-11-29_1764493972308.xlsx');
    
    console.log('Partners:', data.partners.length);
    console.log('Clients:', data.clients.length);
    console.log('Invoices:', data.invoices.length);
    console.log('Expenses:', data.expenses.length);
    
    await client.query('BEGIN');
    
    const partnerMap = {};
    const clientMap = {};
    const invoiceMap = {};
    
    console.log('\n=== Importing Partners ===');
    for (const p of data.partners) {
      const name = p['Название'];
      if (!name) continue;
      
      const result = await client.query(
        `INSERT INTO partners (name, email, phone) 
         VALUES ($1, $2, $3) 
         RETURNING id`,
        [name, p['Email'] || null, p['Телефон'] || null]
      );
      
      partnerMap[name] = result.rows[0].id;
      console.log(`  Created partner: ${name} -> ${result.rows[0].id}`);
    }
    
    console.log('\n=== Importing Clients ===');
    for (const c of data.clients) {
      const name = c['Название'];
      if (!name) continue;
      
      const result = await client.query(
        `INSERT INTO clients (name, email, phone) 
         VALUES ($1, $2, $3) 
         RETURNING id`,
        [name, c['Email'] || null, c['Телефон'] || null]
      );
      
      clientMap[name] = result.rows[0].id;
      console.log(`  Created client: ${name} -> ${result.rows[0].id}`);
    }
    
    const adminTokenResult = await client.query(
      `SELECT id FROM access_tokens WHERE code = 'ADM-001'`
    );
    const adminTokenId = adminTokenResult.rows[0]?.id;
    
    if (!adminTokenId) {
      throw new Error('Admin token not found');
    }
    console.log('Admin token ID:', adminTokenId);
    
    console.log('\n=== Importing Invoices ===');
    for (const inv of data.invoices) {
      const invoiceNumber = inv['Номер'];
      const clientName = inv['Клиент'];
      const partnerName = inv['Партнёр'];
      
      if (!invoiceNumber || !clientName || !partnerName) {
        console.log(`  Skipping invoice: missing data`, inv);
        continue;
      }
      
      const clientId = clientMap[clientName];
      const partnerId = partnerMap[partnerName];
      
      if (!clientId || !partnerId) {
        console.log(`  Skipping invoice ${invoiceNumber}: client or partner not found`);
        continue;
      }
      
      const clientBill = parseNumber(inv['Сумма клиента']);
      const scheme = mapScheme(inv['Схема']);
      const status = mapStatus(inv['Статус']);
      const commissionRate = parsePercent(inv['Комиссия %']);
      const commissionAmount = parseNumber(inv['Комиссия']);
      const paymentDate = parseDate(inv['План. дата']);
      const actualPaymentDate = parseDate(inv['Факт. дата']);
      const description = inv['Примечание'] || null;
      
      const result = await client.query(
        `INSERT INTO invoices 
         (invoice_number, client_id, partner_id, scheme, status, client_bill, 
          partner_commission_rate, commission_amount, payment_date, actual_payment_date, 
          description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [invoiceNumber, clientId, partnerId, scheme, status, clientBill,
         commissionRate, commissionAmount, paymentDate, actualPaymentDate,
         description, adminTokenId]
      );
      
      invoiceMap[invoiceNumber] = result.rows[0].id;
      console.log(`  Created invoice: ${invoiceNumber} -> ${result.rows[0].id}`);
      
      const netProfit = parseNumber(inv['Чистая прибыль']);
      const partnerDebt = parseNumber(inv['Долг партнёра']);
      const clientRemaining = parseNumber(inv['Остаток клиента']);
      const expenses = parseNumber(inv['Расходы']) || 0;
      
      await client.query(
        `INSERT INTO invoice_calculations 
         (invoice_id, client_bill, commission_rate, commission_amount, 
          amount_to_admin, net_profit_admin, partner_transfer_due, 
          client_remaining, executor_expenses_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [result.rows[0].id, clientBill || 0, commissionRate, commissionAmount,
         partnerDebt || 0, netProfit || 0, partnerDebt || 0, clientRemaining || 0, expenses]
      );
    }
    
    console.log('\n=== Importing Expenses ===');
    let expenseCount = 0;
    for (const exp of data.expenses) {
      const invoiceNumber = exp['Номер счёта'];
      const invoiceId = invoiceMap[invoiceNumber];
      
      if (!invoiceId) {
        continue;
      }
      
      const description = exp['Описание'] || 'Расход';
      const amount = parseNumber(exp['Сумма']);
      const paidBy = exp['Оплатил'];
      const paidByAdmin = paidBy === 'Админ';
      const dateStr = parseDate(exp['Дата']);
      
      await client.query(
        `INSERT INTO invoice_expenses 
         (invoice_id, description, amount, paid_by_admin, date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [invoiceId, description, amount, paidByAdmin, dateStr || '2025-11-29', adminTokenId]
      );
      expenseCount++;
    }
    console.log(`  Created ${expenseCount} expenses`);
    
    console.log('\n=== Creating Access Tokens ===');
    
    for (const [partnerName, partnerId] of Object.entries(partnerMap)) {
      const code = `PART-${partnerName.split(' ')[0].toUpperCase().substring(0, 4)}-001`;
      await client.query(
        `INSERT INTO access_tokens (code, role, partner_id, is_active)
         VALUES ($1, 'partner', $2, true)
         ON CONFLICT (code) DO NOTHING`,
        [code, partnerId]
      );
      console.log(`  Created partner token: ${code}`);
    }
    
    for (const [clientName, clientId] of Object.entries(clientMap)) {
      const shortName = clientName.replace(/[^a-zA-Zа-яА-Я0-9]/g, '').substring(0, 6).toUpperCase();
      const code = `CLI-${shortName}-001`;
      await client.query(
        `INSERT INTO access_tokens (code, role, client_id, is_active)
         VALUES ($1, 'client', $2, true)
         ON CONFLICT (code) DO NOTHING`,
        [code, clientId]
      );
      console.log(`  Created client token: ${code}`);
    }
    
    await client.query('COMMIT');
    console.log('\n=== Import completed successfully! ===');
    
    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM partners) as partners,
        (SELECT COUNT(*) FROM clients) as clients,
        (SELECT COUNT(*) FROM invoices) as invoices,
        (SELECT COUNT(*) FROM invoice_expenses) as expenses,
        (SELECT COUNT(*) FROM access_tokens) as tokens
    `);
    
    console.log('\nDatabase stats:');
    console.log('  Partners:', stats.rows[0].partners);
    console.log('  Clients:', stats.rows[0].clients);
    console.log('  Invoices:', stats.rows[0].invoices);
    console.log('  Expenses:', stats.rows[0].expenses);
    console.log('  Access tokens:', stats.rows[0].tokens);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importData().then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
