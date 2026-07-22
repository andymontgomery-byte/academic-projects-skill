-- Partner teams in people.team — Andy 2026-07-22: PhysicsGraph is a
-- 3rd-party PARTNER team, distinct from SuperBuilders; the naming-convention
-- team list (Alpha[Subject] by [Team]) also names Vaidik and LearnWithAI.
-- Widen the check so partner teams are first-class instead of 'other'.
ALTER TABLE people DROP CONSTRAINT people_team_check;
ALTER TABLE people ADD CONSTRAINT people_team_check
  CHECK (team = ANY (ARRAY[
    'academics'::text, 'learning-science'::text, 'superbuilders'::text,
    'physicsgraph'::text, 'vaidik'::text, 'learnwithai'::text,
    'other'::text
  ]));

UPDATE people SET team = 'physicsgraph',
  notes = coalesce(notes || chr(10), '') ||
    'PhysicsGraph is a 3rd-party partner team - distinct from SuperBuilders (Andy 2026-07-22)'
WHERE name = 'PhysicsGraph team (Chris Sutherland)';
