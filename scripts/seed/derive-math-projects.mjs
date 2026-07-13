// Projects implied by the Math app-stack next era (screenshot 2026-07-13),
// plus Andy's ruling that Blu Math IS SuperBuilders Incept (Liwei). Derived
// rows start with null owners/sponsors on purpose — unclaimed work is a gap
// to publish, not a blank to guess. Idempotent on slug.

import { rest, rpc } from '../lib/api.mjs';

const ANDY = 'andy.montgomery@alpha.school';
const DERIVED = 'seed-import (math app-stack)';

// 1. Blu Math = SuperBuilders Incept (Andy, 2026-07-13)
await rpc('update_project', {
  p_slug: 'superbuilders-incept',
  fields: {
    main_course_sequence: 'Ships as "Blu Math" — the next-year Math base for G3-5 (already the now-era base at G4). Owners-sheet note says Grades 3-8 Math incl. mastery gates ~10 questions.',
    replaces: 'Zearn G3 base, Math Academy G5 base (G4 already on Blu Math) — see app_stack + https://timeback-loops-k8.vercel.app/course-sequence',
  },
  p_changed_by: ANDY,
});
console.log('superbuilders-incept: linked to Blu Math (per Andy)');

const NEW_PROJECTS = [
  {
    slug: 'math-quest',
    name: 'Math Quest',
    subject: 'Math', grade_min: 0, grade_max: 2,
    main_course_sequence: 'Next-year Math base for K-2: Math Quest K / 1 / 2.',
    replaces: 'Zearn G1-2 base (K is already on Math Quest in production).',
    notes: 'Derived from the Math app-stack next era; owner unclaimed in the data source.',
  },
  {
    slug: 'timeback-math',
    name: 'TimeBack Math (hole-filling)',
    subject: 'Math', grade_min: 0, grade_max: 8,
    main_course_sequence: 'Next-year Math hole-filling K-8: TimeBack Math K…8, grade-aligned.',
    replaces: 'Now-era hole-filling: TimeBack Math off-by-one at K-4, Math Academy HF at G5-8 (old era: Freckle/Edia).',
    notes: 'Derived from the Math app-stack next era; owner unclaimed in the data source.',
  },
  {
    slug: 'alpha-ccss-tests',
    name: 'Alpha CCSS Grade Tests',
    subject: 'Math', grade_min: 0, grade_max: 8,
    main_course_sequence: 'Next-year Math mastery gates: Alpha CCSS Grade K-8.',
    replaces: 'Alpha Standardized K-2 and STAAR G3-8 gates.',
    notes: 'Derived from the Math app-stack next era. Possibly the SuperBuilders Incept mastery-gate work (owners-sheet note: initial gate ~10 questions vs 3-5) — owner to confirm.',
  },
  {
    slug: 'state-supplements',
    name: 'State Supplements + Tests',
    subject: 'Math', grade_min: 0, grade_max: 8,
    main_course_sequence: 'Next-year: State Supplement K-8 plus State Supplement Test K-8 added alongside the CCSS base.',
    replaces: 'Math Cakes → TEKS supplements (G2-4) and TEKS supplements (G5-8).',
    notes: 'Derived from the Math app-stack next era; owner unclaimed in the data source.',
  },
];

const existing = new Set((await rest('/projects?select=slug')).map((p) => p.slug));
for (const p of NEW_PROJECTS) {
  if (existing.has(p.slug)) { console.log(`${p.slug}: exists, skipped`); continue; }
  await rpc('create_project', { fields: p, p_changed_by: DERIVED });
  console.log(`${p.slug}: created`);
}

// 2. Link next-era stack cells to their delivering projects.
const LINKS = [
  { role: 'base', grades: [3, 4, 5], slug: 'superbuilders-incept', app: 'Blu Math' },
  { role: 'base', grades: [0, 1, 2], slug: 'math-quest', app: (g) => `Math Quest ${g === 0 ? 'K' : g}` },
  { role: 'hole_filling', grades: [0, 1, 2, 3, 4, 5, 6, 7, 8], slug: 'timeback-math', app: (g) => `TimeBack Math ${g === 0 ? 'K' : g}` },
  { role: 'test', grades: [0, 1, 2, 3, 4, 5, 6, 7, 8], slug: 'alpha-ccss-tests', app: (g) => `Alpha CCSS Grade ${g === 0 ? 'K' : g}` },
  { role: 'supplement', grades: [0, 1, 2, 3, 4, 5, 6, 7, 8], slug: 'state-supplements', app: (g) => `State Supplement ${g === 0 ? 'K' : g}` },
  { role: 'supplement_test', grades: [0, 1, 2, 3, 4, 5, 6, 7, 8], slug: 'state-supplements', app: (g) => `State Supplement Test ${g === 0 ? 'K' : g}` },
];
let linked = 0;
for (const l of LINKS) {
  for (const g of l.grades) {
    await rpc('set_stack_cell', {
      p_subject: 'Math', p_grade: g, p_era: 'next', p_role: l.role,
      p_app: typeof l.app === 'function' ? l.app(g) : l.app,
      p_detail: null, p_project_slug: l.slug,
      p_source: 'math-sheet screenshot 2026-07-13', p_changed_by: DERIVED,
    });
    linked++;
  }
}
console.log(`app_stack: ${linked} next-era cells linked to projects`);
