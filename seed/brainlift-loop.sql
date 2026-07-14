-- Alignment with the "Data Source Skills (old AI-PI)" doctrine (Andy's shared
-- Workflowy, read via screenshot 2026-07-13):
--   1. Data dictionary gets TWO surfaces: technical (definition) +
--      product-manager/business (business) — both describe to the calling
--      LLM what the data can do and how to use it.
--   2. BrainLift: the business insights on top of the raw data, in the
--      database, so a calling LLM can ask "what do you do and what is the
--      best way to use you?" and get business context.
--   3. Self-improvement loop: calling LLMs (and humans) file stack-ranked
--      requests to improve the data.

alter table data_dictionary add column if not exists business text;

update data_dictionary set business = v.b from (values
  ('projects', 'owner_id', 'The one person on the hook for students actually getting this.'),
  ('projects', 'sponsor_id', 'The Learning Science reviewer whose sign-off comes before Andy''s.'),
  ('projects', 'deliverable', 'Are we shipping new software, new curriculum, or both? course = rides an existing app; app = new software for existing content.'),
  ('projects', 'quantified_outcomes', 'The promise to students, in numbers — how much faster or better than the thing it replaces. No number = no promise.'),
  ('projects', 'release_date', 'The owner''s public commitment for when students get it (all six approvals done).'),
  ('projects', 'bottleneck', 'The one thing leadership could remove to make this ship faster.'),
  ('projects', 'replaces', 'What students stop using the day this lands.'),
  ('app_stack', 'era', 'old = last school year, now = what students use today, next = what must be live on August 1.'),
  ('app_stack', 'role', 'The job in the cell: daily course (base), remediation after a failed gate (hole_filling), extra practice (supplement), or the gate itself (test).')
) as v(t, c, b)
where data_dictionary.table_name = v.t and data_dictionary.column_name = v.c;

create table if not exists brainlift (
  id         uuid primary key default gen_random_uuid(),
  ord        int not null,
  insight    text not null,
  source     text,
  created_at timestamptz not null default now()
);
alter table brainlift enable row level security;
drop policy if exists anon_read_brainlift on brainlift;
create policy anon_read_brainlift on brainlift for select using (true);

delete from brainlift;
insert into brainlift (ord, insight, source) values
(1, 'Academic Projects replace existing app/course cells in the PowerPath course sequence with apps/courses that deliver better academic outcomes. This database is the agreed master data source for all of them.', 'Workflowy spec 78e12cec072f'),
(2, 'The north-star question: what are the changes to the course sequence for the 2026-2027 school year that will be ready for students on August 1st? Answer = sy2026_27_changes (projects) + stack_changes (per-cell now→next diff).', 'Workflowy spec 78e12cec072f'),
(3, 'Gaps are the product. Publishing missing/incorrect data to each subject owner and Learning Science sponsor is how it gets fixed — owners and sponsors fix the data themselves, no project managers tracking anyone down.', 'Workflowy spec 78e12cec072f'),
(4, 'Delivering for students is its own best reward: this source highlights successes AND failures in delivering better learning outcomes. Do not soften either.', 'Workflowy spec 78e12cec072f'),
(5, 'This is a raw data source, not a translated one. Frontier AI reasons under uncertainty with incomplete data better than any human — hand the calling LLM pure data, never interpretation layered on top.', 'Data Source Skills (old AI-PI)'),
(6, 'The current production course sequence (what "now" means, and what projects replace) is live at https://timeback-loops-k8.vercel.app/course-sequence.', 'course-sequence grid'),
(7, 'Approval flow, in order: plan_approved_by_ai → approved_by_learning_science → ready_for_students (owner) → approved_by_andy → approved_by_campus_dris → approved_by_guides. release_date is the owner''s prediction of all-approved.', 'Workflowy spec 78e12cec072f'),
(8, 'Improve me: file improvement_requests rows (any calling LLM or human can). They are stack-ranked and worked as the data source''s own improvement loop.', 'Data Source Skills (old AI-PI)'),
(9, 'Every course must answer five questions (the parent/customer summary is these answers in prose): subject+grades covered; the parent-recognizable standardized test passed at what threshold on completion; the entry mastery gate and threshold; XP hours to complete (median / knows-it-all / knows-nothing entrant, XP per focused minute, whether XP is farmable); and which students it works for — named Alpha students with 1-2 week falsifiable hypotheses.', 'Questions every course needs to answer — WF 82041e9b (BrainLifts, Academics Root)');

create table if not exists improvement_requests (
  id           uuid primary key default gen_random_uuid(),
  request      text not null,
  requested_by text not null,
  stack_rank   int,
  status       text not null default 'open' check (status in ('open', 'planned', 'done', 'rejected')),
  notes        text,
  created_at   timestamptz not null default now()
);
alter table improvement_requests enable row level security;
drop policy if exists anon_read_requests on improvement_requests;
create policy anon_read_requests on improvement_requests for select using (true);
-- The loop takes in requests from calling LLMs: the read key may INSERT here
-- (and only here). Ranking/closing stays with the write key.
drop policy if exists anon_file_request on improvement_requests;
create policy anon_file_request on improvement_requests for insert with check (true);

create or replace function set_request_status(p_id uuid, p_status text, p_stack_rank int, p_notes text, p_changed_by text)
returns jsonb language plpgsql security definer as $$
begin
  update improvement_requests
    set status = p_status, stack_rank = coalesce(p_stack_rank, stack_rank), notes = coalesce(p_notes, notes)
    where id = p_id;
  insert into change_log (table_name, row_id, field, new_value, changed_by)
  values ('improvement_requests', p_id, 'status', p_status, p_changed_by);
  return jsonb_build_object('id', p_id, 'status', p_status);
end $$;
revoke execute on function set_request_status(uuid, text, int, text, text) from public, anon;
grant execute on function set_request_status(uuid, text, int, text, text) to service_role;

insert into data_dictionary (table_name, column_name, definition, example, business) values
('brainlift', 'insight', 'One business insight on top of the raw data; ordered by ord.', null, 'Read all of these first — they are how you understand what this data source is for.'),
('improvement_requests', 'request', 'A request from a calling LLM or human to improve this data source.', 'Add a Reading app-stack matrix', 'The self-improvement loop: anyone using the source can ask it to get better; requests get stack-ranked.'),
('improvement_requests', 'stack_rank', 'Priority order set by the maintainers; lower = sooner.', '1', null),
('improvement_requests', 'status', 'open, planned, done, or rejected.', 'open', null)
on conflict (table_name, column_name) do update
  set definition = excluded.definition, example = excluded.example, business = excluded.business;
