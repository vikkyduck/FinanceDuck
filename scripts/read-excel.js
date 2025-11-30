const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function readExcelFile(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  console.log(`\n=== File: ${path.basename(filePath)} ===`);
  console.log(`Sheets: ${workbook.worksheets.map(ws => ws.name).join(', ')}`);
  
  workbook.worksheets.forEach(worksheet => {
    console.log(`\n--- Sheet: ${worksheet.name} (${worksheet.rowCount} rows) ---`);
    
    const headers = [];
    const rows = [];
    
    worksheet.eachRow((row, rowNumber) => {
      const rowData = [];
      row.eachCell((cell, colNumber) => {
        const value = cell.value;
        if (typeof value === 'object' && value !== null) {
          if (value.text) rowData.push(value.text);
          else if (value.result !== undefined) rowData.push(value.result);
          else rowData.push(JSON.stringify(value));
        } else {
          rowData.push(value);
        }
      });
      
      if (rowNumber === 1) {
        headers.push(...rowData);
        console.log('Headers:', headers.join(' | '));
      } else {
        rows.push(rowData);
      }
    });
    
    console.log(`Data rows: ${rows.length}`);
    rows.slice(0, 5).forEach((row, i) => {
      console.log(`Row ${i+1}:`, JSON.stringify(row));
    });
    if (rows.length > 5) {
      console.log(`... and ${rows.length - 5} more rows`);
    }
  });
}

async function main() {
  const files = [
    'attached_assets/export_full_filtered_2025-11-29 (1)_1764493956258.xlsx',
    'attached_assets/export_full_filtered_2025-11-29 (2)_1764493965587.xlsx',
    'attached_assets/export_full_filtered_2025-11-29_1764493972308.xlsx'
  ];
  
  for (const file of files) {
    if (fs.existsSync(file)) {
      await readExcelFile(file);
    } else {
      console.log(`File not found: ${file}`);
    }
  }
}

main().catch(console.error);
