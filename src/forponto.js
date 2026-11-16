// Leitor do relatório "Totalizado por Funcionário" do Forponto.
// Funções puras, sem DOM, para poder testar em Node.

export function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Converte o valor de uma célula do ExcelJS em algo simples (texto, número ou Date).
export function flattenCell(cell) {
  if (cell == null) return '';
  if (cell instanceof Date) return cell;
  if (typeof cell === 'object') {
    if ('result' in cell) return flattenCell(cell.result);
    if (Array.isArray(cell.richText)) return cell.richText.map((part) => part.text).join('');
    if ('text' in cell) return cell.text ?? '';
    return '';
  }
  return cell;
}

// Horário/duração em minutos. Aceita "04:32", "4h32", "-02:50", fração de dia do Excel e Date.
// Devolve null se não for um horário; célula vazia também é null.
export function toMinutes(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Math.round((value.getTime() - Date.UTC(1899, 11, 30)) / 60000);
  }
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 1440) : null;
  const match = String(value).trim().match(/^(-)?\s*(\d{1,4})\s*[:h]\s*(\d{2})(?::\d{2})?$/i);
  if (!match) return null;
  const total = Number(match[2]) * 60 + Number(match[3]);
  return match[1] ? -total : total;
}

function brDate(text) {
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12) : null;
}

function isoKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// O ciclo vai do dia 16 do mês anterior ao dia 15 do mês de fechamento.
export function cycleMonthOf(date) {
  const target = date.getDate() <= 15 ? new Date(date.getFullYear(), date.getMonth(), 1) : new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

function findPeriod(rows) {
  for (const row of rows.slice(0, 30)) {
    for (const cell of row) {
      const text = typeof cell === 'string' ? cell : '';
      if (!text) continue;
      const labeled = /per[ií]odo\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+a\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(text)
        ?? /de\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+at[eé]\s+(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(text);
      if (labeled) {
        const start = brDate(labeled[1]);
        const end = brDate(labeled[2]);
        if (start && end) return { start, end };
      }
    }
  }
  return null;
}

const COLUMN_RULES = [
  ['faltas', (key) => key === 'faltas' || key === 'falta'],
  ['adNot', (key) => key === 'adnot' || key === 'adnotur' || key === 'adnoturno'],
  ['he100', (key) => key === 'he100'],
  ['he50', (key) => key === 'he50'],
  ['neg', (key) => key === 'hneg' || key === 'hnegativas' || key === 'hnegativa'],
  ['compDia', (key) => key === 'compdia'],
  // Última coluna ("... H.E.50%"): saldo do banco de horas a 50%.
  ['saldoArquivo', (key) => key.length > 4 && key.endsWith('he50')],
];

/**
 * rows: matriz de células já "achatadas" (índice da coluna preservado).
 * Devolve null se a planilha não for o totalizado do Forponto.
 */
export function parseTotalsSheet(rows) {
  // Array.from (e não .map) porque linhas em branco chegam como "buracos" na matriz.
  const dense = Array.from(rows, (row) => Array.from(row ?? [], (cell) => cell ?? ''));
  const headerIndex = dense.findIndex((row) => row.some((cell) => normalize(cell) === 'funcionarios'));
  if (headerIndex < 0) return null;

  const columns = {};
  dense[headerIndex].forEach((cell, index) => {
    const key = normalize(cell);
    if (!key) return;
    for (const [name, matches] of COLUMN_RULES) {
      if (!(name in columns) && matches(key)) {
        columns[name] = index;
        break;
      }
    }
  });
  if (columns.he50 === undefined && columns.neg === undefined) return null;

  const employeeRows = [];
  for (const row of dense.slice(headerIndex + 1)) {
    const label = row.find((cell) => String(cell).trim() !== '');
    if (label === undefined) continue;
    if (normalize(label) === 'total') break;
    const hasTime = Object.values(columns).some((index) => toMinutes(row[index]) !== null);
    if (typeof label === 'string' && hasTime) employeeRows.push(row);
  }
  if (!employeeRows.length) throw new Error('Achei o cabeçalho do relatório, mas nenhuma linha de funcionário com horas.');

  const row = employeeRows[0];
  const read = (name) => (name in columns ? toMinutes(row[columns[name]]) ?? 0 : 0);
  const he50 = read('he50');
  const neg = Math.abs(read('neg'));
  const saldo = he50 - neg;
  const saldoArquivo = 'saldoArquivo' in columns ? toMinutes(row[columns.saldoArquivo]) : null;

  const period = findPeriod(dense);
  return {
    faltas: read('faltas'),
    adNot: read('adNot'),
    he100: read('he100'),
    he50,
    neg,
    compDia: read('compDia'),
    saldo,
    saldoArquivo,
    periodStart: period ? isoKey(period.start) : null,
    periodEnd: period ? isoKey(period.end) : null,
    cycleMonth: period ? cycleMonthOf(period.end) : null,
    employees: employeeRows.length,
  };
}
