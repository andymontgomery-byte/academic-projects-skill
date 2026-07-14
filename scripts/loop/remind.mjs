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
const gapsOf = (slug) => board.gaps.find((g) => g.slug === slug)?.missing_fields ?? [];

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

function projectBlock(p) {
  const gaps = gapsOf(p.slug);
  const { stage, mover } = nextStage(p);
  return [
    `▸ ${p.name} (${p.subject ?? '?'} ${p.grade_min != null ? `G${p.grade_min}-G${p.grade_max}` : ''})`,
    `  missing data: ${gaps.length ? gaps.join(', ') : 'none — complete'}`,
    `  next approval: ${stage ?? 'all approved'}${mover ? ` — moves when ${mover} acts` : ''}`,
    `  release date: ${p.release_date ?? 'NOT COMMITTED'}`,
    `  bottleneck: ${p.bottleneck ?? 'unanswered'}`,
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
      subject: '[Academic Projects] Your daily check: is your project data right?',
      body: `${who} — your Academic Projects as the data source sees them today:\n\n`
        + projects.map(projectBlock).join('\n\n')
        + `\n\nFix anything wrong here (attributed, one click per field): ${UI}`,
    });
  }
  const open = (board.improvements ?? []).filter((r) => r.status === 'open');
  const noDate = board.status.filter((p) => !p.release_date).map((p) => `${p.name} (${p.owner ?? 'UNCLAIMED'})`);
  sections.push({
    to: 'andy.montgomery@alpha.school', cc: null,
    subject: '[Academic Projects] Daily ops digest',
    body: `Board: ${board.status.length} projects · ${board.gaps.reduce((n, g) => n + g.missing_fields.length, 0)} missing fields total\n\n`
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
