import { flattenCell } from './forponto.js';

// Lê a primeira aba de uma planilha e devolve uma matriz de linhas (índice da coluna preservado).
// Escolhe o leitor pelo conteúdo do arquivo, não pela extensão:
//  - .xlsx (zip, começa com "PK")        -> ExcelJS
//  - .xls (OLE2), HTML/XML/CSV renomeado -> SheetJS (alguns sistemas exportam HTML com extensão .xls)
export async function readRows(buffer) {
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  return isZip ? readWithExcelJs(buffer) : readWithSheetJs(bytes);
}

async function readWithExcelJs(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('A planilha não tem uma aba com dados.');
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    rows[rowNumber - 1] = row.values.slice(1).map(flattenCell);
  });
  return rows;
}

async function readWithSheetJs(bytes) {
  const XLSX = await import('xlsx');
  let workbook;
  try {
    // raw: em HTML/CSV mantém o texto como veio ("04:32", "10/11/2026"), sem o SheetJS adivinhar tipos.
    workbook = XLSX.read(bytes, { type: 'array', raw: true });
  } catch {
    throw new Error('Não consegui abrir esse arquivo. Use uma planilha .xlsx ou .xls.');
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.['!ref']) throw new Error('A planilha não tem uma aba com dados.');
  // Lê as células direto (sem sheet_to_json, que converte hora em Date com deslocamento de fuso).
  // Números e horas ficam como número do Excel (fração do dia), igual ao que o ExcelJS entrega.
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rows = [];
  for (let r = 0; r <= range.e.r; r += 1) {
    const row = [];
    for (let c = 0; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      row.push(!cell || cell.t === 'e' ? '' : cell.v ?? '');
    }
    rows.push(row);
  }
  return rows;
}
