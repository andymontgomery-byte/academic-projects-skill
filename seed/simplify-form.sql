-- Form de-duplication (Andy, 2026-07-14): the owner form asks each thing
-- exactly once.
--   xp                    → gone (Q5 xp_hours covers XP/min + farmability)
--   quantified_outcomes   → gone (Q3 passes_test IS the quantified promise;
--                           its definition now asks for the vs-replaces delta)
--   main_course_sequence  → merged into replaces ("what it replaces & where
--                           it lands"), then dropped
--   needs/contains_supplements + supplements_notes → one text field:
--                           supplements ("does it need them? contain them? which?")

drop view if exists sy2026_27_changes;
drop view if exists project_gaps;
drop view if exists project_status;

update projects set replaces =
  case
    when replaces is null then main_course_sequence
    when main_course_sequence is null then replaces
    else replaces || E'\n\nWhere it lands: ' || main_course_sequence
  end
where main_course_sequence is not null;

alter table projects rename column supplements_notes to supplements;
alter table projects drop column if exists xp;
alter table projects drop column if exists quantified_outcomes;
alter table projects drop column if exists main_course_sequence;
alter table projects drop column if exists needs_supplements;
alter table projects drop column if exists contains_supplements;

delete from data_dictionary where table_name = 'projects'
  and column_name in ('xp','quantified_outcomes','main_course_sequence','needs_supplements','contains_supplements','supplements_notes');
insert into data_dictionary (table_name, column_name, definition, example, business) values
('projects', 'supplements', 'Does the course sequence need supplements alongside this? Does the project contain them? Which?', 'contains a daily fluency supplement; no external supplements needed', 'One answer: the supplement story.'),
('projects', 'replaces', 'What it replaces in the current production stack, and where it lands in the sequence (which subject×grade cells: base / hole-filling / supplement / test).', 'Replaces Zearn G3 base and Math Academy G5 base', 'What students stop using the day this lands, and where the new thing sits.')
on conflict (table_name, column_name) do update set definition = excluded.definition, example = excluded.example, business = excluded.business;
update data_dictionary
   set definition = 'Q3: what standardized test (that parents will recognize or can look up) will students pass, at what threshold, after completing the course(s) and all the course(s)'' mastery gates — and how does that compare with what it replaces (score or hours delta)? This IS the quantified outcome promise; it must contain numbers.'
 where table_name = 'projects' and column_name = 'passes_test';

create or replace function create_project(fields jsonb, p_changed_by text)
returns jsonb language plpgsql security definer as $$
declare
  new_id uuid;
  stage text;
begin
  perform set_config('app.changed_by', p_changed_by, true);
  insert into projects (slug, name, owner_id, sponsor_id, subject, grade_min, grade_max,
    supplements, deliverable, hole_filling, replaces, parent_summary,
    standards_covered, passes_test, entry_gate, xp_hours, effective_for,
    release_date, bottleneck, notes, created_by)
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
    fields->>'bottleneck', fields->>'notes', p_changed_by)
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
    notes             = coalesce(fields->>'notes', notes)
  where slug = p_slug
  returning * into r;
  if r.id is null then
    return jsonb_build_object('error', 'no project with slug ' || p_slug);
  end if;
  return jsonb_build_object('id', r.id, 'slug', r.slug, 'updated', true);
end $$;
revoke execute on function update_project(text, jsonb, text) from public, anon;
grant execute on function update_project(text, jsonb, text) to service_role;

drop view if exists sy2026_27_changes;
drop view if exists project_gaps;
drop view if exists project_status;
create view project_status as
select
  p.id, p.slug, p.name, p.subject, p.grade_min, p.grade_max,
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

create or replace function ai_review_project(p_slug text, p_changed_by text)
returns jsonb language plpgsql security definer as $$
declare
  p record;
  missing text[] := '{}';
  guessed text[] := '{}';
  jargon text[] := '{}';
  term text;
  verdict text;
  feedback text;
begin
  select * into p from projects where slug = p_slug;
  if p.id is null then
    return jsonb_build_object('error', 'no project with slug ' || p_slug);
  end if;

  if p.subject is null then missing := array_append(missing, 'Q1: subject'::text); end if;
  if p.grade_min is null or p.grade_max is null then missing := array_append(missing, 'Q1: grade range'::text); end if;
  if p.standards_covered is null then missing := array_append(missing, 'Q2 unanswered: what 3rd-party standards does it cover — and NOT cover?'::text); end if;
  if p.passes_test is null then missing := array_append(missing, 'Q3 unanswered: what parent-recognizable test at what threshold, and how does that compare with what it replaces?'::text); end if;
  if p.passes_test is not null and p.passes_test !~ '\d' then missing := array_append(missing, 'Q3 has no numbers — this is the quantified outcome promise'::text); end if;
  if p.entry_gate is null then missing := array_append(missing, 'Q4 unanswered: what mastery gate at what threshold to start?'::text); end if;
  if p.xp_hours is null then missing := array_append(missing, 'Q5 unanswered: XP hours (median / knows-all / knows-nothing), XP per focused minute, farmability'::text); end if;
  if p.xp_hours is not null and p.xp_hours !~ '\d' then missing := array_append(missing, 'Q5 has no numbers'::text); end if;
  if p.effective_for is null then missing := array_append(missing, 'Q6 unanswered: which students, incl. named Alpha students with 1-2 week falsifiable hypotheses'::text); end if;

  if p.parent_summary is null then
    missing := array_append(missing, 'parent_summary — the FIRST requirement: rephrase the six answers in plain parent language (Scribble is the register)'::text);
  else
    foreach term in array array['HMG','hole-filling','hole filling','PowerPath','QTI','OneRoster','sourcedId','app-stack','ALI'] loop
      if p.parent_summary ilike '%' || term || '%' then
        jargon := array_append(jargon, term);
      end if;
    end loop;
    if cardinality(jargon) > 0 then
      missing := array_append(missing, ('parent_summary uses internal jargon (' || array_to_string(jargon, ', ') || ') — it must read simply for parents')::text);
    end if;
  end if;

  if p.owner_id is null then missing := array_append(missing, 'owner'::text); end if;
  if p.sponsor_id is null then missing := array_append(missing, 'sponsor'::text); end if;
  if p.deliverable is null then missing := array_append(missing, 'deliverable'::text); end if;
  if p.replaces is null then missing := array_append(missing, 'replaces'::text); end if;
  if p.hole_filling is null then missing := array_append(missing, 'hole_filling'::text); end if;
  if p.supplements is null then missing := array_append(missing, 'supplements'::text); end if;
  if p.release_date is null then missing := array_append(missing, 'release_date'::text); end if;
  if p.bottleneck is null then missing := array_append(missing, 'bottleneck'::text); end if;

  foreach term in array array['standards_covered','passes_test','entry_gate','xp_hours','effective_for','parent_summary','supplements','replaces'] loop
    if (to_jsonb(p)->>term) like '[AI guess%' then guessed := array_append(guessed, term); end if;
  end loop;

  if cardinality(missing) = 0 and cardinality(guessed) = 0 then
    verdict := 'approved';
    feedback := 'Plan complete: six questions answered, parent summary rephrases them cleanly, no unverified AI guesses.';
  elsif cardinality(missing) = 0 then
    verdict := 'rejected';
    feedback := 'Owner must verify the AI-guessed answers (edit or remove the [AI guess — verify] prefix): ' || array_to_string(guessed, ', ');
  else
    verdict := 'rejected';
    feedback := 'Fix and re-run the AI review: ' || array_to_string(missing, '; ');
    if cardinality(guessed) > 0 then
      feedback := feedback || '. Also verify AI-guessed: ' || array_to_string(guessed, ', ');
    end if;
  end if;

  update approvals set status = verdict,
    decided_by = 'AI review (deterministic; requested by ' || p_changed_by || ')',
    notes = feedback, decided_at = now()
  where project_id = p.id and stage = 'plan_approved_by_ai';

  insert into change_log (table_name, row_id, field, new_value, changed_by)
  values ('approvals', p.id, 'plan_approved_by_ai', verdict || ' — ' || feedback, 'AI review (requested by ' || p_changed_by || ')');

  return jsonb_build_object('slug', p_slug, 'stage', 'plan_approved_by_ai', 'status', verdict, 'feedback', feedback);
end $$;
revoke execute on function ai_review_project(text, text) from public, anon;
grant execute on function ai_review_project(text, text) to service_role;

grant select on project_status, project_gaps, sy2026_27_changes to anon;
