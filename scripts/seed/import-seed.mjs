// Seed the database from the accessible sources (2026-07-13):
//   1. Academics team sheet → people (team=academics; email only when the
//      cell actually contains an address — missing emails stay null, gaps
//      are data).
//   2. Owners sheet (subject-owner grid) → Learning Science people from the
//      subject-title rows (row-1 = LS, per Andy 2026-07-13).
//   3. Owners sheet footer "Ongoing Replacement Projects" → the first three
//      project rows, with six pending approval stages each.
//
// Idempotent: people upsert on name; projects skipped if the slug exists.
// Still pending upstream: the partial-math-data sheet (org-restricted) and
// Andy's email sweep. Run again after those open up.

import { rest, rpc } from '../lib/api.mjs';

const TEAM_SHEET = 'https://docs.google.com/spreadsheets/d/1y2p88M7xxixkGJPcMnqF89i2lVhAQs4I_drv4p6IY2E/export?format=csv';
const CHANGED_BY = process.env.SEED_CHANGED_BY ?? 'seed-import';

// Learning Science owners per the owners sheet subject-title rows.
const LS_PEOPLE = ['Zach', 'John', 'Megan', 'Sarah', 'Jen', 'Mark (LS)', 'Becky', 'Carl'];

const PROJECTS = [
  {
    slug: 'superbuilders-incept',
    name: 'SuperBuilders Incept',
    owner: 'Liwei',
    subject: 'Math',
    grade_min: 3,
    grade_max: 8,
    main_course_sequence: 'Replaces the Grades 3-8 Math main-sequence courses',
    replaces: 'Current G3-8 Math main sequence: TEKS Math (TimeBack), Math Academy, Zearn, Math Cakes — see https://timeback-loops-k8.vercel.app/course-sequence',
    notes: 'Initial mastery gate ~10 questions vs. 3-5, highest rigor, CCSS and TEKs.',
  },
  {
    slug: 'academics-science',
    name: 'Academics Science',
    owner: 'David Babagbale',
    subject: 'Science',
    grade_min: 3,
    grade_max: 8,
    main_course_sequence: 'Replaces the Grades 3-8 Science main-sequence courses',
    replaces: 'Current G3-8 Science main sequence — see https://timeback-loops-k8.vercel.app/course-sequence',
    notes: 'AlphaTok videos, interactive articles, PP100, NGSS AND state standards.',
  },
  {
    slug: 'alphatok-social-studies',
    name: 'AlphaTok Social Studies',
    owner: 'Bill Brooks',
    subject: 'Social Studies',
    grade_min: 3,
    grade_max: 12,
    main_course_sequence: 'AlphaTok as the Social Studies course layer (no PowerPath Social Studies sequence exists yet)',
    replaces: 'Current de-facto Social Studies stack (AlphaTok G3-4 pilots, Flying Colors Civics, BRI Civics) — synthesized column on https://timeback-loops-k8.vercel.app/course-sequence',
    notes: 'AlphaTok.',
  },
];

async function main() {
  // 1. Academics team
  const csv = await (await fetch(TEAM_SHEET)).text();
  const rows = csv.trim().split('\n').slice(1).map((l) => l.split(','));
  let nPeople = 0;
  for (const [name, emailCell] of rows) {
    if (!name?.trim()) continue;
    const email = emailCell?.includes('@') ? emailCell.trim() : null;
    await rpc('upsert_person', {
      p_name: name.trim(), p_email: email, p_team: 'academics', p_changed_by: CHANGED_BY,
    });
    nPeople++;
  }
  console.log(`people: ${nPeople} academics upserted`);

  // 2. Learning Science owners
  for (const name of LS_PEOPLE) {
    await rpc('upsert_person', { p_name: name, p_email: null, p_team: 'learning-science', p_changed_by: CHANGED_BY });
  }
  console.log(`people: ${LS_PEOPLE.length} learning-science upserted`);

  // 3. Liwei (SuperBuilders) — owner of Incept, not on either sheet's roster
  await rpc('upsert_person', { p_name: 'Liwei', p_email: null, p_team: 'superbuilders', p_changed_by: CHANGED_BY });

  // 4. Projects
  const existing = await rest('/projects?select=slug');
  const have = new Set(existing.map((p) => p.slug));
  for (const p of PROJECTS) {
    if (have.has(p.slug)) { console.log(`project ${p.slug}: exists, skipped`); continue; }
    const out = await rpc('create_project', { fields: p, p_changed_by: CHANGED_BY });
    console.log(`project ${p.slug}: created`, out);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
