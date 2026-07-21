// THE grade mapping (review finding 2026-07-21: six inline copies had
// drifted — PK projects rendered as "G-1"). PK = -1, K = 0, G1..G12 = 1..12.
export function parseGrade(raw) {
  const t = String(raw ?? '').trim().toUpperCase().replace(/^G/, '');
  if (t === 'PK' || t === 'PREK' || t === 'PRE-K' || t === 'PR') return -1;
  if (t === 'K' || t === 'KG') return 0;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export function gradeLabel(g) {
  const n = Number(g);
  if (n === -1) return 'PK';
  if (n === 0) return 'K';
  return `G${n}`;
}

export function gradeRangeLabel(min, max) {
  if (min == null || max == null) return '?';
  return min === max ? gradeLabel(min) : `${gradeLabel(min)}–${gradeLabel(max)}`;
}
