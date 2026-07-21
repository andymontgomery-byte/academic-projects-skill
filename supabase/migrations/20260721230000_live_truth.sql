-- Live-truth consolidation (adversarial review 2026-07-21, Andy: "fix everything").
-- Captures in ONE versioned migration everything that previously existed only as
-- live-DB drift, plus three new data-owned fields that replace render-time
-- heuristics (Andy ruling: Fable interprets, code renders):
--   cell_role      — main | hole-filling | supplement | assessment (spec: only
--                    main-sequence apps occupy the diff report's app column)
--   ap_courses     — jsonb list of AP course families a project delivers
--   hours_display  — Fable-authored short hours string ("~15 h") for 26-27
-- Also: diff_cells (Fable-authored 25-26 cells), approvals.grades scope,
-- the five Jul-21 summary columns, and current RPC/view definitions.

-- ── projects: summary + linkage columns (Jul 21) ────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS primary_app text,
  ADD COLUMN IF NOT EXISTS key_differences jsonb,
  ADD COLUMN IF NOT EXISTS why_better text,
  ADD COLUMN IF NOT EXISTS is_ap boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS catalog_match text,
  ADD COLUMN IF NOT EXISTS cell_role text NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS ap_courses jsonb,
  ADD COLUMN IF NOT EXISTS hours_display text;

-- ── approvals: grade scope (one-record ruling, Jul 21) ──────────────────────
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS grades jsonb;

-- ── diff_cells: Fable-authored report cells ─────────────────────────────────
CREATE TABLE IF NOT EXISTS diff_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  grade_key text NOT NULL,
  yr text NOT NULL DEFAULT '25-26',
  apps text,
  hours text,
  evidence text,
  authored_by text,
  authored_at timestamptz DEFAULT now(),
  UNIQUE (subject, grade_key, yr)
);
GRANT SELECT ON diff_cells TO anon, authenticated;
GRANT ALL ON diff_cells TO service_role;

-- ── update_project: full current whitelist ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_project(p_slug text, fields jsonb, p_changed_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  r record;
begin
  perform set_config('app.changed_by', p_changed_by, true);
  update projects set
    name              = coalesce(fields->>'name', name),
    owner_id          = case when fields ? 'owner'   then (select id from people where name = fields->>'owner')   else owner_id end,
    sponsor_id        = case when fields ? 'sponsor' then (select id from people where name = fields->>'sponsor') else sponsor_id end,
    subject           = coalesce(fields->>'subject', subject),
    grade_min         = coalesce((fields->>'grade_min')::int, grade_min),
    grade_max         = coalesce((fields->>'grade_max')::int, grade_max),
    supplements       = coalesce(fields->>'supplements', supplements),
    deliverable       = coalesce(fields->>'deliverable', deliverable),
    hole_filling      = coalesce(fields->>'hole_filling', hole_filling),
    replaces          = coalesce(fields->>'replaces', replaces),
    parent_summary    = coalesce(fields->>'parent_summary', parent_summary),
    standards_covered = coalesce(fields->>'standards_covered', standards_covered),
    passes_test       = coalesce(fields->>'passes_test', passes_test),
    entry_gate        = coalesce(fields->>'entry_gate', entry_gate),
    xp_hours          = coalesce(fields->>'xp_hours', xp_hours),
    effective_for     = coalesce(fields->>'effective_for', effective_for),
    release_date      = coalesce((fields->>'release_date')::date, release_date),
    bottleneck        = coalesce(fields->>'bottleneck', bottleneck),
    notes             = coalesce(fields->>'notes', notes),
    primary_app       = coalesce(fields->>'primary_app', primary_app),
    key_differences   = case when fields ? 'key_differences' then fields->'key_differences' else key_differences end,
    why_better        = coalesce(fields->>'why_better', why_better),
    is_ap             = coalesce((fields->>'is_ap')::boolean, is_ap),
    catalog_match     = coalesce(fields->>'catalog_match', catalog_match),
    cell_role         = coalesce(fields->>'cell_role', cell_role),
    ap_courses        = case when fields ? 'ap_courses' then fields->'ap_courses' else ap_courses end,
    hours_display     = coalesce(fields->>'hours_display', hours_display),
    aliases           = case when fields ? 'aliases' then coalesce((select array_agg(x) from jsonb_array_elements_text(fields->'aliases') x), '{}') else aliases end,
    brainlift_urls    = case when fields ? 'brainlift_urls' then coalesce((select array_agg(x) from jsonb_array_elements_text(fields->'brainlift_urls') x), '{}') else brainlift_urls end,
    github_repos      = case when fields ? 'github_repos' then coalesce((select array_agg(x) from jsonb_array_elements_text(fields->'github_repos') x), '{}') else github_repos end,
    source_coverage   = coalesce(fields->'source_coverage', source_coverage)
  where slug = p_slug
  returning * into r;
  if r.id is null then
    return jsonb_build_object('error', 'no project with slug ' || p_slug);
  end if;
  return jsonb_build_object('id', r.id, 'slug', r.slug, 'updated', true);
end $function$;

-- ── decide_stage: implied cascade + grade scope (one-record ruling) ─────────
CREATE OR REPLACE FUNCTION public.decide_stage(p_slug text, p_stage text, p_status text, p_decided_by text, p_notes text DEFAULT NULL::text, p_grades jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  pid uuid;
  stage_order text[] := array['plan_approved_by_ai','approved_by_learning_science','ready_for_students','approved_by_andy','approved_by_campus_dris','approved_by_guides'];
  idx int;
  implied text[];
begin
  select id into pid from projects where slug = p_slug;
  if pid is null then
    return jsonb_build_object('error', 'no project with slug ' || p_slug);
  end if;
  idx := array_position(stage_order, p_stage);
  if idx is null then
    return jsonb_build_object('error', 'unknown stage ' || p_stage);
  end if;
  if p_status = 'approved' then
    select array_agg(a.stage) into implied
    from approvals a
    where a.project_id = pid
      and array_position(stage_order, a.stage) < idx
      and a.status is distinct from 'approved';
    if implied is not null then
      update approvals a set status = 'approved',
        decided_by = p_decided_by || ' (implied by ' || p_stage || ')',
        decided_at = now(),
        grades = p_grades
      where a.project_id = pid and a.stage = any(implied);
      insert into change_log (table_name, row_id, field, new_value, changed_by)
      select 'approvals', pid, s, 'approved (implied by ' || p_stage || ')', p_decided_by
      from unnest(implied) s;
    end if;
  end if;
  update approvals set status = p_status, decided_by = p_decided_by,
    notes = coalesce(p_notes, notes), decided_at = now(), grades = p_grades
  where project_id = pid and stage = p_stage;
  insert into change_log (table_name, row_id, field, new_value, changed_by)
  values ('approvals', pid, p_stage,
    p_status || case when p_grades is not null then ' (grades ' || p_grades::text || ')' else '' end,
    p_decided_by);
  return jsonb_build_object('slug', p_slug, 'stage', p_stage, 'status', p_status, 'implied', coalesce(to_jsonb(implied), '[]'::jsonb));
end $function$;

-- ── project_status: current shape + the new columns ─────────────────────────
DROP VIEW IF EXISTS project_status CASCADE;
CREATE VIEW project_status AS
 SELECT p.id, p.slug, p.name, p.aliases, p.subject, p.grade_min, p.grade_max,
    po.name AS owner, ps.name AS sponsor, p.deliverable, p.replaces,
    p.hole_filling, p.supplements, p.parent_summary, p.standards_covered,
    p.passes_test, p.entry_gate, p.xp_hours, p.effective_for, p.release_date,
    p.bottleneck, p.notes, p.updated_at, p.brainlift_urls, p.github_repos,
    p.source_coverage,
    ( SELECT a.stage FROM approvals a
      WHERE a.project_id = p.id AND a.status = 'approved'::text
      ORDER BY (array_position(ARRAY['plan_approved_by_ai'::text,'approved_by_learning_science'::text,'ready_for_students'::text,'approved_by_andy'::text,'approved_by_campus_dris'::text,'approved_by_guides'::text], a.stage)) DESC
      LIMIT 1) AS current_state,
    ( SELECT count(*) FROM approvals a WHERE a.project_id = p.id AND a.status = 'approved'::text) AS stages_approved,
    p.primary_app, p.key_differences, p.why_better, p.is_ap,
    ( SELECT a.status FROM approvals a WHERE a.project_id = p.id AND a.stage = 'approved_by_andy'::text LIMIT 1) AS andy_approval,
    p.catalog_match, p.cell_role, p.ap_courses, p.hours_display
   FROM projects p
     LEFT JOIN people po ON po.id = p.owner_id
     LEFT JOIN people ps ON ps.id = p.sponsor_id;

CREATE VIEW project_gaps AS
 SELECT slug, name, owner, sponsor, subject,
    array_remove(ARRAY[
        CASE WHEN COALESCE(array_length(brainlift_urls, 1), 0) = 0 THEN 'brainlift link (THE one owner action — we fill the form from it)'::text ELSE NULL::text END,
        CASE WHEN COALESCE(array_length(github_repos, 1), 0) = 0 THEN 'github repo link'::text ELSE NULL::text END,
        CASE WHEN parent_summary IS NULL THEN 'parent_summary (FIRST requirement)'::text ELSE NULL::text END,
        CASE WHEN standards_covered IS NULL THEN 'standards_covered (Q2)'::text ELSE NULL::text END,
        CASE WHEN passes_test IS NULL THEN 'passes_test (Q3)'::text ELSE NULL::text END,
        CASE WHEN entry_gate IS NULL THEN 'entry_gate (Q4)'::text ELSE NULL::text END,
        CASE WHEN xp_hours IS NULL THEN 'xp_hours (Q5)'::text ELSE NULL::text END,
        CASE WHEN effective_for IS NULL THEN 'effective_for (Q6)'::text ELSE NULL::text END,
        CASE WHEN owner IS NULL THEN 'owner'::text ELSE NULL::text END,
        CASE WHEN sponsor IS NULL THEN 'sponsor'::text ELSE NULL::text END,
        CASE WHEN subject IS NULL THEN 'subject'::text ELSE NULL::text END,
        CASE WHEN grade_min IS NULL OR grade_max IS NULL THEN 'grade range'::text ELSE NULL::text END,
        CASE WHEN deliverable IS NULL THEN 'deliverable'::text ELSE NULL::text END,
        CASE WHEN replaces IS NULL THEN 'replaces'::text ELSE NULL::text END,
        CASE WHEN hole_filling IS NULL THEN 'hole_filling'::text ELSE NULL::text END,
        CASE WHEN supplements IS NULL THEN 'supplements'::text ELSE NULL::text END,
        CASE WHEN release_date IS NULL THEN 'release_date'::text ELSE NULL::text END,
        CASE WHEN bottleneck IS NULL THEN 'bottleneck'::text ELSE NULL::text END], NULL::text) AS missing_fields,
    array_remove(ARRAY[
        CASE WHEN parent_summary ~~ '[AI guess%'::text THEN 'parent_summary'::text ELSE NULL::text END,
        CASE WHEN standards_covered ~~ '[AI guess%'::text THEN 'standards_covered'::text ELSE NULL::text END,
        CASE WHEN passes_test ~~ '[AI guess%'::text THEN 'passes_test'::text ELSE NULL::text END,
        CASE WHEN entry_gate ~~ '[AI guess%'::text THEN 'entry_gate'::text ELSE NULL::text END,
        CASE WHEN xp_hours ~~ '[AI guess%'::text THEN 'xp_hours'::text ELSE NULL::text END,
        CASE WHEN effective_for ~~ '[AI guess%'::text THEN 'effective_for'::text ELSE NULL::text END,
        CASE WHEN supplements ~~ '[AI guess%'::text THEN 'supplements'::text ELSE NULL::text END,
        CASE WHEN replaces ~~ '[AI guess%'::text THEN 'replaces'::text ELSE NULL::text END], NULL::text) AS ai_guessed_fields
   FROM project_status s;

CREATE VIEW sy2026_27_changes AS
 SELECT id, slug, name, aliases, subject, grade_min, grade_max, owner, sponsor,
    deliverable, replaces, hole_filling, supplements, parent_summary,
    standards_covered, passes_test, entry_gate, xp_hours, effective_for,
    release_date, bottleneck, notes, updated_at, brainlift_urls, github_repos,
    source_coverage, current_state, stages_approved
   FROM project_status
  WHERE release_date IS NOT NULL AND release_date <= '2026-08-01'::date
  ORDER BY subject, grade_min;

GRANT SELECT ON project_status, project_gaps, sy2026_27_changes TO anon, authenticated;

-- ── data_dictionary: document the new columns (self-description doctrine) ───
INSERT INTO data_dictionary (table_name, column_name, definition, business)
SELECT v.t, v.c, v.tech, v.biz
FROM (VALUES
  ('projects','primary_app','text — serving app of the 26-27 deliverable; ''TimeBack'' = served by the alpha.timeback.com UI','Which app delivers this project''s content; drives the diff report''s 26-27 app column (Alpha[Subject] by [Team] naming)'),
  ('projects','key_differences','jsonb array of <=3 bullets, <=5 words each','What changes vs last year, distilled by the Fable agent from the BrainLift; owner-correctable'),
  ('projects','why_better','text, 5 words','Why this delivers better academic outcomes than last year; Fable-written, owner-correctable'),
  ('projects','is_ap','boolean','AP projects render on per-AP-course rows after G12 on the diff report'),
  ('projects','catalog_match','text ILIKE pattern','Links the project to its uploaded TimeBack courses so 26-27 hours price TimeBack-first'),
  ('projects','cell_role','text: main | hole-filling | supplement | assessment','Only main-role projects occupy the diff report''s app column (spec: no hole-fill/supplement/assessment apps there)'),
  ('projects','ap_courses','jsonb array of AP course family names','Which AP course rows an is_ap project belongs to (replaces name-regex matching)'),
  ('projects','hours_display','text like ''~15 h''','Fable-authored display hours for the 26-27 column (replaces render-time regex extraction)'),
  ('diff_cells','*','one row per subject x grade_key x yr','Fable-authored diff-report cells: apps + hours + evidence, found via the timeback production skill; the page renders them verbatim')
) AS v(t,c,tech,biz)
WHERE NOT EXISTS (SELECT 1 FROM data_dictionary d WHERE d.table_name = v.t AND d.column_name = v.c);
