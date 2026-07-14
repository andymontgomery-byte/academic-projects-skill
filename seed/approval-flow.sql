-- Approval workflow enforcement (Andy, 2026-07-14):
--   1. plan_approved_by_ai is a COMPUTED gate — only ai_review_project() can
--      decide it, and it decides from the data (complete plan + quantified
--      promise), never from a human click.
--   2. Stages are strictly sequential: a stage can be decided only when
--      every earlier stage is approved. Enforced here so the UI, scripts,
--      and any future client all obey.

create or replace function ai_review_project(p_slug text, p_changed_by text)
returns jsonb language plpgsql security definer as $$
declare
  p record;
  missing text[] := '{}';
  verdict text;
  feedback text;
begin
  select * into p from projects where slug = p_slug;
  if p.id is null then
    return jsonb_build_object('error', 'no project with slug ' || p_slug);
  end if;

  -- The plan IS the filled-in row. Every dictionary field must be answered.
  if p.owner_id is null then missing := array_append(missing, 'owner'::text); end if;
  if p.sponsor_id is null then missing := array_append(missing, 'sponsor'::text); end if;
  if p.subject is null then missing := array_append(missing, 'subject'::text); end if;
  if p.grade_min is null or p.grade_max is null then missing := array_append(missing, 'grade range'::text); end if;
  if p.main_course_sequence is null then missing := array_append(missing, 'main_course_sequence'::text); end if;
  if p.needs_supplements is null then missing := array_append(missing, 'needs_supplements'::text); end if;
  if p.deliverable is null then missing := array_append(missing, 'deliverable'::text); end if;
  if p.hole_filling is null then missing := array_append(missing, 'hole_filling'::text); end if;
  if p.replaces is null then missing := array_append(missing, 'replaces'::text); end if;
  if p.quantified_outcomes is null then missing := array_append(missing, 'quantified_outcomes'::text); end if;
  if p.xp is null then missing := array_append(missing, 'xp'::text); end if;
  if p.parent_summary is null then missing := array_append(missing, 'parent_summary'::text); end if;
  if p.release_date is null then missing := array_append(missing, 'release_date'::text); end if;
  if p.bottleneck is null then missing := array_append(missing, 'bottleneck'::text); end if;
  if p.quantified_outcomes is not null and p.quantified_outcomes !~ '\d' then
    missing := array_append(missing, 'quantified_outcomes has no number — a promise you cannot measure is not quantified'::text);
  end if;

  if cardinality(missing) = 0 then
    verdict := 'approved';
    feedback := 'Plan complete: every dictionary field answered and the outcomes promise is quantified.';
  else
    verdict := 'rejected';
    feedback := 'Fix and re-run the AI review: ' || array_to_string(missing, '; ');
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

-- Strict-sequence decide_stage. Stage 1 is refused outright (AI-only);
-- any other stage requires all earlier stages approved.
create or replace function decide_stage(p_slug text, p_stage text, p_status text, p_decided_by text, p_notes text default null)
returns jsonb language plpgsql security definer as $$
declare
  pid uuid;
  stage_order text[] := array['plan_approved_by_ai','approved_by_learning_science','ready_for_students','approved_by_andy','approved_by_campus_dris','approved_by_guides'];
  idx int;
  blockers text;
begin
  select id into pid from projects where slug = p_slug;
  if pid is null then
    return jsonb_build_object('error', 'no project with slug ' || p_slug);
  end if;

  if p_stage = 'plan_approved_by_ai' then
    return jsonb_build_object('error', 'plan_approved_by_ai is decided by the AI review only — fill the plan and run ai_review');
  end if;

  idx := array_position(stage_order, p_stage);
  if idx is null then
    return jsonb_build_object('error', 'unknown stage ' || p_stage);
  end if;

  select string_agg(a.stage, ', ') into blockers
  from approvals a
  where a.project_id = pid
    and array_position(stage_order, a.stage) < idx
    and a.status is distinct from 'approved';
  if blockers is not null then
    return jsonb_build_object('error', 'stages are sequential — still not approved: ' || blockers);
  end if;

  update approvals set status = p_status, decided_by = p_decided_by,
    notes = coalesce(p_notes, notes), decided_at = now()
  where project_id = pid and stage = p_stage;
  insert into change_log (table_name, row_id, field, new_value, changed_by)
  values ('approvals', pid, p_stage, p_status, p_decided_by);
  return jsonb_build_object('slug', p_slug, 'stage', p_stage, 'status', p_status);
end $$;

revoke execute on function decide_stage(text, text, text, text, text) from public, anon;
grant execute on function decide_stage(text, text, text, text, text) to service_role;
