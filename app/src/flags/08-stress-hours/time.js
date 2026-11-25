// #8 (UI audit flag): h:mm:ss for times past an hour. `digits` is how many
// decimals the seconds keep (the deck shows tenths). Signed like the deck's
// remaining time, with a true minus.
export function hms(s, digits = 0) {
  const sign = s < 0 ? '−' : '';
  s = Math.abs(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = digits ? (s % 60).toFixed(digits).padStart(3 + digits, '0') : String(Math.floor(s % 60)).padStart(2, '0');
  return `${sign}${h}:${String(m).padStart(2, '0')}:${sec}`;
}
