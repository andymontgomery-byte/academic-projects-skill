-- The data dictionary, loaded into the database itself. Definitions come
-- from Andy's Workflowy spec (Academic Projects - Data Source Skill,
-- 78e12cec072f, read 2026-07-13). Edit there first, here second.

delete from data_dictionary;
insert into data_dictionary (table_name, column_name, definition, example) values
('projects', 'slug', 'Stable short handle for the project; never changes once created.', 'superbuilders-incept'),
('projects', 'name', 'The project''s working name.', 'SuperBuilders Incept'),
('projects', 'owner_id', 'Owner — responsible for getting it high quality into the hands of students.', 'Liwei'),
('projects', 'sponsor_id', 'Sponsor — the Learning Science team member who gave the spec and reviews before Andy.', 'LS John'),
('projects', 'subject', 'The subject the replacement covers. One of: Math, Reading, Language, Writing, Science, Vocabulary, Social Studies, FastMath.', 'Math'),
('projects', 'grade_min', 'Lowest grade level covered (-1 = PK, 0 = K, 1-12).', '3'),
('projects', 'grade_max', 'Highest grade level covered (-1 = PK, 0 = K, 1-12).', '8'),
('projects', 'main_course_sequence', 'How this lands in the main PowerPath course sequence: which subject×grade cells it fills and what the sequence looks like with it in place.', 'Replaces the G3-8 Math main-sequence courses'),
('projects', 'needs_supplements', 'Does the course sequence need supplements alongside this project?', 'false'),
('projects', 'contains_supplements', 'Does the project itself contain supplements?', 'true'),
('projects', 'supplements_notes', 'Detail on the supplements answer.', 'Includes daily fluency supplement'),
('projects', 'deliverable', 'App, course, or both. Just course = delivered by an existing app. Just app = a new app delivering existing course content/curriculum in TimeBack.', 'both'),
('projects', 'hole_filling', 'What hole-filling looks like when students don''t pass the test.', 'Per-standard remediation lessons generated from the failed gate'),
('projects', 'replaces', 'What it replaces in the current production stack (see the live course-sequence grid).', 'TEKS Math G3-8 (TimeBack) + Math Academy'),
('projects', 'quantified_outcomes', 'Quantified learning outcomes (test scores, or time to end-of-grade mastery-gate pass) compared with what it replaces.', 'EOG mastery gate passed at 90% accuracy in 5 fewer hours because initial practice has twice as many questions'),
('projects', 'xp', 'XP design: how the project awards XP.', '10 XP per lesson, 70 XP per unit'),
('projects', 'parent_summary', 'Parent and customer facing summary. Must answer the five questions from the "Questions every course needs to answer" brainlift (canonical: Workflowy 82041e9b-aac7-b393-ce2f-929b0e407c72, BrainLifts / Academics Root): (1) subject and grade levels covered; (2) what parent-recognizable standardized test students pass at what threshold on completion; (3) what mastery gate at what threshold to START; (4) XP hours to complete — median / already-knows-it / passed-entry-knows-nothing, XP per focused minute, can students farm XP; (5) which students it is effective for — in general AND named Alpha students, each with a 1-2 week time-bound falsifiable hypothesis.', 'Scribble: any student who can print, ~16 XP hours (12-22), exits writing cursive at 25 wpm at Zaner-Bloser Excellent'),
('projects', 'release_date', 'Owner''s prediction of when it will be in the hands of students because it was approved by all.', '2026-08-01'),
('projects', 'bottleneck', 'If you could wave a magic wand and solve one problem, what would it be?', 'QTI item authoring throughput'),
('projects', 'notes', 'Anything that doesn''t fit the structured fields.', null),
('projects', 'created_by', 'Who created the project row.', 'andy.montgomery@alpha.school'),
('approvals', 'stage', 'The six current-state stages, in order: plan_approved_by_ai, approved_by_learning_science, ready_for_students (owner approval), approved_by_andy, approved_by_campus_dris, approved_by_guides.', 'approved_by_learning_science'),
('approvals', 'status', 'pending, approved, or rejected.', 'approved'),
('approvals', 'decided_by', 'Who made the call.', 'LS Zach'),
('people', 'name', 'Display name. LS-prefixed convention is NOT used here — team is a separate column.', 'Zach'),
('people', 'email', 'Work email; used for daily update reminders.', 'zach@alpha.school'),
('people', 'team', 'academics, learning-science, superbuilders, or other.', 'learning-science'),
('change_log', 'changed_by', 'Who fixed the data (owners and sponsors fix data directly — no project managers chasing answers).', 'becky@alpha.school');
