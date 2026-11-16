export function formatMinutes(value, signed = false) {
  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  const absolute = Math.abs(Math.round(value));
  return `${sign}${Math.floor(absolute / 60)}h${String(absolute % 60).padStart(2, '0')}`;
}
