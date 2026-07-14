// Plan score + feedback per project — the deterministic core of "an AI can
// read the data and give the plan a score and feedback to make it meet the
// approved-plan milestone." An agent should run this, then add judgment on
// top (is the outcomes claim actually quantified and falsifiable? is the
// release date credible given the bottleneck?).
//
//   node scripts/score.mjs [slug]
//
// Rubric: a plan is APPROVABLE when every dictionary field is filled AND the
// quantified_outcomes field contains a number (a claim you can't measure is
// not quantified). Score = filled required fields / total, with the gap list
// as the feedback. Read-only; works with the anon key.

import { rest } from './lib/api.mjs';

const REQUIRED = [
  'standards_covered', 'passes_test', 'entry_gate', 'xp_hours', 'effective_for',
  'owner', 'sponsor', 'subject', 'grade_min', 'grade_max',
  'main_course_sequence', 'needs_supplements', 'deliverable', 'hole_filling',
  'replaces', 'quantified_outcomes', 'xp', 'parent_summary',
  'release_date', 'bottleneck',
];

const slug = process.argv[2];
const rows = await rest(`/project_status?select=*${slug ? `&slug=eq.${slug}` : ''}&order=subject`);
if (!rows.length) { console.error(slug ? `no project ${slug}` : 'no projects'); process.exit(1); }

const report = rows.map((p) => {
  const missing = REQUIRED.filter((f) => p[f] === null || p[f] === undefined || p[f] === '');
  const hasNumber = /\d/.test(p.quantified_outcomes ?? '');
  const feedback = [];
  if (missing.length) feedback.push(`Fill in: ${missing.join(', ')}.`);
  if (!missing.includes('quantified_outcomes') && !hasNumber) {
    feedback.push('quantified_outcomes has no number in it — state the measurable delta vs what it replaces (score, or hours to EOG mastery-gate pass).');
  }
  if (!missing.length && hasNumber) feedback.push('Plan is complete — ready for the plan_approved_by_ai stage.');
  const score = Math.round(((REQUIRED.length - missing.length) / REQUIRED.length) * 100);
  return {
    slug: p.slug, name: p.name, owner: p.owner, sponsor: p.sponsor,
    score, current_state: p.current_state ?? 'none',
    missing, feedback: feedback.join(' '),
  };
});
console.log(JSON.stringify(report, null, 2));
