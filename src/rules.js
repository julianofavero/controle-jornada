// Regra da empresa: com o saldo de horas negativo, não se pode fazer mais de 1h extra por dia.
export const EXTRA_LIMIT_MINUTES = 60;

/**
 * rows: dias do ciclo em ordem cronológica, cada um com { date, result: { kind, delta } }.
 * Marca `overLimit` no dia em que o saldo acumulado ANTES dele já era negativo
 * e o extra do dia passou de 1h. Só dias trabalhados e completos entram na conta.
 */
export function markExtraOverLimit(rows) {
  let running = 0;
  return rows.map((row) => {
    if (row.result.kind !== 'worked') return { ...row, overLimit: false };
    const overLimit = running < 0 && row.result.delta > EXTRA_LIMIT_MINUTES;
    running += row.result.delta;
    return { ...row, overLimit };
  });
}
