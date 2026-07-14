// Peter's Language Hole-Filling project, from his live status board
// (spec seed "something from peter for language hole-filling", 2026-07-14):
// http://langhf-status-063718566796.s3-website-us-east-1.amazonaws.com/
// The board reads TimeBack live; numbers below are its 2026-07-13 snapshot —
// re-run to refresh the notes, or read the board for current counts.

import { rest, rpc } from '../lib/api.mjs';

const BOARD = 'http://langhf-status-063718566796.s3-website-us-east-1.amazonaws.com/';
const CHANGED_BY = process.env.SEED_CHANGED_BY ?? 'seed-import (langhf board)';

const html = await (await fetch(BOARD)).text();
const a = html.indexOf('DATA:BEGIN');
const b = html.indexOf('DATA:END');
if (a < 0 || b < 0) throw new Error('DATA block missing on the status board');
const d = JSON.parse(html.substring(a + 10, b).trim());
const totals = Object.fromEntries(d.totals);

const fields = {
  slug: 'language-hole-filling',
  name: 'Language Hole-Filling G3-12',
  owner: 'Peter Bates',
  subject: 'Language',
  grade_min: 3,
  grade_max: 12,
  deliverable: 'course',
  main_course_sequence: 'The 10 Grade 3-12 Language: Hole-Filling courses (G3LANGHF…G12LANGHF), instruction cards + powerpath-100 practice banks in TimeBack.',
  hole_filling: 'This project IS the hole-filling layer for Language G3-12.',
  replaces: 'Current Language hole-filling stages in the PowerPath sequence — see https://timeback-loops-k8.vercel.app/course-sequence',
  notes: `Status board (live TimeBack read): ${BOARD} — as of ${d.generatedAt}: ${totals['Courses']} courses BUILT and active, publishStatus=testing (not yet live to students); ${totals['Units']} units, ${totals['Instruction cards']} instruction cards, ${totals['Practice banks']} practice banks, ${totals['Practice items']} practice items (MCQs).`,
};

const existing = new Set((await rest('/projects?select=slug')).map((p) => p.slug));
if (existing.has(fields.slug)) {
  const { slug, ...rest_ } = fields;
  console.log('language-hole-filling exists — refreshing fields');
  console.log(await rpc('update_project', { p_slug: slug, fields: rest_, p_changed_by: CHANGED_BY }));
} else {
  console.log(await rpc('create_project', { fields, p_changed_by: CHANGED_BY }));
}
