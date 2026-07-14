// Evidence from Andy's inbox (spec seed: "go through my email looking for
// any other replacement projects"), extracted 2026-07-14 from:
//   - "August 1st Deadline - URGENT" (2026-07-06, all owners' commitments)
//   - "Math App Stack for Next Year" (2026-06-05 → 07-06, Janna/Zach/Patrick)
//   - "PreK2 App Stack" (2026-07-01, Megan)
//   - "Early Reading" / "alphaphonics vs ELLO" (2026-07-07/13, Spencer)
// Everything below carries changed_by naming the evidence. Owners correct it
// in the UI if the emails are out of date. Idempotent: creates skip existing
// slugs; updates re-apply.

import { rest, rpc } from '../lib/api.mjs';

const BY = 'seed-import (email evidence 2026-07-14)';
const AUG1 = '2026-08-01';

const PEOPLE = [
  ['Janna Peskett', 'janna.peskett@alpha.school', 'academics'],
  ['Bill Brooks', 'bill.brooks@alpha.school', 'academics'],
  ['Noel Pilkington', 'noel.pilkington@alpha.school', 'academics'],
  ['David Babagbale', 'david.babagbale@alpha.school', 'academics'],
  ['Peter Bates', 'peter.bates@alpha.school', 'academics'],
  ['Bernhard Baernthaler', 'bernhard.baernthaler@alpha.school', 'academics'],
  ['Ilma Cohadzic', 'ilma.cohadzic@alpha.school', 'academics'],
  ['Barbara Franks', 'barbara.franks@alpha.school', 'academics'],
  ['Megan Gierka', 'megan.gierka@alpha.school', 'learning-science'],
  ['Zach Groshell', 'zach.groshell@alpha.school', 'learning-science'],
  ['Becky Allen', 'becky.allen@alpha.school', 'learning-science'],
  ['Jesso Murugan', 'jesso.murugan@alpha.school', 'academics'],
  ['Luit de Haan', 'luit.dehaan@alpha.school', 'other'],
  ['Liwei Mao', 'liwei.mao@superbuilders.school', 'superbuilders'],
  ['Patrick Skinner', 'patrick.skinner@superbuilders.school', 'superbuilders'],
  ['Spencer Chubb', 'spencer.chubb@superbuilders.school', 'superbuilders'],
];

const UPDATES = {
  'superbuilders-incept': {
    owner: 'Liwei Mao',
    sponsor: 'Zach Groshell',
    release_date: AUG1,
    notes: 'Ships as "Blu Math" — next-year Math base G3-5. Janna 6/5: "Liwei on track". G3+G5 pilot with Incept planned Week 2 of the Aug-1 push. Andy asked Liwei for the Incept Math skill (URL+key) 7/10 — still undelivered 7/13.',
  },
  'math-quest': {
    owner: 'Janna Peskett',
    sponsor: 'Zach Groshell',
    release_date: AUG1,
    bottleneck: 'One engineer for Math Quest G1-2 development. Janna finished G1-2 content 6/19 and handed off to Zach & Ben; the Superbuilders developer promised 6/17 went silent (Andy 7/6: "assume they won\'t deliver"). Fallback is staying in Zearn for G1-2.',
    notes: 'Next-year Math base K-2. K done; G1-2 content generated, development unresourced. Janna recommitted everything by Aug 1 on 7/13.',
  },
  'alpha-ccss-tests': {
    owner: 'Janna Peskett',
    sponsor: 'Zach Groshell',
    release_date: AUG1,
    bottleneck: 'Learning Science approval of the Math K-8 CCSS test banks — 90 tests, 85% complete 7/8, awaiting LS feedback since then.',
    notes: 'The "Alpha Common Core" Math K-8 test banks replacing Alpha Standardized/STAAR gates. Lock + deliver Week 2 of the Aug-1 push.',
  },
  'state-supplements': {
    owner: 'Janna Peskett',
    sponsor: 'Zach Groshell',
    release_date: AUG1,
    bottleneck: 'Outsourced to Vaidik + LWAI with unconfirmed capacity — Janna started building state supplements herself 7/13.',
  },
  'language-hole-filling': {
    release_date: AUG1,
    notes: 'COMPLETE 7/13, ahead of the Week-3 commitment: all 10 G3-12 Language HF courses built (publishStatus=testing). Status board: http://langhf-status-063718566796.s3-website-us-east-1.amazonaws.com/ — impersonate languagetestaccount@alpha.school to review.',
  },
  'academics-science': {
    release_date: AUG1,
    notes: 'Week-1 delivery landed 7/12: Science G3-5 + MS Engineering Design + MS Earth & Space courses (test via test.account11@alpha.school). Live content-gen API shipped 7/13 (science-content-api.up.railway.app). NGSS locked. TEKS/Franklin supplement course committed Week 3.',
  },
  'alphatok-social-studies': {
    sponsor: 'Becky Allen',
    release_date: AUG1,
    bottleneck: 'HS Social Studies AS3/Consensus Core standards finalization (Becky Allen), needed before HS courses generate.',
    notes: 'G6 Social Studies previewable as a student 7/13 on the new production loop; QC loop running. Skill pack only on Shared Drive; runnable package promised Week 2 (Andy: "Week two is too late").',
  },
};

const NEW_PROJECTS = [
  {
    slug: 'language-g9-10-base',
    name: 'Language G9/10 Base Courses',
    owner: 'Peter Bates', subject: 'Language', grade_min: 9, grade_max: 10,
    deliverable: 'course', release_date: AUG1,
    main_course_sequence: 'First-ever G9/10 base Language courses — no base course exists today; students have been cycling.',
    replaces: 'Nothing (gap in the current sequence — students cycle without a base course).',
    notes: 'Week 1: scope & sequence locked, build started. Ship Week 2 (per Aug-1 URGENT commitment 7/7).',
  },
  {
    slug: 'writing-g9-12',
    name: 'Writing G9-12 Courses',
    owner: 'Noel Pilkington', subject: 'Writing', grade_min: 9, grade_max: 12,
    deliverable: 'course', release_date: AUG1,
    main_course_sequence: 'G10 Writing first (course + test bank through QC into the TimeBack pipeline), then G9+G11 Week 2, G12 Week 3.',
    replaces: 'No HS Writing courses in the current sequence (Writing sequence today is G3-8).',
    notes: 'Committed 7/7 in the Aug-1 URGENT thread.',
  },
  {
    slug: 'vocabulary-hf-g9-12',
    name: 'Vocabulary G9-12 + HF Revisions',
    owner: 'Barbara Franks', subject: 'Vocabulary', grade_min: 3, grade_max: 12,
    deliverable: 'course', release_date: AUG1,
    main_course_sequence: 'New G9-12 Vocabulary courses + item revisions across G3-12.',
    replaces: 'Current Vocabulary sequence tops out at G12 with VocabLoco hole-filling; revisions target existing items.',
    notes: 'G9/G10 weeks 1-2, G11/G12 week 3. Owner could only accept the assignment 7/10 (started 4 days behind); pipeline runnable, API key not yet generated.',
  },
  {
    slug: 'reading-g3-app',
    name: 'Reading G3 App + AP Course Apps',
    owner: 'Ilma Cohadzic', subject: 'Reading', grade_min: 3, grade_max: 3,
    deliverable: 'app', release_date: AUG1,
    main_course_sequence: 'New Reading G3 app (plus AP course apps outside the K-8 grid).',
    bottleneck: 'platform3 issues — apps are live on CloudFront but serving backendless mocks until resolved; some AP videos pending alphaVideo throughput.',
    notes: 'Live UI 7/13 but not wired to real backends.',
  },
  {
    slug: 'prek2-literacy-stack',
    name: 'PreK-2 Literacy App Stack',
    owner: 'Megan Gierka', subject: 'Reading', grade_min: -1, grade_max: 2,
    deliverable: 'both',
    main_course_sequence: 'Current + proposed early-literacy stack at https://alphaliteracy-59afd.web.app (MAP Fluency as external validation).',
    replaces: 'Current PK-2 Reading stack (Mentava Basics, Alpha Reading Fluency, Lalilo).',
    notes: 'Andy 7/2: proposed stack lacks subjects and grade mapping — plan revision requested; protocols updated 7/6, response pending.',
  },
  {
    slug: 'alphaphonics-early-reading',
    name: 'AlphaPhonics (Early Reading)',
    owner: 'Spencer Chubb', subject: 'Reading', grade_min: -1, grade_max: 1,
    deliverable: 'app',
    main_course_sequence: 'Early-reading app replacing Mentava; voice quality being benchmarked against ELLO 2.0 (thread 7/13).',
    replaces: 'Mentava Basics (PK Reading base).',
    bottleneck: 'Disputed review gate: Patrick 7/7 claims Fiorella\'s review is an unnecessary blocker; Bernhard tasked with holding a resolution meeting. Early-reading automation brainlift pending from LS.',
  },
  {
    slug: 'fastmath-6-12',
    name: 'FastMath 6-12 (proposed)',
    owner: null, subject: 'FastMath', grade_min: 6, grade_max: 12,
    main_course_sequence: 'No fluency program exists past G5 (current FastMath sequence is PreK-5). Astro Math proposed for 6-8.',
    replaces: 'Nothing — gap in the current sequence.',
    bottleneck: 'Andy\'s approval: FastMath 6-12 was previously denied; Janna re-raised 7/8 and is waiting. No owner has committed.',
    notes: 'UNCLAIMED. Janna flagged the gap; approval + ownership both open.',
  },
];

// People first (owner lookups depend on them).
for (const [name, email, team] of PEOPLE) {
  await rpc('upsert_person', { p_name: name, p_email: email, p_team: team, p_changed_by: BY });
}
console.log(`people: ${PEOPLE.length} upserted with emails`);

for (const [slug, fields] of Object.entries(UPDATES)) {
  const out = await rpc('update_project', { p_slug: slug, fields, p_changed_by: BY });
  console.log(`update ${slug}:`, out.error ?? 'ok');
}

const have = new Set((await rest('/projects?select=slug')).map((p) => p.slug));
for (const p of NEW_PROJECTS) {
  if (have.has(p.slug)) { console.log(`create ${p.slug}: exists, skipped`); continue; }
  await rpc('create_project', { fields: p, p_changed_by: BY });
  console.log(`create ${p.slug}: ok`);
}
