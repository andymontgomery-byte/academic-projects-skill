# Academic Projects Skill

The master data source for **Academic Projects** — the initiatives replacing
app/course cells of Alpha's PowerPath course sequence with ones that deliver
better learning outcomes. Reads work with zero configuration (a read-only key
is bundled); any agent with this folder can answer the questions below.
Requires only Node ≥ 18. No install step.

## The three questions this skill exists to answer

1. **"What's the current course sequence given to students?"**
   → `node scripts/ask.mjs current-sequence`
   (live PowerPath: every subject × grade's course, mastery gate, and
   hole-filling app; human view at
   <https://timeback-loops-k8.vercel.app/course-sequence>)

2. **"What are the changes by Aug 1 for next school year, stack-ranked by
   impact on learning outcomes and pitched to parents?"**
   → `node scripts/ask.mjs north-star`
   (every project ranked by impact evidence — quantified-outcome promise,
   then Aug-1 commitment — each with its parent pitch or the named gap +
   owner; plus the per-cell now→next app-stack diff)

3. **"What are the biggest barriers to better learning outcomes by Aug 1 —
   who is struggling to get through the approvals?"**
   → `node scripts/ask.mjs barriers`
   (per project: the next pending approval stage, exactly who it's stuck on,
   and the owner's own magic-wand bottleneck answer)

Answers are honest about missing data — **gaps are the product**: each null
field is published to its owner and sponsor so they fix it themselves at
<https://timeback-loops-k8.vercel.app/academic-projects>, no project
managers chasing anyone.

## Orientation for a fresh agent

```bash
node scripts/ask.mjs brainlift    # business context — read first
node scripts/ask.mjs dictionary   # every field: technical + business surface
```

The brainlift and the data dictionary live IN the database, so "what do you
do and what is the best way to use you?" is answered by the data source
itself.

## All commands

```text
# read (zero-config)
node scripts/ask.mjs current-sequence     # Q1 — what students get today
node scripts/ask.mjs north-star           # Q2 — Aug-1 changes, ranked, parent-pitched
node scripts/ask.mjs barriers             # Q3 — approval blockers, per person
node scripts/ask.mjs status               # all projects + current approval state
node scripts/ask.mjs gaps                 # missing fields per project
node scripts/ask.mjs project <slug>       # one project incl. its 6 approval stages
node scripts/ask.mjs stack [subject]      # app-stack matrix (old / now / next)
node scripts/ask.mjs stack-changes        # now→next diff per subject×grade×role
node scripts/ask.mjs people               # owners / sponsors / emails / teams
node scripts/ask.mjs log [slug]           # who changed what, when
node scripts/ask.mjs brainlift            # business insights
node scripts/ask.mjs dictionary           # the data dictionary
node scripts/ask.mjs improvements         # the self-improvement request queue
node scripts/score.mjs [slug]             # plan completeness score + feedback

# write — prefer the UI (https://timeback-loops-k8.vercel.app/academic-projects);
# scripted writes need ACADEMIC_PROJECTS_SERVICE_KEY and are always attributed
node scripts/update.mjs create --as "you@alpha.school" --json '{"slug":"...","name":"..."}'
node scripts/update.mjs set <slug> --as "you@alpha.school" --json '{"release_date":"2026-08-01"}'
node scripts/update.mjs decide <slug> <stage> approved --as "you@alpha.school"
node scripts/update.mjs person --as "you@alpha.school" --name "..." --email "..." --team academics

# improvement loop — zero-config; any calling LLM may file one
node scripts/update.mjs request --as "who-you-are" --text "what should improve"
```

## BrainLift is the form (the one owner action)

Owners do not fill forms. Each project links its sources —
`brainlift_urls` (the owner-authored BrainLift) and `github_repos` — and
**AI fills every structured field from them**. The owner's ONE action is
keeping the BrainLift linked and answering the required questions; the UI,
the loop emails, and `source_coverage` all say exactly what the sources
still don't answer.

**The assess recipe** (any agent with this skill + the service key; the
loops run it for projects whose sources changed):

1. Read each `brainlift_urls` entry (Workflowy share links render as pages —
   fetch them; API subtree reads only resolve nodes in your own account) and
   each `github_repos` repo (README, specs, docs).
2. For each required question (`parent_summary`, Q1 subject+grades,
   `standards_covered`, `passes_test`, `entry_gate`, `xp_hours`,
   `effective_for`): if the sources answer it, fill the field prefixed
   `[AI guess — verify]` with the source named (per the prefill rule below).
2b. Maintain the diff-report fields in the same call (the sy-diff page at
   <https://timeback-loops-k8.vercel.app/sy-diff> renders them verbatim):
   `primary_app` (serving app; 'TimeBack' = the alpha.timeback.com UI),
   `key_differences` (≤3 bullets, ≤5 words each, fewer is better),
   `why_better` (one 5-word outcomes explanation), `hours_display`
   (short string like '~15 h'), `cell_role`
   (main | hole-filling | supplement | assessment — only main-role
   projects occupy the report's app column), `ap_courses` (jsonb list of
   AP course families, for is_ap projects), `catalog_match` (ILIKE title
   pattern for the project's uploaded TimeBack courses, only if verified).
3. Record per-question coverage in `source_coverage`:
   `{assessed_at, assessed_by, questions: {parent_summary|q1_subject_grades|
   q2_standards|q3_passes_test|q4_entry_gate|q5_xp_hours|q6_effective_for:
   {verdict: answered|partial|missing, evidence, ask}}}` — the `ask` is the
   sentence telling the owner what to add to their BrainLift. Write it with
   `update.mjs set <slug> --json '{"source_coverage": {...}}'`.
4. Never overwrite an owner-verified field (no `[AI guess` prefix) with a
   new guess — owners outrank sources.

## Rules

- **Every write is attributed** (`--as <who>` / the UI name box → change_log).
- **Never invent data — but DO prefill from evidence.** When an answer exists
  in an email, a doc, or another data structure, fill the field prefixed
  `[AI guess — verify]` with the source named; owners edit or strip the
  prefix to confirm. The AI review treats guessed fields as answered but
  will not pass the plan until they are verified. A null field with no
  evidence stays null — that gap belongs to its owner (and the fix is
  always the same: put the answer in the BrainLift).
- **Q3 is the quantified promise and needs numbers** — the
  parent-recognizable test + threshold, and how that compares with what it
  replaces (score or hours delta). There is no separate outcomes field; each
  thing is asked exactly once.
- **The six questions are structured fields** (Q1 = subject + grade range;
  Q2 `standards_covered`; Q3 `passes_test`; Q4 `entry_gate`; Q5 `xp_hours`;
  Q6 `effective_for`) — answer them in internal terms. **`parent_summary` is the FIRST requirement:**
  it rephrases those structured answers in plain parent language (the Scribble
  example in Workflowy `#/929b0e407c72` is the register; the AI review rejects
  internal jargon in it). Also brainlift row 9.
- Approval stages are an **ordered ladder with implied cascade** (Andy
  ruling 2026-07-21 — ONE system of record, constraints relaxed):
  plan_approved_by_ai → approved_by_learning_science → ready_for_students →
  approved_by_andy → approved_by_campus_dris → approved_by_guides.
  **Approving a later stage auto-approves every earlier non-approved stage**,
  attributed `<decider> (implied by <stage>)` and change-logged — anything
  Andy approved has, by definition, passed the stages before his. Approval
  rows carry an optional **`grades` scope** (jsonb array; null = whole
  project; K = 0, PK = -1): `update.mjs decide <slug> <stage> approved
  --as <who> --grades "3,4"`. The approvals table is the ONLY approval
  record — never keep a parallel approval field elsewhere.
  `update.mjs ai-review <slug>` (or the UI's "run AI review" button) is
  still the normal path for stage 1. `release_date` = the owner's
  prediction of all-approved, in students' hands.
- **One project = one block of courses.** A project row is a subject + a
  grade RANGE (`grade_min`–`grade_max`), not a single course — Math Quest is
  one row spanning K–2 even though it delivers three courses incrementally.
  The per-grade courses hang off the row via `app_stack.project_slug` (one
  project ↔ many subject×grade cells). External systems know the same
  initiative under other names (Worksmart, vendor branding, email threads);
  those belong in `projects.aliases`, NEVER in a new row. Before creating a
  project, check the name against existing names, slugs, and aliases —
  `create_project` rejects matches and tells you which row to extend.
- Unshipped projects get **prediction framing**: `passes_test` and
  `parent_summary` state what WILL happen when the course is in students'
  hands ("Prediction: … pass the state end-of-course test at 90%+ first
  attempt"), with pilot evidence cited as support — never phrased as if the
  outcome were already measured at scale.

## Disagree with what the report shows? (owners)

Two channels, both watched by a headless triage agent every 30 minutes:

1. **Ticket:** open an issue on
   <https://github.com/andymontgomery-byte/academic-projects-skill/issues>.
2. **Email:** send to andy.montgomery@alpha.school with the subject
   containing **"ACADEMIC PROJECTS"**.

The agent RCAs against your BrainLift + TimeBack production, replies after
triage, fixes the data when the evidence supports it (owner statements
outrank AI guesses — always attributed), and replies again after the fix.
What needs Andy or code stays open with a named owner.

## The loops (already running — don't duplicate them)

One engine, three delivery rails, one job each. The engine is
`scripts/loop/remind.mjs` (deterministic, keyless — composes per-person
notifications from the public gateway).

- **Record** (durable): GitHub Actions (`.github/workflows/loop.yml`) runs
  hourly for state-change alerts and daily at 12:50 UTC for the full digest,
  posting to the rolling issue
  <https://github.com/andymontgomery-byte/academic-projects-skill/issues/1>.
- **Delivery to people**: an interactive-session cron creates the same
  content as Gmail drafts in Andy's account for one-click send (Google's
  Gmail MCP is draft-only and unavailable to headless runs — that constraint
  picked this shape).
- **Skill improvement**: a daily cloud routine
  (`academic-projects-feedback-loop`, 13:40 UTC) stack-ranks
  `improvement_requests` + GitHub issues, opens PRs on `loop/*` branches for
  safe repo-only fixes, and comments its triage on issue #1.

## Sibling skills (don't duplicate their jobs)

- **timeback** — deep read-only TimeBack/MAP analysis:
  <https://timeback-loops-k8.vercel.app/skills/timeback/>
- **academics-responsibility-grid** (Bernhard) — "who owns subject × grade
  band"; both it and this skill read the same live owners sheet.

## Data model in one paragraph

Supabase Postgres (`https://jigpfagovaueekufildm.supabase.co`, REST).
`projects` (one row per replacement project, the data-dictionary fields,
plus the source columns: `brainlift_urls` + `github_repos` owner-maintained,
`source_coverage` AI-maintained) ·
`approvals` (6 ordered stages per project) · `app_stack` (subject × grade ×
era × role → app; `stack_changes` view diffs now→next) · `people` ·
`change_log` (every attributed change) · `brainlift` + `data_dictionary`
(self-description) · `improvement_requests` (the feedback loop). Views:
`project_status`, `project_gaps`, `sy2026_27_changes`, `stack_changes`.
Full field-by-field detail: `node scripts/ask.mjs dictionary`.
