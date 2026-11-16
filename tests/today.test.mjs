import test from 'node:test';
import assert from 'node:assert/strict';
import { clock, parseClock, parseSignedMinutes, planToday } from '../src/today.js';

const t = (text) => parseClock(text);

test('parseClock e clock', () => {
  assert.equal(t('07:37'), 457);
  assert.equal(t('7:37'), 457);
  assert.equal(t('7h37'), 457);
  assert.equal(t('24:00'), null);
  assert.equal(t(''), null);
  assert.equal(clock(457), '07:37');
  assert.equal(clock(1045), '17:25');
  assert.equal(clock(1440 + 30), '00:30');
});

test('parseSignedMinutes aceita sinais e formatos', () => {
  assert.equal(parseSignedMinutes('+1:42'), 102);
  assert.equal(parseSignedMinutes('1h42'), 102);
  assert.equal(parseSignedMinutes('-0:36'), -36);
  assert.equal(parseSignedMinutes('−0h36'), -36);
  assert.equal(parseSignedMinutes(''), null);
  assert.equal(parseSignedMinutes('abc'), null);
});

test('chegou 07:37, saldo +1h42: jornada completa 17:25 e saída para a meta 15:38', () => {
  const plan = planToday({ entry: t('07:37'), breakMin: 60, balance: 102 });
  assert.equal(clock(plan.fullDayExit), '17:25');
  assert.equal(clock(plan.goalExit), '15:38'); // trabalha 7h01 (8h48 - 1h47)
  assert.equal(plan.goalDelta, -107);
  assert.equal(plan.goalBalanceAfter, -5);
  assert.equal(plan.goalReachable, true);
  assert.equal(plan.limitExit, null); // saldo positivo: sem limite de extra
});

test('saldo já dentro da meta: recomenda jornada completa e informa o limite de 1h extra', () => {
  const plan = planToday({ entry: t('08:00'), breakMin: 60, balance: -36 });
  assert.equal(clock(plan.goalExit), '17:48');
  assert.equal(plan.goalDelta, 0);
  assert.equal(plan.goalBalanceAfter, -36);
  assert.equal(clock(plan.limitExit), '18:48'); // 17:48 + 1h
});

test('saldo grande demais para compensar só hoje', () => {
  const plan = planToday({ entry: t('08:00'), breakMin: 60, balance: 700 });
  assert.equal(plan.goalReachable, false);
  assert.equal(plan.goalExit, null);
  assert.equal(plan.leftover, 700 + 5 - 528); // 177 min ficam para outros dias
});

test('saída escolhida: delta e saldo no total', () => {
  const plan = planToday({ entry: t('07:37'), breakMin: 60, balance: 102, exit: t('17:25') });
  assert.equal(plan.custom.delta, 0);
  assert.equal(plan.custom.balanceAfter, 102);
  const early = planToday({ entry: t('07:37'), breakMin: 60, balance: 102, exit: t('16:00') });
  assert.equal(early.custom.delta, -85);
  assert.equal(early.custom.balanceAfter, 17);
});

test('saída escolhida com saldo negativo e mais de 1h extra é sinalizada', () => {
  const over = planToday({ entry: t('08:00'), breakMin: 60, balance: -36, exit: t('19:00') });
  assert.equal(over.custom.delta, 72);
  assert.equal(over.custom.overLimit, true);
  const ok = planToday({ entry: t('08:00'), breakMin: 60, balance: -36, exit: t('18:48') });
  assert.equal(ok.custom.overLimit, false); // exatamente 1h extra é permitido
});

test('saída antes de terminar o intervalo é ignorada', () => {
  const plan = planToday({ entry: t('08:00'), breakMin: 60, balance: 0, exit: t('08:30') });
  assert.equal(plan.custom, null);
});
