# Academic Projects — Data Dictionary

Source of truth for definitions: Andy's Workflowy spec (Academic Projects -
Data Source Skill). This file and the `data_dictionary` table in the database
mirror it — `node scripts/ask.mjs dictionary` returns the same content
machine-readably.

## What a replacement project is

An initiative that replaces an existing app/course cell in the PowerPath
course sequence with one that delivers **better academic outcomes**. The
current production stack is visible at
<https://timeback-loops-k8.vercel.app/course-sequence>.

## projects — one row per replacement project

| field | definition |
|---|---|
| `slug` | Stable short handle; never changes once created. |
| `name` | Working name of the project. |
| `owner_id` → `people` | **Owner** — responsible for getting it high quality into the hands of students. |
| `sponsor_id` → `people` | **Sponsor** — the Learning Science team member who gave the spec and reviews before Andy. |
| `subject` | Math, Reading, Language, Writing, Science, Vocabulary, Social Studies, or FastMath. |
| `grade_min`, `grade_max` | Grade range covered (-1 = PK, 0 = K, 1–12). |
| `main_course_sequence` | How it lands in the main course sequence: which subject×grade cells it fills. |
| `needs_supplements`, `contains_supplements`, `supplements_notes` | Does the sequence need supplements? Does the project contain them? |
| `deliverable` | `app`, `course`, or `both`. Just **course** = delivered by an existing app. Just **app** = a new app delivering existing course content/curriculum in TimeBack. |
| `hole_filling` | What hole-filling looks like when students don't pass the test. |
| `replaces` | What it replaces in the current production stack. |
| `quantified_outcomes` | Quantified learning outcomes (test scores, or time to end-of-grade mastery-gate pass) vs what it replaces. Example: "EOG mastery gate passed at 90% accuracy in 5 fewer hours because the initial practice is twice as many questions." A claim with no number is not quantified. |
| `xp` | XP design. |
| `parent_summary` | Parent and customer facing summary. |
| `release_date` | Owner's prediction of when it will be in the hands of students because it was approved by all. |
| `bottleneck` | "If you could wave a magic wand and solve one problem, what would it be?" |

**Empty fields are data.** The core loop of this source is publishing what's
missing to each owner and sponsor so they fix it directly — no project
managers chasing anyone.

## approvals — current state, six stages in order

1. `plan_approved_by_ai`
2. `approved_by_learning_science`
3. `ready_for_students` (owner approval)
4. `approved_by_andy`
5. `approved_by_campus_dris`
6. `approved_by_guides`

Each is `pending` / `approved` / `rejected` with `decided_by`. A project's
`current_state` (in the `project_status` view) is the furthest approved stage.

## people

`name`, `email`, `team` (`academics` / `learning-science` / `superbuilders` /
`other`). Sponsors come from learning-science; owners usually from academics.

## change_log

Every field-level change with `changed_by` — the accountability surface.
Writes go through the RPC functions (`create_project`, `update_project`,
`decide_stage`, `upsert_person`) which require a `changed_by`.

## Views

- `project_status` — projects with names resolved + derived `current_state`.
- `project_gaps` — missing dictionary fields per project. **The point.**
- `sy2026_27_changes` — the north-star question: changes to the course
  sequence ready for students for the 2026-2027 school year (Aug 1).
