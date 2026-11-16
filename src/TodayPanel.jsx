import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, LogOut, TriangleAlert } from 'lucide-react';
import { formatMinutes } from './format.js';
import { EXTRA_LIMIT_MINUTES } from './rules.js';
import { DAILY_TARGET, DEFAULT_BREAK, GOAL_BALANCE, clock, parseClock, parseSignedMinutes, planToday } from './today.js';

const STORAGE_KEY = 'ritmo-hoje-v1';

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function nowClock() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// Chegada, saída e saldo digitado valem só para o dia; o intervalo fica salvo para os próximos.
function loadSaved() {
  const fresh = { date: todayKey(), entry: '', exit: '', balanceText: '', breakMin: DEFAULT_BREAK };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved) return fresh;
    const breakMin = Number.isFinite(saved.breakMin) ? saved.breakMin : DEFAULT_BREAK;
    return saved.date === fresh.date ? { ...fresh, ...saved, breakMin } : { ...fresh, breakMin };
  } catch {
    return fresh;
  }
}

/**
 * balanceFromImport: saldo do ciclo atual vindo da planilha (antes de hoje), ou null.
 * workdaysLeft: dias úteis até o fechamento, contando hoje.
 */
export default function TodayPanel({ balanceFromImport, importNote, unavailableNote, workdaysLeft, weekendToday }) {
  const [saved, setSaved] = useState(loadSaved);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // sem armazenamento: o painel continua funcionando, só não lembra os valores
    }
  }, [saved]);

  const update = (patch) => setSaved((current) => ({ ...current, ...patch }));

  const entry = parseClock(saved.entry);
  const exit = parseClock(saved.exit);
  const typedBalance = parseSignedMinutes(saved.balanceText);
  const balance = typedBalance ?? balanceFromImport;
  const balanceKnown = balance !== null && balance !== undefined;
  const breakMin = Number(saved.breakMin) >= 0 ? Number(saved.breakMin) : DEFAULT_BREAK;

  const plan = useMemo(
    () => (entry === null ? null : planToday({ entry, breakMin, balance: balanceKnown ? balance : 0, exit })),
    [entry, breakMin, balance, balanceKnown, exit],
  );

  const days = Math.max(1, workdaysLeft);
  const perDay = plan && balanceKnown && plan.needToCompensate > 0 && days > 1 ? Math.ceil(plan.needToCompensate / days) : null;
  const mainExit = plan ? (balanceKnown ? plan.goalExit : plan.fullDayExit) : null;
  const exitInvalid = saved.exit && exit === null;
  // Saldo final do ciclo: o da saída escolhida; senão o da saída que fecha a meta (se existir).
  const totalAfter = !plan || !balanceKnown ? null : plan.custom ? plan.custom.balanceAfter : plan.goalReachable ? plan.goalBalanceAfter : null;

  const rows = [];
  if (plan && balanceKnown && plan.goalReachable) {
    rows.push({ key: 'goal', label: plan.needToCompensate > 0 ? 'Para fechar a meta do ciclo' : 'Meta já atingida: jornada completa', exit: plan.goalExit, delta: plan.goalDelta, after: plan.goalBalanceAfter });
  }
  if (plan && (!balanceKnown || plan.needToCompensate > 0)) {
    rows.push({ key: 'full', label: `Jornada completa (${formatMinutes(DAILY_TARGET)})`, exit: plan.fullDayExit, delta: 0, after: balanceKnown ? balance : null });
  }
  if (plan && plan.limitExit !== null) {
    rows.push({ key: 'limit', label: `Máximo com saldo negativo (+${formatMinutes(EXTRA_LIMIT_MINUTES)} extra)`, exit: plan.limitExit, delta: EXTRA_LIMIT_MINUTES, after: balance + EXTRA_LIMIT_MINUTES });
  }
  if (plan?.custom) {
    rows.push({ key: 'custom', label: 'Minha saída', exit: plan.custom.exit, delta: plan.custom.delta, after: balanceKnown ? plan.custom.balanceAfter : null, warn: plan.custom.overLimit });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTAGEM DO DIA</p>
          <h1>Hoje</h1>
          <p className="heading-copy">Informe a hora em que chegou e veja a que horas sair e como fica o saldo.</p>
        </div>
      </div>

      {weekendToday && (
        <div className="rule-alert" role="alert">
          <TriangleAlert size={16} />
          <div><p><strong>Hoje é fim de semana.</strong> A jornada é de segunda a sexta e não dá para compensar nestes dias.</p></div>
        </div>
      )}

      <section className="today-grid" aria-label="Dados de hoje">
        <label className="today-field">
          <span>Cheguei às</span>
          <input type="time" value={saved.entry} onChange={(event) => update({ entry: event.target.value })} />
          <button type="button" className="field-link" onClick={() => update({ entry: nowClock() })}>Usar agora</button>
        </label>
        <label className="today-field">
          <span>Intervalo (minutos)</span>
          <input type="number" min="0" step="5" inputMode="numeric" value={saved.breakMin} onChange={(event) => update({ breakMin: event.target.value === '' ? '' : Number(event.target.value) })} />
          <small>Fica salvo para os próximos dias.</small>
        </label>
        <label className="today-field">
          <span>Saldo do ciclo antes de hoje</span>
          <input type="text" inputMode="text" placeholder={balanceFromImport !== null ? formatMinutes(balanceFromImport, true) : '+1:42 ou -0:36'} value={saved.balanceText} onChange={(event) => update({ balanceText: event.target.value })} />
          <small>
            {saved.balanceText && typedBalance === null ? 'Use o formato +1:42 ou -0:36.' : typedBalance !== null ? 'Usando o valor digitado.' : balanceFromImport !== null ? importNote : unavailableNote}
          </small>
        </label>
        <label className="today-field">
          <span>Se eu sair às (opcional)</span>
          <input type="time" value={saved.exit} onChange={(event) => update({ exit: event.target.value })} />
          <small>{exitInvalid ? 'Horário inválido.' : 'Simula o saldo com a saída que você escolher.'}</small>
        </label>
      </section>

      {!plan ? (
        <section className="today-empty">
          <Clock3 size={22} />
          <strong>Informe a hora de chegada</strong>
          <span>Exemplo: 07:37. Use o botão “Usar agora” se acabou de chegar.</span>
        </section>
      ) : (
        <>
          <section className="metrics today-metrics" aria-label="Resultado de hoje">
            <article className="metric-card metric-balance">
              <div className="metric-top"><span>{balanceKnown ? (plan.needToCompensate > 0 ? 'Sair às, para fechar a meta' : 'Sair às') : 'Sair às (jornada completa)'}</span><span className="metric-symbol"><LogOut size={16} /></span></div>
              <strong>{mainExit === null ? '—' : clock(mainExit)}</strong>
              <p>
                {!balanceKnown
                  ? `Chegando às ${clock(entry)} com ${breakMin} min de intervalo. Informe o saldo para calcular a saída da meta.`
                  : mainExit === null
                    ? 'Hoje não dá para compensar tudo sozinho.'
                    : plan.needToCompensate > 0
                      ? `Trabalhando ${formatMinutes(DAILY_TARGET + plan.goalDelta)} hoje, o saldo fecha em ${formatMinutes(plan.goalBalanceAfter, true)}.`
                      : `Saldo já dentro da meta (${formatMinutes(GOAL_BALANCE)} ou menos). Jornada completa de ${formatMinutes(DAILY_TARGET)}.`}
              </p>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span>Jornada completa</span><span className="metric-symbol"><Clock3 size={16} /></span></div>
              <strong>{clock(plan.fullDayExit)}</strong>
              <p>{formatMinutes(DAILY_TARGET)} + {breakMin} min de intervalo. Saldo não muda.</p>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span>Saldo no total</span><span className="metric-symbol"><Clock3 size={16} /></span></div>
              <strong className={totalAfter !== null && totalAfter > 0 ? 'positive' : ''}>
                {totalAfter === null ? '—' : formatMinutes(totalAfter, true)}
              </strong>
              <p>
                {!balanceKnown
                  ? 'Depende do saldo do ciclo.'
                  : plan.custom
                    ? `Saindo às ${clock(plan.custom.exit)} (${formatMinutes(plan.custom.delta, true)} hoje).`
                    : !plan.goalReachable
                      ? 'Hoje não dá para fechar a meta sozinho. Use “Se eu sair às” para simular.'
                      : `Saindo às ${clock(mainExit)} (${formatMinutes(plan.goalDelta, true)} hoje).`}
              </p>
            </article>
          </section>

          {(plan.limitExit !== null || plan.custom?.overLimit || (balanceKnown && !plan.goalReachable) || perDay !== null) && (
            <div className="rule-alert" role="alert">
              <TriangleAlert size={16} />
              <div>
                {plan.limitExit !== null && (
                  <p><strong>Saldo negativo.</strong> Não é permitido mais de {formatMinutes(EXTRA_LIMIT_MINUTES)} extra por dia: saia até {clock(plan.limitExit)}.</p>
                )}
                {plan.custom?.overLimit && (
                  <p><strong>Saída acima do limite.</strong> Às {clock(plan.custom.exit)} seriam {formatMinutes(plan.custom.delta)} extra com saldo negativo. O máximo é {formatMinutes(EXTRA_LIMIT_MINUTES)}.</p>
                )}
                {balanceKnown && !plan.goalReachable && (
                  <p><strong>Não dá para compensar tudo hoje.</strong> O saldo de {formatMinutes(balance, true)} é maior que a jornada do dia; ainda sobrariam {formatMinutes(plan.leftover)} para outros dias úteis.</p>
                )}
                {perDay !== null && (
                  <p>Para compensar {formatMinutes(plan.needToCompensate)} em {days} dias úteis (contando hoje), saia cerca de {formatMinutes(perDay)} mais cedo por dia.</p>
                )}
              </div>
            </div>
          )}

          <section className="records-section">
            <div className="section-heading records-heading">
              <div>
                <p className="eyebrow">CENÁRIOS</p>
                <h2>Horários de saída</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Cenário</th><th>Sair às</th><th>Hoje</th><th>Saldo no total</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td><strong>{row.label}</strong>{row.warn && <span className="weekday"> acima do limite</span>}</td>
                      <td className="punches">{clock(row.exit)}</td>
                      <td className={row.delta > 0 ? 'positive' : row.delta < 0 ? 'negative' : ''}>{formatMinutes(row.delta, true)}</td>
                      <td>{row.after === null ? '—' : formatMinutes(row.after, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footnote"><TriangleAlert size={14} /><span>Saída = chegada + {formatMinutes(DAILY_TARGET)} de jornada + intervalo, ajustada pelo saldo. O saldo usado é o do ciclo antes de hoje; não conta o dia de hoje duas vezes.</span></div>
          </section>
        </>
      )}
    </>
  );
}
