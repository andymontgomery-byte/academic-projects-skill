# Data dictionary — canonical copy lives in the database

Run `node scripts/ask.mjs dictionary` — every column carries a technical
`definition` and a product-manager `business` surface. This file only records
what a column list can't:

- **Grain**: one `projects` row per replacement project (an initiative that
  upgrades app/course cells of the PowerPath course sequence). Incumbent
  apps that aren't changing are not projects; they appear in `app_stack` as
  the `now` era.
- **Empty fields are data.** The core loop publishes what's missing to each
  owner and sponsor; they fix it at
  <https://timeback-loops-k8.vercel.app/academic-projects>.
- **Definitions originate in Andy's Workflowy spec** ("Academic Projects -
  Data Source Skill", node `78e12cec072f`). Change them there first, then in
  `seed/data-dictionary.sql`, then re-apply.
