# academic-projects-skill

The master data source for Academic Projects — replacement projects that
upgrade cells of Alpha's PowerPath course sequence with apps/courses that
deliver better academic outcomes. Ships as an agent skill: hosted zip + a
Supabase Postgres data source spoken to with a URL + API key.

- **Agent entry point:** `SKILL.md`
- **Hosted URL:** <https://timeback-loops-k8.vercel.app/skills/academic-projects/>
- **Data dictionary:** `references/data-dictionary.md` (also in-database:
  `node scripts/ask.mjs dictionary`)
- **Spec:** Andy's Workflowy node "Academic Projects - Data Source Skill"
  (78e12cec072f) — definitions change there first.

## Feedback

File issues here — anyone can submit tickets to make the skill better.

## Publishing

Bump `VERSION`, zip the tree (minus `.git`/`supabase`), update
`public/skills/academic-projects/` in `timeback-loops-k8` (latest.zip,
versions/, latest.json with sha256), push. Mirrors the `timeback` skill's
publish pattern.

## Operations

- Supabase project ref: `jigpfagovaueekufildm` (org mguqotudivmylnzovwjg).
- Keys: `supabase projects api-keys --project-ref jigpfagovaueekufildm`.
  Anon = read-only (RLS select-only). Service role = attributed writes via
  the RPC functions. Never commit keys.
- Schema changes: edit `schema.sql` + `seed/*.sql`, apply via the Supabase
  Management API query endpoint, keep `test/conformance.mjs` green.
