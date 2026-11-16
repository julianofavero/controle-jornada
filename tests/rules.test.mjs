import test from 'node:test';
import assert from 'node:assert/strict';
import { markExtraOverLimit } from '../src/rules.js';

const day = (date, delta, kind = 'worked') => ({ date, result: { kind, delta } });
const flags = (rows) => markExtraOverLimit(rows).map((row) => row.overLimit);

test('saldo negativo + mais de 1h extra no dia = acima do limite', () => {
  // 1º dia: -48 (saldo passa a negativo). 2º dia: +90 com saldo negativo antes -> acima do limite.
  assert.deepEqual(flags([day('2026-10-19', -48), day('2026-10-20', 90)]), [false, true]);
});

test('exatamente 1h extra é permitido', () => {
  assert.deepEqual(flags([day('2026-10-19', -48), day('2026-10-20', 60)]), [false, false]);
});

test('com saldo zero ou positivo não há limite', () => {
  assert.deepEqual(flags([day('2026-10-19', 30), day('2026-10-20', 120)]), [false, false]);
  assert.deepEqual(flags([day('2026-10-19', 120)]), [false]);
});

test('o saldo conta o dia anterior, não o próprio dia', () => {
  // saldo antes do 2º dia é +30: sem limite, mesmo que o 2º dia termine positivo e o 3º tenha +90
  assert.deepEqual(flags([day('2026-10-19', 30), day('2026-10-20', -100), day('2026-10-21', 90)]), [false, false, true]);
});

test('o saldo volta a positivo e o limite deixa de valer', () => {
  assert.deepEqual(flags([day('2026-10-19', -30), day('2026-10-20', 60), day('2026-10-21', 90)]), [false, false, false]);
});

test('folgas e dias incompletos não entram na conta', () => {
  const rows = [day('2026-10-19', -48), day('2026-10-20', 0, 'off'), day('2026-10-21', 0, 'incomplete'), day('2026-10-22', 75)];
  assert.deepEqual(flags(rows), [false, false, false, true]);
});
