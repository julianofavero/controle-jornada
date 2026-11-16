import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { flattenCell, parseTotalsSheet, toMinutes, cycleMonthOf } from '../src/forponto.js';

// Planilha fictícia no layout do relatório "Totalizado por Funcionário" do Forponto.
async function buildFixture({ timeMode = 'text', extraEmployee = false } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Relatório');
  const put = (address, value, numFmt) => {
    const cell = ws.getCell(address);
    cell.value = value;
    if (numFmt) cell.numFmt = numFmt;
  };
  const time = (hours, minutes) => {
    if (timeMode === 'text') return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    if (timeMode === 'fraction') return (hours * 60 + minutes) / 1440;
    return new Date(Date.UTC(1899, 11, 30, hours, minutes)); // 'date'
  };
  const fmt = timeMode === 'text' ? undefined : 'hh:mm';

  put('A2', 'Forponto 19.1 - Novembro de 2026');
  put('M2', 'Página');
  put('A3', '00001');
  put('A4', 'Totalizado por Funcionário de 16/10/2026 até 12/11/2026');
  put('A6', 'Período 16/10/2026 a 12/11/2026');
  put('B8', 'Funcionários');
  put('F8', 'Faltas');
  put('G8', 'AD. NOT.');
  put('H8', 'H.E.100%');
  put('I8', 'H.E.50%');
  put('J8', 'H. NEG.');
  put('K8', 'COMP. DIA');
  put('L8', 'SALDO H.E.50%');
  put('A9', '0000000001 - FULANO DE TESTE');
  put('I9', time(4, 32), fmt);
  put('J9', time(2, 50), fmt);
  put('L9', time(1, 42), fmt);
  let totalRow = 10;
  if (extraEmployee) {
    put('A10', '0000000002 - BELTRANO DE TESTE');
    put('I10', time(1, 0), fmt);
    totalRow = 11;
  }
  put(`A${totalRow}`, 'Total');
  put(`I${totalRow}`, time(4, 32), fmt);
  put('A13', 'Esta cópia está licenciada para EMPRESA TESTE');

  const buffer = await wb.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  const sheet = loaded.worksheets[0];
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    rows[rowNumber - 1] = row.values.slice(1).map(flattenCell);
  });
  return rows;
}

for (const timeMode of ['text', 'fraction', 'date']) {
  test(`lê o totalizado com horários em formato ${timeMode}`, async () => {
    const summary = parseTotalsSheet(await buildFixture({ timeMode }));
    assert.equal(summary.he50, 4 * 60 + 32);
    assert.equal(summary.neg, 2 * 60 + 50);
    assert.equal(summary.saldo, 102);
    assert.equal(summary.saldoArquivo, 102);
    assert.equal(summary.he100, 0);
    assert.equal(summary.periodStart, '2026-10-16');
    assert.equal(summary.periodEnd, '2026-11-12');
    assert.equal(summary.cycleMonth, '2026-11');
    assert.equal(summary.employees, 1);
  });
}

test('com mais de um funcionário usa o primeiro e avisa a quantidade', async () => {
  const summary = parseTotalsSheet(await buildFixture({ extraEmployee: true }));
  assert.equal(summary.employees, 2);
  assert.equal(summary.he50, 272);
});

test('planilha de batidas diárias não é tratada como totalizado', () => {
  const rows = [['Data', 'Entrada', 'Início intervalo', 'Fim intervalo', 'Saída', 'Situação'], ['2026-10-19', '08:00', '12:00', '13:00', '18:00', 'Trabalhado']];
  assert.equal(parseTotalsSheet(rows), null);
});

test('toMinutes aceita os formatos esperados', () => {
  assert.equal(toMinutes('04:32'), 272);
  assert.equal(toMinutes('4h32'), 272);
  assert.equal(toMinutes('-02:50'), -170);
  assert.equal(toMinutes('104:05'), 6245);
  assert.equal(toMinutes(''), null);
  assert.equal(toMinutes('abc'), null);
});

test('ciclo: dia 12/11 e 16/10 fecham em novembro; 16/11 fecha em dezembro', () => {
  assert.equal(cycleMonthOf(new Date(2026, 10, 12)), '2026-11');
  assert.equal(cycleMonthOf(new Date(2026, 9, 16)), '2026-11');
  assert.equal(cycleMonthOf(new Date(2026, 10, 16)), '2026-12');
});
