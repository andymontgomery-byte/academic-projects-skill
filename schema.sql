-- Academic Projects data source — schema.
--
-- One row per replacement project: an initiative that replaces an existing
-- app/course cell in the PowerPath course sequence with one that delivers
-- better academic outcomes. The field set IS the data dictionary from Andy's
-- Workflowy spec (78e12cec072f); the machine-readable dictionary lives in the
-- data_dictionary table so agents can answer "what do you do?" from the
-- database itself.
--
-- Empty fields are a feature, not an error: the whole point is publishing
-- data (or the lack of it) to each owner and sponsor so gaps are visible
-- without a project manager chasing anyone.

create table if not exists people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  email       text unique,
  team        text check (team in ('academics', 'learning-science', 'superbuilders', 'other')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists projects (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  name                  text not null,
  owner_id              uuid references people(id),
  sponsor_id            uuid references people(id),
  subject               text check (subject in
    ('Math', 'Reading', 'Language', 'Writing', 'Science', 'Vocabulary', 'Social Studies', 'FastMath')),
  grade_min             int check (grade_min between -1 and 12),
  grade_max             int check (grade_max between -1 and 12),
  main_course_sequence  text,
  needs_supplements     boolean,
  contains_supplements  boolean,
  supplements_notes     text,
  deliverable           text check (deliverable in ('app', 'course', 'both')),
  hole_filling          text,
  replaces              text,
  quantified_outcomes   text,
  xp                    text,
  parent_summary        text,
  release_date          date,
  bottleneck            text,
  notes                 text,
  created_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- The six approval stages of "current state", in order. One row per
-- project × stage; current state = the furthest consecutively-approved stage.
create table if not exists approvals (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  stage       text not null check (stage in (
    'plan_approved_by_ai',
    'approved_by_learning_science',
    'ready_for_students',
    'approved_by_andy',
    'approved_by_campus_dris',
    'approved_by_guides')),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by  text,
  notes       text,
  decided_at  timestamptz,
  unique (project_id, stage)
);

-- Every field-level change, so owners/sponsors fixing data leaves a trail.
create table if not exists change_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      uuid,
  field       text,
  old_value   text,
  new_value   text,
  changed_by  text,
  changed_at  timestamptz not null default now()
);

-- The data dictionary, in the database, so any agent can self-describe.
create table if not exists data_dictionary (
  table_name  text not null,
  column_name text not null,
  definition  text not null,
  example     text,
  primary key (table_name, column_name)
);

-- ── triggers ────────────────────────────────────────────────────────────────

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists projects_touch on projects;
create trigger projects_touch before update on projects
  for each row execute function touch_updated_at();

drop trigger if exists people_touch on people;
create trigger people_touch before update on people
  for each row execute function touch_updated_at();

-- Field-level change capture on projects (the accountability surface).
create or replace function log_project_changes() returns trigger as $$
declare
  col text;
  oldv text;
  newv text;
begin
  foreach col in array array[
    'name','subject','grade_min','grade_max','main_course_sequence',
    'needs_supplements','contains_supplements','supplements_notes',
    'deliverable','hole_filling','replaces','quantified_outcomes','xp',
    'parent_summary','release_date','bottleneck','notes','owner_id','sponsor_id']
  loop
    execute format('select ($1).%I::text, ($2).%I::text', col, col)
      into oldv, newv using old, new;
    if oldv is distinct from newv then
      insert into change_log (table_name, row_id, field, old_value, new_value, changed_by)
      values ('projects', new.id, col, oldv, newv, coalesce(current_setting('app.changed_by', true), 'unknown'));
    end if;
  end loop;
  return new;
end $$ language plpgsql;

drop trigger if exists projects_log on projects;
create trigger projects_log after update on projects
  for each row execute function log_project_changes();

-- ── views ───────────────────────────────────────────────────────────────────

-- One row per project with names resolved and current state derived.
create or replace view project_status as
select
  p.id, p.slug, p.name, p.subject, p.grade_min, p.grade_max,
  po.name as owner, ps.name as sponsor,
  p.deliverable, p.main_course_sequence, p.replaces, p.hole_filling,
  p.quantified_outcomes, p.xp, p.parent_summary,
  p.needs_supplements, p.contains_supplements, p.supplements_notes,
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

-- The north-star question: what changes to the course sequence will be ready
-- for students for the 2026-2027 school year (August 1st)?
create or replace view sy2026_27_changes as
select * from project_status
where release_date is not null and release_date <= date '2026-08-01'
order by subject, grade_min;

-- Gap report: which dictionary fields are missing per project, and who owns
-- fixing them. Publishing this to owners/sponsors is the core loop.
create or replace view project_gaps as
select
  s.slug, s.name, s.owner, s.sponsor, s.subject,
  array_remove(array[
    case when s.owner   is null then 'owner' end,
    case when s.sponsor is null then 'sponsor' end,
    case when s.subject is null then 'subject' end,
    case when s.grade_min is null or s.grade_max is null then 'grade range' end,
    case when s.main_course_sequence is null then 'main_course_sequence' end,
    case when s.needs_supplements is null then 'supplements' end,
    case when s.deliverable is null then 'deliverable' end,
    case when s.hole_filling is null then 'hole_filling' end,
    case when s.replaces is null then 'replaces' end,
    case when s.quantified_outcomes is null then 'quantified_outcomes' end,
    case when s.xp is null then 'xp' end,
    case when s.parent_summary is null then 'parent_summary' end,
    case when s.release_date is null then 'release_date' end,
    case when s.bottleneck is null then 'bottleneck' end
  ], null) as missing_fields
from project_status s;

-- ── row-level security ──────────────────────────────────────────────────────
-- anon key = read-only consumer path; service_role key (bypasses RLS) = the
-- owner/sponsor write path handed out privately.

alter table people enable row level security;
alter table projects enable row level security;
alter table approvals enable row level security;
alter table change_log enable row level security;
alter table data_dictionary enable row level security;

drop policy if exists anon_read_people on people;
create policy anon_read_people on people for select using (true);
drop policy if exists anon_read_projects on projects;
create policy anon_read_projects on projects for select using (true);
drop policy if exists anon_read_approvals on approvals;
create policy anon_read_approvals on approvals for select using (true);
drop policy if exists anon_read_change_log on change_log;
create policy anon_read_change_log on change_log for select using (true);
drop policy if exists anon_read_dictionary on data_dictionary;
create policy anon_read_dictionary on data_dictionary for select using (true);
