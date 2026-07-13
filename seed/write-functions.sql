-- Attributed write path. Owners/sponsors (via any agent holding the write
-- key) create and fix data through these functions so change_log always
-- records WHO. Direct table writes stay possible with the service key but
-- log changed_by='unknown' — use the functions.

create or replace function create_project(fields jsonb, p_changed_by text)
returns jsonb language plpgsql security definer as $$
declare
  new_id uuid;
  stage text;
begin
  perform set_config('app.changed_by', p_changed_by, true);
  insert into projects (slug, name, owner_id, sponsor_id, subject, grade_min, grade_max,
    main_course_sequence, needs_supplements, contains_supplements, supplements_notes,
    deliverable, hole_filling, replaces, quantified_outcomes, xp, parent_summary,
    release_date, bottleneck, notes, created_by)
  values (
    fields->>'slug', fields->>'name',
    (select id from people where name = fields->>'owner'),
    (select id from people where name = fields->>'sponsor'),
    fields->>'subject',
    (fields->>'grade_min')::int, (fields->>'grade_max')::int,
    fields->>'main_course_sequence',
    (fields->>'needs_supplements')::boolean, (fields->>'contains_supplements')::boolean,
    fields->>'supplements_notes', fields->>'deliverable', fields->>'hole_filling',
    fields->>'replaces', fields->>'quantified_outcomes', fields->>'xp',
    fields->>'parent_summary', (fields->>'release_date')::date,
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

create or replace function update_project(p_slug text, fields jsonb, p_changed_by text)
returns jsonb language plpgsql security definer as $$
declare
  r record;
begin
  perform set_config('app.changed_by', p_changed_by, true);
  update projects set
    name                 = coalesce(fields->>'name', name),
    owner_id             = case when fields ? 'owner'   then (select id from people where name = fields->>'owner')   else owner_id end,
    sponsor_id           = case when fields ? 'sponsor' then (select id from people where name = fields->>'sponsor') else sponsor_id end,
    subject              = coalesce(fields->>'subject', subject),
    grade_min            = coalesce((fields->>'grade_min')::int, grade_min),
    grade_max            = coalesce((fields->>'grade_max')::int, grade_max),
    main_course_sequence = coalesce(fields->>'main_course_sequence', main_course_sequence),
    needs_supplements    = coalesce((fields->>'needs_supplements')::boolean, needs_supplements),
    contains_supplements = coalesce((fields->>'contains_supplements')::boolean, contains_supplements),
    supplements_notes    = coalesce(fields->>'supplements_notes', supplements_notes),
    deliverable          = coalesce(fields->>'deliverable', deliverable),
    hole_filling         = coalesce(fields->>'hole_filling', hole_filling),
    replaces             = coalesce(fields->>'replaces', replaces),
    quantified_outcomes  = coalesce(fields->>'quantified_outcomes', quantified_outcomes),
    xp                   = coalesce(fields->>'xp', xp),
    parent_summary       = coalesce(fields->>'parent_summary', parent_summary),
    release_date         = coalesce((fields->>'release_date')::date, release_date),
    bottleneck           = coalesce(fields->>'bottleneck', bottleneck),
    notes                = coalesce(fields->>'notes', notes)
  where slug = p_slug
  returning * into r;
  if r.id is null then
    return jsonb_build_object('error', 'no project with slug ' || p_slug);
  end if;
  return jsonb_build_object('id', r.id, 'slug', r.slug, 'updated', true);
end $$;

create or replace function decide_stage(p_slug text, p_stage text, p_status text, p_decided_by text, p_notes text default null)
returns jsonb language plpgsql security definer as $$
declare
  pid uuid;
begin
  select id into pid from projects where slug = p_slug;
  if pid is null then
    return jsonb_build_object('error', 'no project with slug ' || p_slug);
  end if;
  update approvals set status = p_status, decided_by = p_decided_by,
    notes = coalesce(p_notes, notes), decided_at = now()
  where project_id = pid and stage = p_stage;
  insert into change_log (table_name, row_id, field, new_value, changed_by)
  values ('approvals', pid, p_stage, p_status, p_decided_by);
  return jsonb_build_object('slug', p_slug, 'stage', p_stage, 'status', p_status);
end $$;

create or replace function upsert_person(p_name text, p_email text, p_team text, p_changed_by text)
returns jsonb language plpgsql security definer as $$
declare
  pid uuid;
begin
  insert into people (name, email, team)
  values (p_name, p_email, p_team)
  on conflict (name) do update
    set email = coalesce(excluded.email, people.email),
        team  = coalesce(excluded.team, people.team)
  returning id into pid;
  return jsonb_build_object('id', pid, 'name', p_name);
end $$;

-- Write functions are for key-holders only, not the public anon key.
revoke execute on function create_project(jsonb, text) from anon;
revoke execute on function update_project(text, jsonb, text) from anon;
revoke execute on function decide_stage(text, text, text, text, text) from anon;
revoke execute on function upsert_person(text, text, text, text) from anon;
