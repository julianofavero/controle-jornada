// Cálculos da aba "Hoje": a que horas sair e como fica o saldo.
// Tudo em minutos. Horários do dia são minutos desde 00:00.
import { EXTRA_LIMIT_MINUTES } from './rules.js';

export const DAILY_TARGET = 8 * 60 + 48; // jornada de 8h48 sem o intervalo
export const GOAL_BALANCE = -5; // meta do ciclo: fechar em −5 min ou menos
export const DEFAULT_BREAK = 60;

// "07:37", "7:37" ou "7h37" -> 457. Devolve null se não for um horário.
export function parseClock(text) {
  const match = String(text ?? '').trim().match(/^(\d{1,2})\s*[:h]\s*(\d{2})$/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

// "+1:42", "-0:36", "−0h36", "1h42" -> minutos com sinal. Vazio ou inválido -> null.
export function parseSignedMinutes(text) {
  const match = String(text ?? '').trim().replace('−', '-').match(/^([+-])?\s*(\d{1,3})\s*[:h]\s*(\d{2})$/i);
  if (!match) return null;
  const total = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -total : total;
}

export function clock(minutes) {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * entry: chegada; breakMin: intervalo em minutos; balance: saldo do ciclo ANTES de hoje;
 * exit: saída escolhida pelo usuário (opcional).
 */
export function planToday({ entry, breakMin, balance, exit = null, target = DAILY_TARGET, goal = GOAL_BALANCE, extraLimit = EXTRA_LIMIT_MINUTES }) {
  const lunch = Math.max(0, breakMin);
  const exitFor = (workedMinutes) => entry + lunch + workedMinutes;
  const deltaFor = (exitTime) => exitTime - entry - lunch - target;

  const fullDayExit = exitFor(target);
  // Saída máxima com saldo negativo: no máximo 1h extra no dia.
  const limitExit = balance < 0 ? exitFor(target + extraLimit) : null;

  // Para fechar o ciclo em −5 min ou menos: se o saldo ainda está acima da meta, compensa hoje.
  const needToCompensate = Math.max(0, balance - goal);
  const workedNeeded = target - needToCompensate;
  const goalReachable = workedNeeded > 0;
  const goalExit = needToCompensate === 0 ? fullDayExit : goalReachable ? exitFor(workedNeeded) : null;
  const goalDelta = needToCompensate === 0 ? 0 : -needToCompensate;
  // Quanto sobra para compensar em outros dias quando hoje não dá conta sozinho.
  const leftover = goalReachable ? 0 : needToCompensate - target;

  let custom = null;
  if (exit !== null && exit > entry + lunch) {
    const delta = deltaFor(exit);
    custom = { exit, delta, balanceAfter: balance + delta, overLimit: balance < 0 && delta > extraLimit };
  }

  return {
    fullDayExit,
    limitExit,
    needToCompensate,
    goalExit,
    goalDelta,
    goalBalanceAfter: balance + goalDelta,
    goalReachable,
    leftover,
    custom,
  };
}
