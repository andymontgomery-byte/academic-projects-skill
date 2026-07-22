-- approved_by_ruchi — the academics-team "100% ready for real students"
-- verdict shown in /sy-diff's Ruchi column (spec 2026-07-22).
--
-- Andy ruling 2026-07-22: "Wait until you see an email from Ruchi to me
-- approving something before you mark any Ruchi-approved greens."
-- So this stage is EMAIL-GATED and stands OUTSIDE the implied cascade:
--   * it may only be recorded from an actual email from Ruchi to Andy,
--     quoted in notes and attributed in decided_by;
--   * decide_stage's stage_order does NOT include it, so no other stage
--     (including approved_by_andy) ever implies it, and approving it
--     implies nothing else. ready_for_students remains the OWNER's
--     attestation and no longer feeds the Ruchi column.
ALTER TABLE approvals DROP CONSTRAINT approvals_stage_check;
ALTER TABLE approvals ADD CONSTRAINT approvals_stage_check
  CHECK (stage = ANY (ARRAY[
    'plan_approved_by_ai'::text,
    'approved_by_learning_science'::text,
    'ready_for_students'::text,
    'approved_by_andy'::text,
    'approved_by_campus_dris'::text,
    'approved_by_guides'::text,
    'approved_by_ruchi'::text
  ]));

INSERT INTO data_dictionary (table_name, column_name, definition, example, business)
VALUES ('approvals', 'stage=approved_by_ruchi',
  'text — academics-team ready-for-real-students verdict (the /sy-diff Ruchi column)',
  'approved',
  'Email-gated: recorded ONLY from an email from Ruchi to Andy approving it (quoted in notes); never implied by any other stage, implies nothing')
ON CONFLICT DO NOTHING;
