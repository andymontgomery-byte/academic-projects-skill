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

## Rules

- **Every write is attributed** (`--as <who>` / the UI name box → change_log).
- **Never invent data — but DO prefill from evidence.** When an answer exists
  in an email, a doc, or another data structure, fill the field prefixed
  `[AI guess — verify]` with the source named; owners edit or strip the
  prefix to confirm. The AI review treats guessed fields as answered but
  will not pass the plan until they are verified. A null field with no
  evidence stays null — that gap belongs to its owner.
- **Quantified outcomes need a number** — test scores or hours to
  end-of-grade mastery-gate pass, vs what it replaces.
- **The six questions are structured fields** (Q1 = subject + grade range;
  Q2 `standards_covered`; Q3 `passes_test`; Q4 `entry_gate`; Q5 `xp_hours`;
  Q6 `effective_for`) — answer them in internal terms. **`parent_summary` is the FIRST requirement:**
  it rephrases those structured answers in plain parent language (the Scribble
  example in Workflowy `#/929b0e407c72` is the register; the AI review rejects
  internal jargon in it). Also brainlift row 9.
- Approval stages are a **strict sequence** (enforced in the database):
  plan_approved_by_ai → approved_by_learning_science → ready_for_students →
  approved_by_andy → approved_by_campus_dris → approved_by_guides. A stage
  can only be decided when every earlier stage is approved. **Stage 1 is
  never a human decision** — `update.mjs ai-review <slug>` (or the UI's
  "run AI review" button) computes approve/reject from the plan data itself
  and writes the gap list as feedback. `release_date` = the owner's
  prediction of all-approved, in students' hands.

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
`projects` (one row per replacement project, the data-dictionary fields) ·
`approvals` (6 ordered stages per project) · `app_stack` (subject × grade ×
era × role → app; `stack_changes` view diffs now→next) · `people` ·
`change_log` (every attributed change) · `brainlift` + `data_dictionary`
(self-description) · `improvement_requests` (the feedback loop). Views:
`project_status`, `project_gaps`, `sy2026_27_changes`, `stack_changes`.
Full field-by-field detail: `node scripts/ask.mjs dictionary`.
