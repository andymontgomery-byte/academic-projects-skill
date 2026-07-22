// Live conformance: the schema truth is the LIVE database (review ruling
// 2026-07-21 — the old version cross-checked three stale files against each
// other). Verifies, with the bundled anon key, that the served surfaces carry
// every column the primary customer (the sy-diff page) renders, and that the
// self-describing tables exist.
import { rest } from '../scripts/lib/api.mjs';

const REQUIRED_STATUS_COLUMNS = [
  'slug', 'name', 'subject', 'grade_min', 'grade_max', 'owner',
  'parent_summary', 'standards_covered', 'passes_test', 'entry_gate',
  'xp_hours', 'effective_for', 'release_date', 'brainlift_urls',
  'source_coverage', 'current_state', 'stages_approved',
  // sy-diff columns (2026-07-21)
  'primary_app', 'key_differences', 'why_better', 'is_ap', 'catalog_match',
  'cell_role', 'ap_courses', 'hours_display', 'andy_approval',
];

let failures = 0;
const fail = (m) => { console.error(`FAIL: ${m}`); failures += 1; };

const status = await rest('/project_status?select=*&limit=1');
if (!Array.isArray(status) || !status.length) fail('project_status returned no rows');
else {
  const keys = new Set(Object.keys(status[0]));
  for (const c of REQUIRED_STATUS_COLUMNS) if (!keys.has(c)) fail(`project_status missing column ${c}`);
}

const cells = await rest('/diff_cells?select=subject,grade_key,yr,apps,hours,evidence,authored_by&limit=1');
if (!Array.isArray(cells)) fail('diff_cells not readable with the anon key');

const dict = await rest("/data_dictionary?select=column_name&table_name=eq.projects&column_name=in.(primary_app,key_differences,why_better,is_ap,catalog_match,cell_role,ap_courses,hours_display)");
if (!Array.isArray(dict) || dict.length < 8) fail(`data_dictionary documents ${Array.isArray(dict) ? dict.length : 0}/8 sy-diff columns`);

const approvals = await rest('/approvals?select=stage,status,grades&limit=1');
if (!Array.isArray(approvals) || (approvals.length && !('grades' in approvals[0]))) fail('approvals.grades (grade scope) missing');

// ── Main-view SPEC assertions (Andy 7/22: prevent spec drift for every
// subject × grade — the Workflowy spec node, mirrored in the dashboard repo
// at docs/SY_DIFF_SPEC.md, is binding on the DATA):
//   key_differences <=3 bullets of <=5 words; why_better <=5 words;
//   Andy-approved projects price from TimeBack production, never BrainLift.
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const all = await rest('/project_status?select=slug,key_differences,why_better,hours_display,catalog_match,xp_hours,andy_approval,cell_role');
for (const p of all ?? []) {
  const kd = p.key_differences ?? [];
  if (kd.length > 3) fail(`${p.slug}: key_differences has ${kd.length} bullets (spec: <=3)`);
  for (const b of kd) if (words(b) > 5) fail(`${p.slug}: bullet "${b}" is ${words(b)} words (spec: <=5)`);
  if (p.why_better && words(p.why_better) > 5) fail(`${p.slug}: why_better "${p.why_better}" is ${words(p.why_better)} words (spec: 5-word explanation)`);
  const andyApproved = p.andy_approval?.status === 'approved';
  if (andyApproved) {
    const tbPriced = Boolean(p.catalog_match) || /TimeBack/i.test(p.hours_display ?? '');
    if (!tbPriced && p.cell_role !== 'assessment') {
      fail(`${p.slug}: Andy-approved but hours are not from TimeBack production (no catalog_match, hours_display=${JSON.stringify(p.hours_display)})`);
    }
  }
}

if (failures) { console.error(`${failures} conformance failure(s)`); process.exit(1); }
console.log('conformance OK — live schema serves every sy-diff column, diff_cells + dictionary present, spec constraints hold');
