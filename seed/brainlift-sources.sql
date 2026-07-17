-- BrainLift-as-the-form (Andy 2026-07-16): owners get ONE action — edit your
-- BrainLift (and GitHub repo) until it answers the required questions. AI
-- reads those sources, fills the structured fields, and records per-question
-- coverage. The UI and loop emails surface coverage state, not form nags.
alter table projects add column if not exists brainlift_urls text[] not null default '{}';
alter table projects add column if not exists github_repos  text[] not null default '{}';
alter table projects add column if not exists source_coverage jsonb;

insert into data_dictionary (table_name, column_name, definition, example, business) values
('projects', 'brainlift_urls', 'Links to the project''s BrainLift(s) — the owner-authored source of truth the AI reads to fill every structured field. THE one owner action is keeping the BrainLift answering all required questions.', '{https://workflowy.com/s/levelmath-productmar/vauVUGMHUAJ8IdB1}', 'Owners edit the BrainLift, not the form. AI fills the form from it.'),
('projects', 'github_repos', 'The project''s GitHub repo(s) — the second source the AI reads (code, README, specs) when filling fields and assessing coverage.', '{https://github.com/org/repo}', 'Same doctrine as brainlift_urls: humans maintain the source, AI maintains the form.'),
('projects', 'source_coverage', 'AI-assessed state of the sources vs the required questions: {assessed_at, assessed_by, questions: {parent_summary|q1_subject_grades|q2_standards|q3_passes_test|q4_entry_gate|q5_xp_hours|q6_effective_for: {verdict: answered|partial|missing, evidence, ask}}}. The ask is what the owner should add to the BrainLift.', '{"questions":{"q4_entry_gate":{"verdict":"missing","ask":"state the mastery gate + threshold that starts a student"}}}', 'Drives the UI coverage chips and the one-action loop emails.')
on conflict (table_name, column_name) do update set definition = excluded.definition, example = excluded.example, business = excluded.business;

create or replace function update_project(p_slug text, fields jsonb, p_changed_by text)
returns jsonb language plpgsql security definer as $$
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
end $$;
revoke execute on function update_project(text, jsonb, text) from public, anon;
grant execute on function update_project(text, jsonb, text) to service_role;

create or replace function create_project(fields jsonb, p_changed_by text)
returns jsonb language plpgsql security definer as $$
declare
  new_id uuid;
  stage text;
  dup record;
begin
  select slug, name into dup from projects
   where lower(name) = lower(fields->>'name')
      or slug = fields->>'slug'
      or exists (select 1 from unnest(aliases) a where lower(a) = lower(fields->>'name'))
   limit 1;
  if dup.slug is not null then
    return jsonb_build_object('error',
      'possible duplicate: "' || (fields->>'name') || '" matches existing project ' || dup.slug || ' (' || dup.name || '). One project = one block of courses; if this is truly the same initiative, add the name to its aliases instead. To force-create, use a distinct name.');
  end if;

  perform set_config('app.changed_by', p_changed_by, true);
  insert into projects (slug, name, owner_id, sponsor_id, subject, grade_min, grade_max,
    supplements, deliverable, hole_filling, replaces, parent_summary,
    standards_covered, passes_test, entry_gate, xp_hours, effective_for,
    release_date, bottleneck, notes, created_by, aliases, brainlift_urls, github_repos)
  values (
    fields->>'slug', fields->>'name',
    (select id from people where name = fields->>'owner'),
    (select id from people where name = fields->>'sponsor'),
    fields->>'subject',
    (fields->>'grade_min')::int, (fields->>'grade_max')::int,
    fields->>'supplements', fields->>'deliverable', fields->>'hole_filling',
    fields->>'replaces', fields->>'parent_summary',
    fields->>'standards_covered', fields->>'passes_test', fields->>'entry_gate',
    fields->>'xp_hours', fields->>'effective_for',
    (fields->>'release_date')::date,
    fields->>'bottleneck', fields->>'notes', p_changed_by,
    coalesce((select array_agg(x) from jsonb_array_elements_text(fields->'aliases') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(fields->'brainlift_urls') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(fields->'github_repos') x), '{}'))
  returning id into new_id;
  foreach stage in array array[
    'plan_approved_by_ai','approved_by_learning_science','ready_for_students',
    'approved_by_andy','approved_by_campus_dris','approved_by_guides']
  loop
    insert into approvals (project_id, stage) values (new_id, stage);
  end loop;
  insert into change_log (table_name, row_id, field, new_value, changed_by)
  values ('projects', new_id, 'created', fields->>'slug', p_changed_by);
  return jsonb_build_object('id', new_id, 'slug', fields->>'slug');
end $$;
revoke execute on function create_project(jsonb, text) from public, anon;
grant execute on function create_project(jsonb, text) to service_role;

drop view if exists sy2026_27_changes;
drop view if exists project_gaps;
drop view if exists project_status;
create view project_status as
select
  p.id, p.slug, p.name, p.aliases, p.subject, p.grade_min, p.grade_max,
  po.name as owner, ps.name as sponsor,
  p.deliverable, p.replaces, p.hole_filling, p.supplements,
  p.parent_summary,
  p.standards_covered, p.passes_test, p.entry_gate, p.xp_hours, p.effective_for,
  p.release_date, p.bottleneck, p.notes, p.updated_at,
  p.brainlift_urls, p.github_repos, p.source_coverage,
  (select a.stage from approvals a
    where a.project_id = p.id and a.status = 'approved'
    order by array_position(array[
      'plan_approved_by_ai','approved_by_learning_science','ready_for_students',
      'approved_by_andy','approved_by_campus_dris','approved_by_guides'], a.stage) desc
    limit 1) as current_state,
  (select count(*) from approvals a
    where a.project_id = p.id and a.status = 'approved') as stages_approved
from projects p
left join people po on po.id = p.owner_id
left join people ps on ps.id = p.sponsor_id;

create view project_gaps as
select
  s.slug, s.name, s.owner, s.sponsor, s.subject,
  array_remove(array[
    case when coalesce(array_length(s.brainlift_urls, 1), 0) = 0 then 'brainlift link (THE one owner action — we fill the form from it)' end,
    case when coalesce(array_length(s.github_repos, 1), 0) = 0 then 'github repo link' end,
    case when s.parent_summary is null then 'parent_summary (FIRST requirement)' end,
    case when s.standards_covered is null then 'standards_covered (Q2)' end,
    case when s.passes_test is null then 'passes_test (Q3)' end,
    case when s.entry_gate is null then 'entry_gate (Q4)' end,
    case when s.xp_hours is null then 'xp_hours (Q5)' end,
    case when s.effective_for is null then 'effective_for (Q6)' end,
    case when s.owner   is null then 'owner' end,
    case when s.sponsor is null then 'sponsor' end,
    case when s.subject is null then 'subject' end,
    case when s.grade_min is null or s.grade_max is null then 'grade range' end,
    case when s.deliverable is null then 'deliverable' end,
    case when s.replaces is null then 'replaces' end,
    case when s.hole_filling is null then 'hole_filling' end,
    case when s.supplements is null then 'supplements' end,
    case when s.release_date is null then 'release_date' end,
    case when s.bottleneck is null then 'bottleneck' end
  ], null) as missing_fields,
  array_remove(array[
    case when s.parent_summary    like '[AI guess%' then 'parent_summary' end,
    case when s.standards_covered like '[AI guess%' then 'standards_covered' end,
    case when s.passes_test       like '[AI guess%' then 'passes_test' end,
    case when s.entry_gate        like '[AI guess%' then 'entry_gate' end,
    case when s.xp_hours          like '[AI guess%' then 'xp_hours' end,
    case when s.effective_for     like '[AI guess%' then 'effective_for' end,
    case when s.supplements       like '[AI guess%' then 'supplements' end,
    case when s.replaces          like '[AI guess%' then 'replaces' end
  ], null) as ai_guessed_fields
from project_status s;

create view sy2026_27_changes as
select * from project_status
where release_date is not null and release_date <= date '2026-08-01'
order by subject, grade_min;

grant select on project_status, project_gaps, sy2026_27_changes to anon;
-- log_project_changes: iterate every column dynamically instead of a
-- hardcoded list (which silently skipped aliases/brainlift_urls/
-- github_repos/source_coverage). Excluded keys are bookkeeping noise.
create or replace function log_project_changes()
returns trigger language plpgsql as $$
declare
  col text;
  oldv text;
  newv text;
begin
  for col in select jsonb_object_keys(to_jsonb(new))
  loop
    if col in ('id', 'created_at', 'created_by', 'updated_at') then continue; end if;
    oldv := to_jsonb(old)->>col;
    newv := to_jsonb(new)->>col;
    if oldv is distinct from newv then
      insert into change_log (table_name, row_id, field, old_value, new_value, changed_by)
      values ('projects', new.id, col, oldv, newv, coalesce(current_setting('app.changed_by', true), 'unknown'));
    end if;
  end loop;
  return new;
end $$;
