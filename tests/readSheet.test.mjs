import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { readRows } from '../src/readSheet.js';
import { parseTotalsSheet } from '../src/forponto.js';

// Mesmo layout do totalizado do Forponto, com dados fictícios.
const LAYOUT = [
  ['Forponto 19.1 - Novembro de 2026'],
  [],
  ['Totalizado por Funcionário de 16/10/2026 até 12/11/2026'],
  [],
  ['Período 16/10/2026 a 12/11/2026'],
  [],
  ['', 'Funcionários', '', '', '', 'Faltas', 'AD. NOT.', 'H.E.100%', 'H.E.50%', 'H. NEG.', 'COMP. DIA', 'SALDO H.E.50%'],
  ['0000000001 - FULANO DE TESTE', '', '', '', '', '', '', '', '04:32', '02:50', '', '01:42'],
  ['Total', '', '', '', '', '', '', '', '04:32', '02:50', '', '01:42'],
];

function expectSummary(summary) {
  assert.equal(summary.he50, 272);
  assert.equal(summary.neg, 170);
  assert.equal(summary.saldo, 102);
  assert.equal(summary.periodEnd, '2026-11-12');
  assert.equal(summary.cycleMonth, '2026-11');
}

const toBuffer = (data) => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

test('lê .xls (BIFF8) com horários como texto', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(LAYOUT), 'Relatório');
  const data = XLSX.write(wb, { bookType: 'biff8', type: 'buffer' });
  assert.equal(data[0], 0xd0); // assinatura OLE2: é mesmo um .xls
  expectSummary(parseTotalsSheet(await readRows(toBuffer(data))));
});

test('lê .xls (BIFF8) com horários como hora do Excel', async () => {
  const layout = LAYOUT.map((row) => row.map((cell) => (/^\d\d:\d\d$/.test(cell) ? (Number(cell.slice(0, 2)) * 60 + Number(cell.slice(3))) / 1440 : cell)));
  const ws = XLSX.utils.aoa_to_sheet(layout);
  for (const address of Object.keys(ws)) if (typeof ws[address]?.v === 'number') ws[address].z = 'hh:mm';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  const data = XLSX.write(wb, { bookType: 'biff8', type: 'buffer' });
  expectSummary(parseTotalsSheet(await readRows(toBuffer(data))));
});

test('lê HTML exportado com extensão .xls', async () => {
  const cells = (row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
  const html = `<html><body><table>${LAYOUT.map(cells).join('')}</table></body></html>`;
  const bytes = new TextEncoder().encode(html);
  expectSummary(parseTotalsSheet(await readRows(toBuffer(bytes))));
});

test('.xlsx continua indo pelo ExcelJS', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Relatório');
  LAYOUT.forEach((row) => ws.addRow(row));
  const data = new Uint8Array(await wb.xlsx.writeBuffer());
  assert.equal(data[0], 0x50); // "PK": zip
  expectSummary(parseTotalsSheet(await readRows(toBuffer(data))));
});

test('arquivo que não é planilha dá erro claro ou nenhum resumo', async () => {
  const junk = new TextEncoder().encode('isto nao e uma planilha');
  const rows = await readRows(toBuffer(junk)).catch((error) => error);
  if (rows instanceof Error) assert.match(rows.message, /planilha|arquivo/i);
  else assert.equal(parseTotalsSheet(rows), null);
});
