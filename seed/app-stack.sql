-- The app-stack matrix: which app fills each role of a subject×grade cell,
-- per era (old / now / next school year). Ingested 2026-07-13 from Andy's
-- "Math K-8 App Stack — Old / Now / Next" sheet. The Now→Next diff is the
-- direct answer to the north-star question for a subject.

create table if not exists app_stack (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null check (subject in
    ('Math', 'Reading', 'Language', 'Writing', 'Science', 'Vocabulary', 'Social Studies', 'FastMath')),
  grade        int not null check (grade between -1 and 12),
  era          text not null check (era in ('old', 'now', 'next')),
  role         text not null check (role in ('base', 'hole_filling', 'supplement', 'test', 'supplement_test')),
  app          text,
  detail       text,
  project_slug text,
  source       text,
  updated_at   timestamptz not null default now(),
  unique (subject, grade, era, role)
);

alter table app_stack enable row level security;
drop policy if exists anon_read_app_stack on app_stack;
create policy anon_read_app_stack on app_stack for select using (true);

drop trigger if exists app_stack_touch on app_stack;
create trigger app_stack_touch before update on app_stack
  for each row execute function touch_updated_at();

create or replace function set_stack_cell(
  p_subject text, p_grade int, p_era text, p_role text,
  p_app text, p_detail text, p_project_slug text, p_source text, p_changed_by text)
returns jsonb language plpgsql security definer as $$
declare
  cell_id uuid;
begin
  insert into app_stack (subject, grade, era, role, app, detail, project_slug, source)
  values (p_subject, p_grade, p_era, p_role, p_app, p_detail, p_project_slug, p_source)
  on conflict (subject, grade, era, role) do update
    set app = excluded.app, detail = excluded.detail,
        project_slug = coalesce(excluded.project_slug, app_stack.project_slug),
        source = excluded.source
  returning id into cell_id;
  insert into change_log (table_name, row_id, field, new_value, changed_by)
  values ('app_stack', cell_id, p_subject || ' G' || p_grade || ' ' || p_era || '/' || p_role, p_app, p_changed_by);
  return jsonb_build_object('id', cell_id);
end $$;

revoke execute on function set_stack_cell(text, int, text, text, text, text, text, text, text) from public, anon;
grant execute on function set_stack_cell(text, int, text, text, text, text, text, text, text) to service_role;

-- Now → Next diff per subject×grade×role: what actually changes for the
-- coming school year. supplement_test only exists in 'next', so the left
-- join surfaces it as an addition (now_app null).
create or replace view stack_changes as
select
  n.subject, n.grade, n.role,
  o.app  as now_app,
  n.app  as next_app,
  n.detail, n.project_slug, n.source
from app_stack n
left join app_stack o
  on o.subject = n.subject and o.grade = n.grade and o.role = n.role and o.era = 'now'
where n.era = 'next'
  and o.app is distinct from n.app
order by n.subject, n.grade,
  array_position(array['base','hole_filling','test','supplement','supplement_test'], n.role);

insert into data_dictionary (table_name, column_name, definition, example) values
('app_stack', 'subject', 'Subject of the stack cell (same canonical list as projects).', 'Math'),
('app_stack', 'grade', 'Grade level (-1 = PK, 0 = K, 1-12).', '3'),
('app_stack', 'era', 'old = last year''s stack, now = current production, next = next school year, shipped by August 1.', 'next'),
('app_stack', 'role', 'What the app does in the cell: base course, hole_filling, supplement, test (mastery gate), or supplement_test.', 'hole_filling'),
('app_stack', 'app', 'The app/product filling the role. NULL = explicitly nothing.', 'TimeBack Math 3'),
('app_stack', 'detail', 'Free-text nuance for the cell.', 'Math Cakes 3 → TEKS'),
('app_stack', 'project_slug', 'The replacement project delivering this next-era cell, once linked.', 'superbuilders-incept'),
('app_stack', 'source', 'Provenance of the cell value.', 'math-sheet screenshot 2026-07-13')
on conflict (table_name, column_name) do update set definition = excluded.definition, example = excluded.example;
