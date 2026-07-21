// Write commands. Requires the write (service_role) key and --as <who> so
// every change is attributed in change_log. Owners and sponsors fix their
// own data — that is the design; no project managers chasing answers.
//
//   node scripts/update.mjs create --as <who> --json '{"slug":"...","name":"...", ...}'
//   node scripts/update.mjs set <slug> --as <who> --json '{"release_date":"2026-08-01"}'
//   node scripts/update.mjs decide <slug> <stage> <approved|rejected|pending> --as <who> [--notes "..."]
//   node scripts/update.mjs person --as <who> --name "..." [--email ...] [--team academics|learning-science|superbuilders|other]

import { rpc } from './lib/api.mjs';
import { parseGrade } from './lib/grades.mjs';

const args = process.argv.slice(2);
const cmd = args[0];

function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const changedBy = flag('as');
if (!changedBy) {
  console.error('every write needs --as <your name or email> (it goes in change_log)');
  process.exit(1);
}

const out = (x) => console.log(JSON.stringify(x, null, 2));

switch (cmd) {
  case 'create': {
    const fields = JSON.parse(flag('json') ?? '{}');
    if (!fields.slug || !fields.name) { console.error('--json needs at least slug and name'); process.exit(1); }
    out(await rpc('create_project', { fields, p_changed_by: changedBy }));
    break;
  }
  case 'set': {
    const slug = args[1];
    const fields = JSON.parse(flag('json') ?? '{}');
    if (!slug || !Object.keys(fields).length) { console.error('usage: set <slug> --as <who> --json {...}'); process.exit(1); }
    out(await rpc('update_project', { p_slug: slug, fields, p_changed_by: changedBy }));
    break;
  }
  case 'decide': {
    const [, slug, stage, status] = args;
    if (!slug || !stage || !status) { console.error('usage: decide <slug> <stage> <status> --as <who> [--grades "3,4"] [--notes "..."]'); process.exit(1); }
    // Optional grade scope (Andy ruling 7/21): null = whole project.
    const gradesFlag = flag('grades');
    const grades = gradesFlag ? gradesFlag.split(',').map((g) => parseGrade(g)) : null;
    out(await rpc('decide_stage', { p_slug: slug, p_stage: stage, p_status: status, p_decided_by: changedBy, p_notes: flag('notes') ?? null, p_grades: grades }));
    break;
  }
  case 'request': {
    // The self-improvement loop: any calling LLM (read key is enough) can
    // file a request to improve the data source.
    const { rest } = await import('./lib/api.mjs');
    const text = flag('text');
    if (!text) { console.error('usage: request --as <who> --text "<what should improve>"'); process.exit(1); }
    out(await rest('/improvement_requests', {
      method: 'POST',
      body: { request: text, requested_by: changedBy },
      headers: { Prefer: 'return=representation' },
    }));
    break;
  }
  case 'ai-review': {
    const slug = args[1];
    if (!slug) { console.error('usage: ai-review <slug> --as <who>'); process.exit(1); }
    out(await rpc('ai_review_project', { p_slug: slug, p_changed_by: changedBy }));
    break;
  }
  case 'person': {
    out(await rpc('upsert_person', { p_name: flag('name'), p_email: flag('email') ?? null, p_team: flag('team') ?? null, p_changed_by: changedBy }));
    break;
  }
  default:
    console.error('commands: create | set <slug> | decide <slug> <stage> <status> | ai-review <slug> | person | request');
    process.exit(1);
}
