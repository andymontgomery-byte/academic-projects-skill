-- Alias registry (Andy 2026-07-14): one project = one block of courses in a
-- subject; external systems know it by other names. aliases makes the
-- collapse deterministic instead of judgment-per-seeding, and create-time
-- matching warns before a duplicate row is born.
alter table projects add column if not exists aliases text[] not null default '{}';

insert into data_dictionary (table_name, column_name, definition, example, business) values
('projects', 'aliases', 'Other names this same project goes by in external systems (Worksmart, email, vendor branding). One project = one block of courses per subject with a grade range; a new name for the same initiative belongs HERE, never in a new row.', '{Blu Math, LevelMath, Blu.School, Incept}', 'The anti-duplicate registry: check names against this before creating anything.')
on conflict (table_name, column_name) do update set definition = excluded.definition, example = excluded.example, business = excluded.business;

update projects set aliases = '{Blu Math, LevelMath, Blu.School, Incept, SuperBuilders Incept}' where slug = 'superbuilders-incept';
update projects set aliases = '{Playcademy: Math Quest, MathQuest, Math Quest}' where slug = 'math-quest';
update projects set aliases = '{Alpha Phonics, AlphaPhonics, Early Reading (phonics), UFLI app, Mentava replacement}' where slug = 'alphaphonics-early-reading';
update projects set aliases = '{AlphaPhonics testing app, Acadience screeners, Literably replacement, Early Reading (screeners)}' where slug = 'alphaphonics-assessments';
update projects set aliases = '{Astro Math, Playcademy: Astro Math, FastMath 6-12}' where slug = 'fastmath-6-12';
update projects set aliases = '{LANGHF, Language Hole-Filling, G3LANGHF-G12LANGHF}' where slug = 'language-hole-filling';
update projects set aliases = '{Alpha Common Core, Math K-8 CCSS test banks, Alpha CCSS Grade Tests}' where slug = 'alpha-ccss-tests';
update projects set aliases = '{PhysicsGraph, Physics Graph, Lemnisket AP Physics}' where slug = 'physicsgraph-ap';
update projects set aliases = '{AlphaTok, AlphaTok Social Studies}' where slug = 'alphatok-social-studies';
update projects set aliases = '{TimeBack Math, Timeback Math hole-filling}' where slug = 'timeback-math';

-- create_project gains a duplicate guard: reject when the proposed name or
-- slug matches an existing project's name, slug, or alias (case-insensitive).
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
    release_date, bottleneck, notes, created_by, aliases)
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
    coalesce((select array_agg(x) from jsonb_array_elements_text(fields->'aliases') x), '{}'))
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
