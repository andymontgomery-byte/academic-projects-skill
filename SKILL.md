# Academic Projects Skill

The master data source for **Academic Projects** — the initiatives replacing
existing app/course cells in Alpha's PowerPath course sequence with ones that
deliver better academic outcomes. Any agent with this folder and an API key
can read the data, expose the gaps, score plans, and (with the write key) let
owners and sponsors create and fix their own data.

## What do you do and what is the best way to use you?

**Business context.** Alpha students work through a per-subject course
sequence (course → mastery-gate assessment → hole-filling remediation; see
the live grid at <https://timeback-loops-k8.vercel.app/course-sequence>).
Replacement projects upgrade cells of that sequence. Before this data source
existed there was no central place to see all the upgrade projects, so the
question "**what are the changes to the course sequence for the 2026-2027
school year that we will have ready for students on August 1st?**" had no
answer. Now: `node scripts/ask.mjs north-star`.

**The design principle: gaps are the product.** Each project's missing or
stale fields are published to its owner (responsible for getting it into
students' hands at high quality) and sponsor (the Learning Science team
member who gave the spec). They fix the data themselves — no project
managers chasing answers. Delivering for students is its own best reward;
this source exists to make successes and failures visible.

**Best way to use me:**
0. `node scripts/ask.mjs brainlift` — the business insights on top of the raw
   data (the Data Source Skills doctrine: pure raw data + a BrainLift so the
   calling LLM builds its own intermediate layers; never pre-interpreted).
1. `node scripts/ask.mjs dictionary` — learn the schema from the database
   itself; every field has a technical definition and a product-manager
   (business) description.
2. `node scripts/ask.mjs status` — every project and its current state.
3. `node scripts/ask.mjs gaps` — what's missing, per project. Route each gap
   to its owner/sponsor.
4. `node scripts/score.mjs` — deterministic plan score + feedback; add your
   judgment on top (is the outcomes claim falsifiable? is the release date
   credible given the bottleneck?).
5. With the write key, apply owners'/sponsors' fixes via `scripts/update.mjs`.

## Setup — URL + API key

The data lives in Supabase Postgres, spoken to over its REST API.

- **URL:** `https://jigpfagovaueekufildm.supabase.co` (override with
  `ACADEMIC_PROJECTS_URL`).
- **Read key** (safe to hand any consumer): set `ACADEMIC_PROJECTS_KEY`.
  Grants SELECT on everything, nothing else.
- **Write key** (owners/sponsors/Andy only): set
  `ACADEMIC_PROJECTS_SERVICE_KEY`. Unlocks the attributed write functions.
- Local fallback: `~/.academic-projects-skill/api-keys.json` (the output of
  `supabase projects api-keys -o json`).

No other dependencies — plain Node ≥ 18, no npm install.

## Commands

```text
# read (anon key is enough)
node scripts/ask.mjs status            # all projects + derived current state
node scripts/ask.mjs gaps              # missing fields per project — the core loop
node scripts/ask.mjs north-star        # SY 2026-27 changes: projects + stack diff
node scripts/ask.mjs stack [subject]   # app-stack matrix: old / now / next per grade×role
node scripts/ask.mjs stack-changes     # now→next diff — the per-cell Aug-1 answer
node scripts/ask.mjs dictionary        # two-surface dictionary (technical + business), from the DB
node scripts/ask.mjs brainlift         # the business insights — read these FIRST
node scripts/ask.mjs improvements      # the self-improvement request queue
node scripts/ask.mjs people            # owners / sponsors / teams
node scripts/ask.mjs project <slug>    # one project incl. its 6 approval stages
node scripts/ask.mjs log [slug]        # who changed what, when
node scripts/score.mjs [slug]          # plan completeness score + feedback

# write (service key + --as attribution, always)
node scripts/update.mjs create --as "you@alpha.school" --json '{"slug":"...","name":"..."}'
node scripts/update.mjs set <slug> --as "you@alpha.school" --json '{"release_date":"2026-08-01"}'
node scripts/update.mjs decide <slug> <stage> approved --as "you@alpha.school"
node scripts/update.mjs person --as "you@alpha.school" --name "..." --email "..." --team academics

# improvement loop (read key is enough — any calling LLM may file one)
node scripts/update.mjs request --as "dashboard-skill" --text "Add a Reading app-stack matrix"
```

## Rules

- **Every write is attributed.** Use the RPC-backed `update.mjs` commands
  with `--as <who>`; never write tables directly. `change_log` is the
  accountability surface.
- **Never invent data to close a gap.** A null field is a message to its
  owner, not a blank to autofill. When asked to "fix" data, apply what the
  owner/sponsor actually said, attributed to them.
- **Quantified outcomes need a number** — a claim you can't measure against
  what it replaces is not quantified (test scores, or hours to end-of-grade
  mastery-gate pass).
- The six approval stages are ordered: plan_approved_by_ai →
  approved_by_learning_science → ready_for_students → approved_by_andy →
  approved_by_campus_dris → approved_by_guides. `release_date` is the
  owner's prediction of all-approved, in students' hands.
- The current production stack ("what it replaces") is the live
  course-sequence grid; cite cells from
  <https://timeback-loops-k8.vercel.app/course-sequence> when filling
  `replaces`.
- Read `references/data-dictionary.md` before adding fields; definitions
  originate in Andy's Workflowy spec — change them there first.

## Daily update recipe (for a reminder agent)

1. `node scripts/ask.mjs gaps` + `node scripts/score.mjs`.
2. Group by owner and sponsor; one short message each: their projects,
   scores, exactly which fields are missing, and the one bottleneck answer
   you're waiting on.
3. Send only when something changed since the last run (`ask.mjs log`).

## Tickets / feedback

Anyone can file feedback on the skill itself at the repo:
<https://github.com/andymontgomery-byte/academic-projects-skill/issues>.

## The app-stack matrix

`app_stack` holds which app fills each **role** (base / hole_filling /
supplement / test / supplement_test) of a subject×grade cell, per **era**
(old / now / next-school-year-shipped-by-Aug-1). The `stack_changes` view
diffs now→next; linking each changed cell to its delivering project
(`project_slug`) is how progress gets measured. Math K-8 is loaded
(transcribed from Andy's sheet screenshot 2026-07-13 — `source` says so;
re-import from CSV when the sheet becomes readable). Other subjects: empty,
i.e. owed.

## Roadmap

- Re-import the math app-stack from the sheet itself when sharing opens
  (currently screenshot-transcribed; grade K's now-supplement cell was
  unreadable and is null).
- Merge the shared "data source skills" pattern doc + parent/customer-facing
  summary format when accessible.
- Fold into TimeBack (and the `timeback` skill) once proven standalone.
