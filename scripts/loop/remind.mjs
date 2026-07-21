// The reminder engine — deterministic, no AI, no keys. Reads the public
// gateway and composes the notification payload the loops deliver:
//   node scripts/loop/remind.mjs digest         # full daily: one section per person
//   node scripts/loop/remind.mjs changes [mins] # state changes in the last N minutes (default 75)
// Output is JSON: { sections: [{to, cc, subject, body}], summary }.
// Delivery is the caller's job (Gmail drafts locally; GitHub issue +
// Workflowy node from Actions). Keeping compose separate from delivery is
// what lets every rail carry identical content.

const GATEWAY = 'https://timeback-loops-k8.vercel.app/api/academic-projects';
const UI = 'https://timeback-loops-k8.vercel.app/academic-projects';
const STAGES = ['plan_approved_by_ai', 'approved_by_learning_science', 'ready_for_students', 'approved_by_andy', 'approved_by_campus_dris', 'approved_by_guides'];

const mode = process.argv[2] ?? 'digest';
const mins = Number(process.argv[3] ?? 75);
const since = new Date(Date.now() - mins * 60_000).toISOString();

const board = await (await fetch(`${GATEWAY}?since=${encodeURIComponent(since)}`)).json();
const byId = new Map(board.status.map((p) => [p.id, p]));
const emailOf = (name) => board.people.find((x) => x.name === name)?.email ?? null;

function nextStage(p) {
  const appr = board.approvals.filter((a) => a.project_id === p.id);
  const pending = STAGES.filter((s) => (appr.find((a) => a.stage === s)?.status ?? 'pending') === 'pending');
  const stage = pending[0] ?? null;
  const mover = stage === 'plan_approved_by_ai' || stage === 'ready_for_students' ? (p.owner ?? 'UNCLAIMED')
    : stage === 'approved_by_learning_science' ? (p.sponsor ?? 'sponsor UNASSIGNED')
    : stage === 'approved_by_andy' ? 'Andy'
    : stage === 'approved_by_campus_dris' ? 'campus DRIs'
    : stage === 'approved_by_guides' ? 'guides' : null;
  return { stage, mover };
}

// BrainLift-as-the-form (Andy 2026-07-16): the owner has ONE action — keep
// the BrainLift (and GitHub repo) linked and answering the required
// questions. AI fills the form fields from those sources; these lines tell
// the owner exactly what the sources still don't answer.
const QUESTION_LABELS = {
  parent_summary: 'the parent summary (plain language, no jargon)',
  q1_subject_grades: 'Q1 — subject + grade range',
  q2_standards: 'Q2 — 3rd-party standards covered AND not covered',
  q3_passes_test: 'Q3 — test passed at what threshold, vs what it replaces',
  q4_entry_gate: 'Q4 — entry mastery gate + threshold',
  q5_xp_hours: 'Q5 — XP hours (median/knows-all/knows-nothing), XP/min, farmability',
  q6_effective_for: 'Q6 — effective for whom (named students + 2-week hypotheses)',
};

function oneAction(p) {
  if (!(p.brainlift_urls ?? []).length) {
    return [`  ► ONE ACTION: link your BrainLift (and GitHub repo) — AI fills the whole form from them: ${UI}`];
  }
  const cov = p.source_coverage?.questions;
  if (!cov) return ['  sources linked — AI assessment pending, nothing for you to do yet'];
  const open = Object.entries(cov).filter(([, q]) => q?.verdict !== 'answered');
  if (!open.length) return ['  your BrainLift answers every question — nothing to edit'];
  return [
    '  ► ONE ACTION — edit your BrainLift so it answers:',
    ...open.map(([k, q]) => `    · ${QUESTION_LABELS[k] ?? k}: ${q?.ask ?? 'not found in the linked sources'}`),
  ];
}

function projectBlock(p) {
  const { stage, mover } = nextStage(p);
  return [
    `▸ ${p.name} (${p.subject ?? '?'} ${p.grade_min != null ? gradeRangeLabel(p.grade_min, p.grade_max) : ''})`,
    ...oneAction(p),
    `  next approval: ${stage ?? 'all approved'}${mover ? ` — moves when ${mover} acts` : ''}`,
    `  release date: ${p.release_date ?? 'NOT COMMITTED — state it in your BrainLift'}`,
    `  bottleneck: ${p.bottleneck ?? 'unanswered — state it in your BrainLift'}`,
  ].join('\n');
}

const sections = [];

if (mode === 'changes') {
  // Excluded actors: seed imports, the loop itself, schema migrations
  // (stamped 'migration:'), and 'unknown' (only raw maintenance SQL bypasses
  // the attributed RPCs — never an owner-relevant change).
  const qualifying = (board.changes ?? []).filter((c) => {
    const by = String(c.changed_by ?? 'unknown');
    return !by.startsWith('seed-import') && !by.startsWith('migration:')
      && by !== 'academic-projects-loop' && by !== 'unknown';
  });
  const byProject = new Map();
  for (const c of qualifying) {
    const p = byId.get(c.row_id);
    if (!p) continue;
    if (!byProject.has(p.slug)) byProject.set(p.slug, []);
    byProject.get(p.slug).push(c);
  }
  for (const [slug, changes] of byProject) {
    const p = board.status.find((x) => x.slug === slug);
    const to = emailOf(p.owner);
    if (!to) continue;
    sections.push({
      to, cc: emailOf(p.sponsor),
      subject: `[Academic Projects] ${p.name} changed — is the data right?`,
      body: `${p.name} changed in the Academic Projects data source:\n\n`
        + changes.map((c) => `  ${c.field}: ${c.old_value ?? '(empty)'} → ${c.new_value ?? '(empty)'} — by ${c.changed_by}, ${c.changed_at}`).join('\n')
        + `\n\nReview and fix here: ${UI}\nReply to this thread if something is wrong.`,
    });
  }
} else {
  const involving = new Map(); // person name → projects
  for (const p of board.status) {
    for (const who of [p.owner, p.sponsor]) {
      if (!who) continue;
      if (!involving.has(who)) involving.set(who, []);
      involving.get(who).push(p);
    }
  }
  for (const [who, projects] of involving) {
    const to = emailOf(who);
    if (!to) continue;
    sections.push({
      to, cc: null,
      subject: '[Academic Projects] One action: does your BrainLift answer the questions?',
      body: `${who} — your projects, and what your linked BrainLift/repo still don't answer. `
        + `You don't fill forms anymore: AI fills every field from your BrainLift and GitHub repo. `
        + `Your one job is keeping those sources linked and answering the questions.\n\n`
        + projects.map(projectBlock).join('\n\n')
        + `\n\nLinks + coverage live here: ${UI}`,
    });
  }
  const open = (board.improvements ?? []).filter((r) => r.status === 'open');
  const noDate = board.status.filter((p) => !p.release_date).map((p) => `${p.name} (${p.owner ?? 'UNCLAIMED'})`);
  const noSources = board.status.filter((p) => !(p.brainlift_urls ?? []).length).map((p) => `${p.name} (${p.owner ?? 'UNCLAIMED'})`);
  const unassessed = board.status.filter((p) => (p.brainlift_urls ?? []).length && !p.source_coverage).map((p) => p.name);
  sections.push({
    to: 'andy.montgomery@alpha.school', cc: null,
    subject: '[Academic Projects] Daily ops digest',
    body: `Board: ${board.status.length} projects · ${board.gaps.reduce((n, g) => n + g.missing_fields.length, 0)} missing fields total\n\n`
      + `No BrainLift linked (${noSources.length}): ${noSources.join('; ') || 'none'}\n`
      + `Sources linked, AI assessment pending (${unassessed.length}): ${unassessed.join('; ') || 'none'}\n\n`
      + `No committed release date: ${noDate.length ? noDate.join('; ') : 'none'}\n\n`
      + `Open improvement requests (${open.length}):\n${open.map((r) => `  - ${r.request.slice(0, 140)} (by ${r.requested_by})`).join('\n') || '  none'}\n\n`
      + `UI: ${UI}`,
  });
}

console.log(JSON.stringify({
  mode, since: mode === 'changes' ? since : null,
  sections,
  summary: `${sections.length} notification(s) composed`,
}, null, 2));
