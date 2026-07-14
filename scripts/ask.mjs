// Read commands over the Academic Projects data source. Read-only; works
// with the anon key.
//
//   node scripts/ask.mjs status                 # all projects + current state
//   node scripts/ask.mjs gaps                   # missing fields per project (the point)
//   node scripts/ask.mjs current-sequence       # what students get TODAY (live PowerPath)
//   node scripts/ask.mjs north-star             # SY 2026-27 Aug-1 changes, ranked
//   node scripts/ask.mjs barriers               # who/what is blocking better outcomes
//   node scripts/ask.mjs stack [subject]        # app-stack matrix (old/now/next)
//   node scripts/ask.mjs stack-changes          # now→next diff per cell
//   node scripts/ask.mjs dictionary             # the data dictionary
//   node scripts/ask.mjs people                 # owners/sponsors roster
//   node scripts/ask.mjs log [slug]             # change history
//   node scripts/ask.mjs project <slug>         # one project, everything

import { rest } from './lib/api.mjs';

const [cmd, arg] = process.argv.slice(2);

const out = (rows) => console.log(JSON.stringify(rows, null, 2));

switch (cmd) {
  case 'status':
    out(await rest('/project_status?select=*&order=subject,grade_min'));
    break;
  case 'gaps':
    out(await rest('/project_gaps?select=*'));
    break;
  case 'north-star': {
    // The Aug-1 answer, ranked. Every project touching the next-year stack,
    // ordered by learning-outcome impact evidence: quantified outcomes first
    // (they made a measurable promise), then Aug-1-committed release dates,
    // then the rest. Each row carries its parent pitch (parent_summary) or
    // names that gap + its owner — the lack of data IS part of the answer.
    const projects = await rest('/project_status?select=*');
    const stackChanges = await rest('/stack_changes?select=*');
    const impactRank = (p) => {
      let r = 0;
      if (p.quantified_outcomes && /\d/.test(p.quantified_outcomes)) r += 2;
      if (p.release_date && p.release_date <= '2026-08-01') r += 1;
      return r;
    };
    const ranked = projects
      .map((p) => ({
        // FIRST requirement: how it reads to a parent leads the entry.
        parent_pitch: p.parent_summary ?? '(gap — no parent summary yet; owner: ' + (p.owner ?? 'UNCLAIMED') + ')',
        slug: p.slug, name: p.name, subject: p.subject,
        grades: `${p.grade_min}-${p.grade_max}`,
        owner: p.owner, sponsor: p.sponsor,
        replaces: p.replaces,
        release_date: p.release_date,
        on_track_for_aug1: p.release_date ? p.release_date <= '2026-08-01' : null,
        current_state: p.current_state ?? 'no approvals yet',
        quantified_outcomes: p.quantified_outcomes ?? '(gap — impact not quantified; owner: ' + (p.owner ?? 'UNCLAIMED') + ')',
        impact_rank: impactRank(p),
      }))
      .sort((a, b) => b.impact_rank - a.impact_rank || a.subject?.localeCompare(b.subject ?? '') || 0);
    out({
      question: 'What are the changes to the course sequence for the 2026-2027 school year ready for students on August 1st?',
      first_requirement: 'Each project must read very simply for parents who do not know internal details — parent_pitch leads every entry; a missing pitch fails the AI plan review.',
      how_ranked: 'impact_rank: +2 quantified learning-outcome promise on file, +1 release date committed <= Aug 1. Ties by subject. Gaps are named, not hidden.',
      coverage_note: 'per_cell_stack_changes currently covers Math only — other subjects\' next-year cell matrices are an open gap (see improvements queue).',
      projects: ranked,
      per_cell_stack_changes: stackChanges,
    });
    break;
  }
  case 'current-sequence': {
    // What students get TODAY: the live PowerPath sequence (courses,
    // mastery gates, hole-filling apps) served by the production dashboard.
    const r = await fetch('https://timeback-loops-k8.vercel.app/api/course-sequence');
    if (!r.ok) throw new Error(`course-sequence API ${r.status}`);
    const seq = await r.json();
    out({
      grade_legend: 'grades are strings: "-1" = PreK, "0" = K, "1".."12" = G1..G12',
      gate_note: 'MasteryTrack (=AlphaTest) assessments are the mastery gates; the app-stack "now" era names the same gates by test family (Alpha Standardized K-2, STAAR G3-8). Pass = score >= 89.5 (displayed 90%).',
      ...seq,
    });
    break;
  }
  case 'barriers': {
    // Who/what is blocking better learning outcomes by Aug 1: per project,
    // the approval stages still pending (with how long the project has sat),
    // the owner on the hook, and their stated bottleneck.
    const projects = await rest('/project_status?select=*');
    const approvals = await rest('/approvals?select=project_id,stage,status,decided_by,decided_at');
    const byProject = new Map();
    for (const a of approvals) {
      if (!byProject.has(a.project_id)) byProject.set(a.project_id, []);
      byProject.get(a.project_id).push(a);
    }
    const STAGE_ORDER = ['plan_approved_by_ai', 'approved_by_learning_science', 'ready_for_students', 'approved_by_andy', 'approved_by_campus_dris', 'approved_by_guides'];
    const rows = projects.map((p) => {
      const appr = byProject.get(p.id) ?? [];
      const pending = STAGE_ORDER.filter((s) => (appr.find((a) => a.stage === s)?.status ?? 'pending') === 'pending');
      const rejected = appr.filter((a) => a.status === 'rejected').map((a) => `${a.stage} (by ${a.decided_by})`);
      const nextStage = pending[0] ?? null;
      // Who moves the next stage: AI plan → owner submits a complete plan;
      // LS → sponsor; owner-ready → owner; then Andy / campus DRIs / guides.
      const mover = nextStage === 'plan_approved_by_ai' ? (p.owner ?? 'UNCLAIMED (no owner)')
        : nextStage === 'approved_by_learning_science' ? (p.sponsor ?? `sponsor UNASSIGNED (owner: ${p.owner ?? 'UNCLAIMED'})`)
        : nextStage === 'ready_for_students' ? (p.owner ?? 'UNCLAIMED')
        : nextStage === 'approved_by_andy' ? 'Andy'
        : nextStage === 'approved_by_campus_dris' ? 'campus DRIs'
        : nextStage === 'approved_by_guides' ? 'guides' : null;
      return {
        slug: p.slug, name: p.name, subject: p.subject,
        owner: p.owner ?? 'UNCLAIMED', sponsor: p.sponsor ?? 'UNASSIGNED',
        stages_approved: p.stages_approved, stages_pending: pending.length,
        next_stage: nextStage, stuck_on: mover,
        rejected_stages: rejected.length ? rejected : undefined,
        stated_bottleneck: p.bottleneck ?? '(gap — bottleneck question unanswered)',
        release_date: p.release_date ?? '(gap — no committed date)',
        notes: p.notes ?? undefined,
      };
    }).sort((a, b) => a.stages_approved - b.stages_approved);
    out({
      question: 'What are the biggest barriers to better learning outcomes by Aug 1 — who is struggling to get through the approvals?',
      reading: 'Everything below next_stage is waiting on stuck_on. UNCLAIMED owner or UNASSIGNED sponsor is itself the barrier. stated_bottleneck is the owner’s own magic-wand answer.',
      projects: rows,
    });
    break;
  }
  case 'stack':
    out(await rest(`/app_stack?select=*${arg ? `&subject=eq.${encodeURIComponent(arg)}` : ''}&order=subject,grade,era,role`));
    break;
  case 'stack-changes':
    out(await rest('/stack_changes?select=*'));
    break;
  case 'dictionary':
    out(await rest('/data_dictionary?select=*&order=table_name,column_name'));
    break;
  case 'brainlift':
    out(await rest('/brainlift?select=ord,insight,source&order=ord'));
    break;
  case 'improvements':
    out(await rest('/improvement_requests?select=*&order=status,stack_rank.nullslast,created_at'));
    break;
  case 'people':
    out(await rest('/people?select=name,email,team,notes&order=team,name'));
    break;
  case 'log': {
    const filter = arg
      ? `&row_id=eq.${encodeURIComponent((await rest(`/projects?slug=eq.${arg}&select=id`))[0]?.id ?? '')}`
      : '';
    out(await rest(`/change_log?select=*&order=changed_at.desc&limit=100${filter}`));
    break;
  }
  case 'project': {
    if (!arg) { console.error('usage: ask.mjs project <slug>'); process.exit(1); }
    const [proj] = await rest(`/project_status?slug=eq.${arg}&select=*`);
    if (!proj) { console.error(`no project ${arg}`); process.exit(1); }
    proj.approvals = await rest(`/approvals?project_id=eq.${proj.id}&select=stage,status,decided_by,decided_at,notes`);
    out(proj);
    break;
  }
  default:
    console.error('commands: status | gaps | current-sequence | north-star | barriers | stack [subject] | stack-changes | dictionary | brainlift | improvements | people | log [slug] | project <slug>');
    process.exit(1);
}
