import { it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

it('round trips XLSX including conditional formatting after dependency updates', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Счета');
  sheet.addRow(['Номер', 'Сумма']); sheet.addRow(['INV-001', 1234.56]);
  // x14 conditional formatting exercises ExcelJS's UUID dependency.
  sheet.addConditionalFormatting({ ref: 'B2', rules: [{ type: 'dataBar', priority: 1,
    cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF00FF00' }, gradient: true }] });
  const bytes = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  expect(restored.getWorksheet('Счета')!.getCell('B2').value).toBe(1234.56);
});

it('writes a valid PDF using the production ESM import shape', async () => {
  const document = new PDFDocument();
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    document.on('data', chunk => chunks.push(chunk));
    document.on('error', reject); document.on('end', () => resolve(Buffer.concat(chunks)));
  });
  document.text('Invoice 1234.56'); document.end();
  expect((await complete).subarray(0, 5).toString()).toBe('%PDF-');
});
