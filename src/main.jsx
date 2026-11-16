import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Download,
  FileSpreadsheet,
  Upload,
  TriangleAlert,
  X,
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'ritmo-jornada-registros-v1';
const DAILY_TARGET = 8 * 60 + 48;
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function periodFor(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const start = new Date(year, month - 2, 16, 12);
  const end = new Date(year, month - 1, 15, 12);
  return { start, end };
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value, options = { day: '2-digit', month: 'short' }) {
  return new Intl.DateTimeFormat('pt-BR', options).format(value);
}

function formatMinutes(value, signed = false) {
  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  const absolute = Math.abs(Math.round(value));
  return `${sign}${Math.floor(absolute / 60)}h${String(absolute % 60).padStart(2, '0')}`;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }
  if (typeof value === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    if (!Number.isNaN(epoch.getTime())) return new Date(epoch.getUTCFullYear(), epoch.getUTCMonth(), epoch.getUTCDate(), 12);
  }
  const text = String(value ?? '').trim();
  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), 12);
  const brDate = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (brDate) {
    const year = Number(brDate[3].length === 2 ? `20${brDate[3]}` : brDate[3]);
    return new Date(year, Number(brDate[2]) - 1, Number(brDate[1]), 12);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
}

function parseTime(value) {
  if (typeof value === 'number' && value >= 0 && value < 1) return Math.round(value * 1440);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getHours() * 60 + value.getMinutes();
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{1,2})[:h](\d{2})$/i);
  if (match && Number(match[1]) < 24 && Number(match[2]) < 60) return Number(match[1]) * 60 + Number(match[2]);
  return null;
}

function getColumn(headers, candidates) {
  return headers.findIndex((header) => candidates.includes(normalize(header)));
}

async function parseWorkbook(buffer) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('A planilha não tem uma aba com dados.');
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    rows[rowNumber - 1] = row.values.slice(1).map((cell) => cell?.text ?? cell ?? '');
  });
  const headers = rows[0] ?? [];
  const columns = {
    date: getColumn(headers, ['data', 'date']),
    start: getColumn(headers, ['entrada', 'inicio', 'entradamanha']),
    breakStart: getColumn(headers, ['iniciodointervalo', 'iniciointervalo', 'intervaloinicio', 'saidaintervalo']),
    breakEnd: getColumn(headers, ['fimdointervalo', 'fimintervalo', 'intervalofim', 'retornointervalo']),
    end: getColumn(headers, ['saida', 'fim', 'saidadia']),
    status: getColumn(headers, ['situacao', 'status', 'tipo']),
  };
  if (columns.date < 0) throw new Error('Não encontrei a coluna Data. Use o modelo da aplicação.');

  const records = [];
  let skipped = 0;
  rows.slice(1).forEach((row, index) => {
    if (!row.some((cell) => String(cell ?? '').trim())) return;
    const date = parseDate(row[columns.date]);
    if (!date) {
      skipped += 1;
      return;
    }
    records.push({
      id: `${dateKey(date)}-${index}`,
      date: dateKey(date),
      start: columns.start < 0 ? '' : row[columns.start],
      breakStart: columns.breakStart < 0 ? '' : row[columns.breakStart],
      breakEnd: columns.breakEnd < 0 ? '' : row[columns.breakEnd],
      end: columns.end < 0 ? '' : row[columns.end],
      status: columns.status < 0 ? '' : String(row[columns.status] ?? '').trim(),
    });
  });
  if (!records.length) throw new Error('Não encontrei nenhuma linha com uma data válida.');
  return { records, skipped };
}

function minutesForRecord(record) {
  const status = normalize(record.status);
  if (['folga', 'feriado', 'ferias', 'afastamento', 'descanso', 'naotrabalhado'].includes(status)) {
    return { kind: 'off', worked: 0, target: 0, delta: 0 };
  }
  const times = [record.start, record.breakStart, record.breakEnd, record.end].map(parseTime);
  if (times.some((time) => time === null)) return { kind: 'incomplete' };
  const [start, breakStart, breakEnd, end] = times;
  let adjustedBreakStart = breakStart;
  let adjustedBreakEnd = breakEnd;
  let adjustedEnd = end;
  while (adjustedBreakStart < start) adjustedBreakStart += 1440;
  while (adjustedBreakEnd < adjustedBreakStart) adjustedBreakEnd += 1440;
  while (adjustedEnd < adjustedBreakEnd) adjustedEnd += 1440;
  const worked = adjustedBreakStart - start + adjustedEnd - adjustedBreakEnd;
  const date = new Date(`${record.date}T12:00:00`);
  const target = date.getDay() === 0 || date.getDay() === 6 ? 0 : DAILY_TARGET;
  return { kind: 'worked', worked, target, delta: worked - target };
}

function weekdaysBetween(start, end) {
  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) days.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

async function downloadTemplate(monthValue) {
  const { default: ExcelJS } = await import('exceljs');
  const { start, end } = periodFor(monthValue);
  const days = weekdaysBetween(start, end);
  const rows = [
    ['Data', 'Entrada', 'Início intervalo', 'Fim intervalo', 'Saída', 'Situação'],
    ...days.map((day) => [day, '', '', '', '', 'Trabalhado']),
  ];
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Jornada');
  rows.forEach((row) => worksheet.addRow(row));
  worksheet.columns = [14, 13, 20, 18, 13, 18].map((width) => ({ width }));
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `modelo-jornada-${monthValue}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [month, setMonth] = useState(currentMonth);
  const [records, setRecords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const { start, end } = useMemo(() => periodFor(month), [month]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  const calculation = useMemo(() => {
    const cycleRows = records
      .filter((record) => record.date >= dateKey(start) && record.date <= dateKey(end))
      .map((record) => ({ ...record, result: minutesForRecord(record) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const workedRows = cycleRows.filter((row) => row.result.kind === 'worked');
    const incomplete = cycleRows.filter((row) => row.result.kind === 'incomplete');
    const extra = workedRows.reduce((sum, row) => sum + Math.max(0, row.result.delta), 0);
    const deficit = workedRows.reduce((sum, row) => sum + Math.max(0, -row.result.delta), 0);
    const balance = extra - deficit;
    const neededToTarget = Math.max(0, balance + 5);
    const weekdayKeys = weekdaysBetween(start, end);
    const recordedDates = new Set(cycleRows.filter((row) => row.result.kind !== 'incomplete').map((row) => row.date));
    const missing = weekdayKeys.filter((day) => !recordedDates.has(day)).length;
    const hasImportedRecords = cycleRows.length > 0;
    return { cycleRows, workedRows, incomplete, extra, deficit, balance, neededToTarget, missing, hasImportedRecords };
  }, [records, start, end]);

  async function importFile(file) {
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const { records: imported, skipped } = await parseWorkbook(await file.arrayBuffer());
      const unique = new Map();
      imported.forEach((record) => unique.set(record.date, record));
      setRecords((current) => {
        const outside = current.filter((record) => record.date < dateKey(start) || record.date > dateKey(end));
        return [...outside, ...unique.values()];
      });
      setFileName(file.name);
      setNotice(`${unique.size} dias importados${skipped ? ` · ${skipped} linha(s) ignorada(s) sem data válida` : ''}.`);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Não foi possível ler esse arquivo.');
    }
  }

  function onFileChange(event) {
    importFile(event.target.files?.[0]);
    event.target.value = '';
  }

  function clearCycle() {
    setRecords((current) => current.filter((record) => record.date < dateKey(start) || record.date > dateKey(end)));
    setFileName('');
    setNotice('Registros deste ciclo removidos.');
    setError('');
  }

  const closeDate = formatDate(end, { day: '2-digit', month: 'long', year: 'numeric' });
  const periodLabel = `${formatDate(start)} — ${formatDate(end, { day: '2-digit', month: 'short', year: 'numeric' })}`;
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(end);
  const statusLabel = !calculation.hasImportedRecords
    ? 'Aguardando planilha'
    : calculation.incomplete.length
      ? 'Revisar batidas'
      : calculation.balance <= -5
        ? 'Meta atingida'
        : 'Compensação pendente';

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Ritmo, início">
          <span className="brand-mark"><span /></span>
          <span>ritmo<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right">
          <span className="topbar-caption">CONTROLE DE JORNADA</span>
          <span className="avatar" aria-label="Perfil">J</span>
        </div>
      </header>

      <section className="page-content" id="inicio">
        <div className="page-heading">
          <div>
            <p className="eyebrow">SEU TEMPO, EM DIA</p>
            <h1>Fechamento de jornada</h1>
            <p className="heading-copy">Acompanhe o saldo do ciclo e organize a compensação antes da folha.</p>
          </div>
          <label className="cycle-select">
            <CalendarDays size={17} aria-hidden="true" />
            <span className="sr-only">Mês de fechamento</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>

        <section className="cycle-banner" aria-label="Período de fechamento">
          <div className="cycle-icon"><Clock3 size={19} /></div>
          <div className="cycle-copy">
            <span className="cycle-kicker">CICLO DE {monthLabel}</span>
            <strong>{periodLabel}</strong>
          </div>
          <div className="cycle-close">
            <span>ÚLTIMO DIA PARA COMPENSAR</span>
            <strong>{closeDate}</strong>
          </div>
          <div className={`cycle-status ${calculation.balance <= -5 && calculation.hasImportedRecords ? 'is-good' : ''}`}>
            <span className="status-dot" />{statusLabel}
          </div>
        </section>

        <section className="metrics" aria-label="Resumo do ciclo">
          <article className="metric-card metric-balance">
            <div className="metric-top"><span>Saldo do ciclo</span><span className="metric-symbol"><Clock3 size={16} /></span></div>
            <strong className={calculation.balance > 0 ? 'positive' : calculation.balance < 0 ? 'negative' : ''}>
              {calculation.hasImportedRecords ? formatMinutes(calculation.balance, true) : '—'}
            </strong>
            <p>{calculation.hasImportedRecords ? (calculation.balance <= -5 ? 'Dentro da meta de fechamento' : `${formatMinutes(calculation.neededToTarget)} para atingir −5 min`) : 'Importe as batidas do período'}</p>
          </article>
          <article className="metric-card metric-extra">
            <div className="metric-top"><span>Horas extras</span><span className="metric-symbol extra-symbol"><ArrowUpRight size={17} /></span></div>
            <strong>{calculation.hasImportedRecords ? formatMinutes(calculation.extra) : '—'}</strong>
            <p>Crédito acumulado para compensação</p>
          </article>
          <article className="metric-card metric-deficit">
            <div className="metric-top"><span>Horas abaixo</span><span className="metric-symbol deficit-symbol"><ArrowDownRight size={17} /></span></div>
            <strong>{calculation.hasImportedRecords ? formatMinutes(calculation.deficit) : '—'}</strong>
            <p>Diferença em relação à jornada prevista</p>
          </article>
          <article className="metric-card metric-days">
            <div className="metric-top"><span>Dias calculados</span><span className="metric-symbol days-symbol"><CalendarDays size={16} /></span></div>
            <strong>{calculation.workedRows.length}<small> dias</small></strong>
            <p>{calculation.missing} dias úteis sem registro no ciclo</p>
          </article>
        </section>

        <section className="work-area">
          <div className="section-heading">
            <div>
              <p className="eyebrow">IMPORTAÇÃO</p>
              <h2>Planilha de ponto</h2>
            </div>
            <button className="text-button" onClick={() => downloadTemplate(month)}>
              <Download size={16} /> Baixar modelo Excel
            </button>
          </div>

          <div
            className={`upload-zone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              importFile(event.dataTransfer.files?.[0]);
            }}
          >
            <div className="upload-icon"><FileSpreadsheet size={22} /></div>
            <div className="upload-copy">
              <strong>{fileName || 'Solte sua planilha aqui'}</strong>
              <span>Excel .xlsx · colunas de data e batidas</span>
            </div>
            <button className="upload-button" onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> Selecionar arquivo
            </button>
            <input ref={fileInput} className="sr-only" type="file" accept=".xlsx" onChange={onFileChange} />
          </div>
          {(notice || error) && (
            <div className={`import-message ${error ? 'message-error' : ''}`} role="status">
              {error ? <TriangleAlert size={16} /> : <Check size={16} />}
              <span>{error || notice}</span>
              {calculation.hasImportedRecords && <button aria-label="Remover registros deste ciclo" title="Remover ciclo" onClick={clearCycle}><X size={15} /></button>}
            </div>
          )}
        </section>

        <section className="records-section">
          <div className="section-heading records-heading">
            <div>
              <p className="eyebrow">DETALHAMENTO</p>
              <h2>Resumo diário <span>{calculation.cycleRows.length}</span></h2>
            </div>
            <div className="target-note"><span className="target-line" /> Jornada prevista <strong>8h48 / dia</strong></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Data</th><th>Batidas</th><th>Trabalhadas</th><th>Previstas</th><th>Variação</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {calculation.cycleRows.length ? calculation.cycleRows.map((row) => {
                  const result = row.result;
                  const date = new Date(`${row.date}T12:00:00`);
                  const punches = [row.start, row.breakStart, row.breakEnd, row.end].map(parseTime);
                  const punchText = punches.some((value) => value === null)
                    ? '—'
                    : punches.map((value) => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`).join(' · ');
                  const label = result.kind === 'incomplete' ? 'Batidas incompletas' : result.kind === 'off' ? (row.status || 'Não trabalhado') : result.delta > 0 ? 'Extra' : result.delta < 0 ? 'Abaixo da jornada' : 'No horário';
                  return (
                    <tr key={row.id}>
                      <td><strong>{formatDate(date, { day: '2-digit', month: 'short' })}</strong><span className="weekday">{WEEKDAYS[date.getDay()]}</span></td>
                      <td className="punches">{punchText}</td>
                      <td>{result.kind === 'worked' ? formatMinutes(result.worked) : '—'}</td>
                      <td>{result.kind === 'worked' ? formatMinutes(result.target) : '—'}</td>
                      <td className={result.kind === 'worked' ? (result.delta > 0 ? 'positive' : result.delta < 0 ? 'negative' : '') : ''}>{result.kind === 'worked' ? formatMinutes(result.delta, true) : '—'}</td>
                      <td><span className={`row-status ${result.kind === 'incomplete' ? 'row-warning' : result.kind === 'off' ? 'row-off' : result.delta > 0 ? 'row-extra' : result.delta < 0 ? 'row-short' : 'row-ok'}`}><span />{label}</span></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="6" className="empty-state"><div className="empty-mark"><FileSpreadsheet size={22} /></div><strong>Nenhum registro neste ciclo</strong><span>Importe sua planilha ou baixe o modelo para começar.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footnote"><TriangleAlert size={14} /><span>O saldo considera extras menos horas abaixo da jornada. A meta do ciclo é fechar em −5 min ou menos.</span></div>
        </section>
        <footer className="footer"><span>RITMO <span className="brand-period">/</span> {new Date().getFullYear()}</span><span>Seus dados ficam salvos neste navegador.</span></footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);