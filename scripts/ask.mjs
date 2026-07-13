// Read commands over the Academic Projects data source. Read-only; works
// with the anon key.
//
//   node scripts/ask.mjs status                 # all projects + current state
//   node scripts/ask.mjs gaps                   # missing fields per project (the point)
//   node scripts/ask.mjs north-star             # SY 2026-27 Aug-1 changes
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
    // Both halves of the answer: projects predicting an Aug-1 release, and
    // the per-cell now→next app-stack changes.
    const projects = await rest('/sy2026_27_changes?select=*');
    const stackChanges = await rest('/stack_changes?select=*');
    out({ projects, stackChanges });
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
    console.error('commands: status | gaps | north-star | stack [subject] | stack-changes | dictionary | people | log [slug] | project <slug>');
    process.exit(1);
}
