-- Rollback-only adversarial test for Migration 013. Run only against a
-- disposable/local database after migrations through 013. No fixture persists.

BEGIN;

-- Trusted Auth provisioning uses the database default and role reconciliation
-- never overwrites an existing student clearance.
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data,
  aud, role, created_at, updated_at
) VALUES
  (
    'd1300000-0000-4000-8000-000000000031',
    '00000000-0000-0000-0000-000000000000',
    'training-provisioned-student@sparkagency.internal', 'test', now(),
    '', '', '', '', '', '', '{"role":"student"}',
    '{"username":"training_provisioned_student","display_name":"Provisioned Student"}',
    'authenticated', 'authenticated', now(), now()
  ),
  (
    'd1300000-0000-4000-8000-000000000032',
    '00000000-0000-0000-0000-000000000000',
    'training-provisioned-volunteer@sparkagency.internal', 'test', now(),
    '', '', '', '', '', '', '{"role":"volunteer"}',
    '{"username":"training_provisioned_volunteer","display_name":"Provisioned Volunteer"}',
    'authenticated', 'authenticated', now(), now()
  ),
  (
    'd1300000-0000-4000-8000-000000000033',
    '00000000-0000-0000-0000-000000000000',
    'training-reconciled-user@sparkagency.internal', 'test', now(),
    '', '', '', '', '', '', '{"role":"volunteer"}',
    '{"username":"training_reconciled_user","display_name":"Reconciled User"}',
    'authenticated', 'authenticated', now(), now()
  );

DO $$
BEGIN
  IF (
    SELECT clearance_level
    FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000031'
  ) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Trusted student provisioning did not use Orientation default';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000032'
  ) THEN
    RAISE EXCEPTION 'Trusted volunteer provisioning retained a student profile';
  END IF;
END;
$$;

INSERT INTO public.student_profiles (user_id, clearance_level)
VALUES ('d1300000-0000-4000-8000-000000000033', 4);

UPDATE auth.users
SET raw_app_meta_data = '{"role":"student"}'::jsonb
WHERE id = 'd1300000-0000-4000-8000-000000000033';

DO $$
BEGIN
  IF (
    SELECT clearance_level
    FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000033'
  ) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Role reconciliation overwrote existing student clearance';
  END IF;
END;
$$;

UPDATE auth.users
SET raw_app_meta_data = '{"role":"instructor"}'::jsonb
WHERE id = 'd1300000-0000-4000-8000-000000000033';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000033'
  ) THEN
    RAISE EXCEPTION 'Non-student role reconciliation retained a student profile';
  END IF;
END;
$$;

INSERT INTO public.users (id, username, role, display_name) VALUES
  ('d1300000-0000-4000-8000-000000000001', 'training_instructor_a', 'instructor', 'Training Instructor A'),
  ('d1300000-0000-4000-8000-000000000002', 'training_instructor_b', 'instructor', 'Training Instructor B'),
  ('d1300000-0000-4000-8000-000000000003', 'training_instructor_c', 'instructor', 'Training Instructor C'),
  ('d1300000-0000-4000-8000-000000000011', 'training_student_a', 'student', 'Training Student A'),
  ('d1300000-0000-4000-8000-000000000012', 'training_student_b', 'student', 'Training Student B'),
  ('d1300000-0000-4000-8000-000000000013', 'training_student_c', 'student', 'Training Student C'),
  ('d1300000-0000-4000-8000-000000000021', 'training_volunteer_a', 'volunteer', 'Training Volunteer A'),
  ('d1300000-0000-4000-8000-000000000022', 'training_volunteer_b', 'volunteer', 'Training Volunteer B');

INSERT INTO public.student_profiles (user_id, grade, clearance_level) VALUES
  ('d1300000-0000-4000-8000-000000000011', 5, 0),
  ('d1300000-0000-4000-8000-000000000012', 5, 1);

DO $$
DECLARE
  allowed_clearance smallint;
BEGIN
  FOREACH allowed_clearance IN ARRAY ARRAY[0, 1, 2, 3, 4, 5]::smallint[] LOOP
    UPDATE public.student_profiles
    SET clearance_level = allowed_clearance
    WHERE user_id = 'd1300000-0000-4000-8000-000000000012';
  END LOOP;

  BEGIN
    UPDATE public.student_profiles SET clearance_level = -1
    WHERE user_id = 'd1300000-0000-4000-8000-000000000012';
    RAISE EXCEPTION 'Student clearance -1 was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.student_profiles SET clearance_level = 6
    WHERE user_id = 'd1300000-0000-4000-8000-000000000012';
    RAISE EXCEPTION 'Student clearance 6 was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.student_profiles SET clearance_level = 1
  WHERE user_id = 'd1300000-0000-4000-8000-000000000012';
END;
$$;

INSERT INTO public.sessions (id, instructor_id, session_code, status) VALUES
  ('d1300000-0000-4000-8000-000000000041', 'd1300000-0000-4000-8000-000000000001', 'TRAIN013A', 'active'),
  ('d1300000-0000-4000-8000-000000000042', 'd1300000-0000-4000-8000-000000000002', 'TRAIN013B', 'open'),
  ('d1300000-0000-4000-8000-000000000043', 'd1300000-0000-4000-8000-000000000001', 'TRAIN013D', 'draft');

INSERT INTO public.session_participants (session_id, student_id) VALUES
  ('d1300000-0000-4000-8000-000000000041', 'd1300000-0000-4000-8000-000000000011'),
  ('d1300000-0000-4000-8000-000000000041', 'd1300000-0000-4000-8000-000000000021'),
  ('d1300000-0000-4000-8000-000000000041', 'd1300000-0000-4000-8000-000000000013'),
  ('d1300000-0000-4000-8000-000000000042', 'd1300000-0000-4000-8000-000000000012'),
  ('d1300000-0000-4000-8000-000000000042', 'd1300000-0000-4000-8000-000000000022'),
  ('d1300000-0000-4000-8000-000000000043', 'd1300000-0000-4000-8000-000000000011');

-- Orientation is persisted, does not grant CL1, and gates the seeded first
-- qualification until all three sections are complete.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.start_qualification(
      '01300000-0000-4000-8000-000000000001',
      'd1300000-0000-4000-8000-000000000041'
    );
    RAISE EXCEPTION 'Junior qualification started before Orientation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM public.complete_orientation_section('how-spark-works');
  PERFORM public.complete_orientation_section('scratch-basics');
  PERFORM public.complete_orientation_section('build-test-explain');

  IF (
    SELECT clearance_level FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011'
  ) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Orientation completion granted CL1';
  END IF;

  IF (
    SELECT orientation_completed_at IS NULL
      OR NOT orientation_sections_completed @> ARRAY[
        'how-spark-works', 'scratch-basics', 'build-test-explain'
      ]::text[]
    FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'Orientation completion was not persisted';
  END IF;

  PERFORM public.start_qualification(
    '01300000-0000-4000-8000-000000000001',
    'd1300000-0000-4000-8000-000000000041'
  );
END;
$$;
RESET ROLE;

-- Direct Data API/RLS bypass attempts must honor trusted clearance, assignment,
-- and live-session membership.
INSERT INTO public.cases (
  id, case_code, title, min_clearance, status, created_by
) VALUES
  ('d1300000-0000-4000-8000-000000000601', 'TRAIN-CL1', 'Training CL1 Case', 1, 'published', 'd1300000-0000-4000-8000-000000000001'),
  ('d1300000-0000-4000-8000-000000000602', 'TRAIN-CL2', 'Training CL2 Case', 2, 'published', 'd1300000-0000-4000-8000-000000000002'),
  ('d1300000-0000-4000-8000-000000000603', 'TRAIN-UNASSIGNED', 'Unassigned CL1 Case', 1, 'published', 'd1300000-0000-4000-8000-000000000002');

UPDATE public.sessions
SET case_ids = CASE id
  WHEN 'd1300000-0000-4000-8000-000000000041'::uuid THEN ARRAY['d1300000-0000-4000-8000-000000000601'::uuid]
  WHEN 'd1300000-0000-4000-8000-000000000042'::uuid THEN ARRAY[
    'd1300000-0000-4000-8000-000000000601'::uuid,
    'd1300000-0000-4000-8000-000000000602'::uuid
  ]
  ELSE case_ids
END
WHERE id IN (
  'd1300000-0000-4000-8000-000000000041',
  'd1300000-0000-4000-8000-000000000042'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config('request.jwt.claims', '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.case_progress (student_id, case_id, session_id, state) VALUES (
      'd1300000-0000-4000-8000-000000000011',
      'd1300000-0000-4000-8000-000000000601',
      'd1300000-0000-4000-8000-000000000041',
      'building'
    );
    RAISE EXCEPTION 'CL0 student created CL1 Case progress';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000012', true);
SELECT set_config('request.jwt.claims', '{"sub":"d1300000-0000-4000-8000-000000000012","role":"authenticated","app_metadata":{"role":"student"}}', true);
INSERT INTO public.case_progress (student_id, case_id, session_id, state) VALUES (
  'd1300000-0000-4000-8000-000000000012',
  'd1300000-0000-4000-8000-000000000601',
  'd1300000-0000-4000-8000-000000000042',
  'building'
);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.case_progress (student_id, case_id, session_id, state) VALUES (
      'd1300000-0000-4000-8000-000000000012', 'd1300000-0000-4000-8000-000000000602',
      'd1300000-0000-4000-8000-000000000042', 'building'
    );
    RAISE EXCEPTION 'CL1 student created CL2 Case progress';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.case_progress (student_id, case_id, session_id, state) VALUES (
      'd1300000-0000-4000-8000-000000000012', 'd1300000-0000-4000-8000-000000000603',
      'd1300000-0000-4000-8000-000000000042', 'building'
    );
    RAISE EXCEPTION 'Student created progress for an unassigned Case';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.case_progress (student_id, case_id, session_id, state) VALUES (
      'd1300000-0000-4000-8000-000000000012', 'd1300000-0000-4000-8000-000000000601',
      'd1300000-0000-4000-8000-000000000041', 'building'
    );
    RAISE EXCEPTION 'Student created progress without Session membership';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000013', true);
SELECT set_config('request.jwt.claims', '{"sub":"d1300000-0000-4000-8000-000000000013","role":"authenticated","app_metadata":{"role":"student"}}', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.case_progress (student_id, case_id, session_id, state) VALUES (
      'd1300000-0000-4000-8000-000000000013', 'd1300000-0000-4000-8000-000000000601',
      'd1300000-0000-4000-8000-000000000041', 'building'
    );
    RAISE EXCEPTION 'Student without a profile created Case progress';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

INSERT INTO public.skills (
  id, code, name, description, display_order
) VALUES
  ('d1300000-0000-4000-8000-000000000101', 'test-events', 'Test Events', 'Test event competency.', 1),
  ('d1300000-0000-4000-8000-000000000102', 'test-loops', 'Test Loops', 'Test loop competency.', 2),
  ('d1300000-0000-4000-8000-000000000103', 'test-motion', 'Test Motion', 'Test motion competency.', 3),
  ('d1300000-0000-4000-8000-000000000104', 'test-looks', 'Test Looks', 'Test looks competency.', 4),
  ('d1300000-0000-4000-8000-000000000105', 'test-sound', 'Test Sound', 'Test sound competency.', 5);

INSERT INTO public.training_missions (
  id, code, title, skill_id, goal, steps, instructor_check,
  independent_check_prompt, sequence_order, status
) VALUES
  (
    'd1300000-0000-4000-8000-000000000201', 'locked-mission',
    'Locked Mission', 'd1300000-0000-4000-8000-000000000103',
    'Keep structural identity stable.',
    '[{"id":"step-a","text":"Do A.","image":"/a.png"},{"id":"step-b","text":"Do B.","image":"/b.png"}]',
    'Observe the result.', 'Change one behavior independently.', 1, 'published'
  ),
  (
    'd1300000-0000-4000-8000-000000000202', 'dependent-mission',
    'Dependent Mission', 'd1300000-0000-4000-8000-000000000103',
    'Require every prerequisite.', '[{"id":"only","text":"Practice."}]',
    'Observe the result.', 'Make a different movement.', 2, 'published'
  ),
  (
    'd1300000-0000-4000-8000-000000000203', 'provenance-mission',
    'Provenance Mission', 'd1300000-0000-4000-8000-000000000101',
    'Preserve earlier test-out provenance.', '[{"id":"only","text":"Practice."}]',
    'Observe the result.', 'Choose another event.', 3, 'published'
  ),
  (
    'd1300000-0000-4000-8000-000000000204', 'volunteer-mission',
    'Volunteer Mission', 'd1300000-0000-4000-8000-000000000104',
    'Exercise volunteer transitions.', '[{"id":"only","text":"Practice."}]',
    'Observe the result.', 'Change the look independently.', 4, 'published'
  ),
  (
    'd1300000-0000-4000-8000-000000000205', 'atomic-mission',
    'Atomic Mission', 'd1300000-0000-4000-8000-000000000105',
    'Exercise atomic verification.', '[{"id":"only","text":"Practice."}]',
    'Observe the result.', 'Change the sound independently.', 5, 'published'
  ),
  (
    'd1300000-0000-4000-8000-000000000206', 'draft-mission',
    'Draft Mission', 'd1300000-0000-4000-8000-000000000105',
    'Remain unavailable.', '[]', 'Observe the result.',
    'Change something independently.', 6, 'draft'
  ),
  (
    'd1300000-0000-4000-8000-000000000207', 'session-b-mission',
    'Session B Mission', 'd1300000-0000-4000-8000-000000000105',
    'Stay in Session B.', '[{"id":"only","text":"Practice."}]',
    'Observe the result.', 'Change something independently.', 7, 'published'
  );

INSERT INTO public.training_mission_prerequisites (
  mission_id, required_skill_id
) VALUES
  ('d1300000-0000-4000-8000-000000000201', 'd1300000-0000-4000-8000-000000000101'),
  ('d1300000-0000-4000-8000-000000000202', 'd1300000-0000-4000-8000-000000000101'),
  ('d1300000-0000-4000-8000-000000000202', 'd1300000-0000-4000-8000-000000000102');

-- Progress on this published mission locks its objective structure.
INSERT INTO public.training_mission_progress (
  id, student_id, mission_id
) VALUES (
  'd1300000-0000-4000-8000-000000000401',
  'd1300000-0000-4000-8000-000000000012',
  'd1300000-0000-4000-8000-000000000201'
);

INSERT INTO public.qualification_definitions (
  id, code, title, description, target_clearance, task_brief,
  requirements, rubric, sequence_order, status
) VALUES
  (
    'd1300000-0000-4000-8000-000000000301', 'test-junior',
    'Test Junior Qualification', 'A small qualification.', 1,
    'Build and independently modify a small project.',
    '{"display":"Use the required demonstrated skills."}',
    '[{"code":"starts_program","label":"Starts the program"},{"code":"independent_change","label":"Makes an independent change"}]',
    1, 'published'
  ),
  (
    'd1300000-0000-4000-8000-000000000302', 'locked-qualification',
    'Locked Qualification', 'A structurally locked qualification.', 3,
    'Build a small project.', '[]',
    '[{"code":"criterion_a","label":"Criterion A"},{"code":"criterion_b","label":"Criterion B"}]',
    2, 'published'
  ),
  (
    'd1300000-0000-4000-8000-000000000303', 'lower-qualification',
    'Lower Qualification', 'Must never downgrade.', 1,
    'Complete a small task.', '[]',
    '[{"code":"solo","label":"Completes the task"}]',
    3, 'published'
  ),
  (
    'd1300000-0000-4000-8000-000000000304', 'test-developer',
    'Test Developer Qualification', 'A later qualification.', 2,
    'Build a second independently modified project.', '[]',
    '[{"code":"builds_solution","label":"Builds the solution"}]',
    4, 'published'
  );

INSERT INTO public.qualification_required_skills (
  qualification_id, skill_id
) VALUES
  ('d1300000-0000-4000-8000-000000000301', 'd1300000-0000-4000-8000-000000000102'),
  ('d1300000-0000-4000-8000-000000000301', 'd1300000-0000-4000-8000-000000000103'),
  ('d1300000-0000-4000-8000-000000000302', 'd1300000-0000-4000-8000-000000000101');

INSERT INTO public.student_qualification_attempts (
  id, student_id, qualification_id, session_id, attempt_number
) VALUES (
  'd1300000-0000-4000-8000-000000000501',
  'd1300000-0000-4000-8000-000000000012',
  'd1300000-0000-4000-8000-000000000302',
  'd1300000-0000-4000-8000-000000000042',
  1
);

-- JSON validation rejects missing/duplicate step identity and missing
-- independent checks on published Missions.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.training_missions (
      code, title, skill_id, goal, steps, instructor_check,
      independent_check_prompt, sequence_order, status
    ) VALUES (
      'invalid-duplicate-steps', 'Invalid',
      'd1300000-0000-4000-8000-000000000101', 'Invalid fixture',
      '[{"id":"same","text":"A"},{"id":"same","text":"B"}]',
      'Check', 'Independent check', 99, 'published'
    );
    RAISE EXCEPTION 'Duplicate Training step IDs were accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.training_missions (
      code, title, skill_id, goal, steps, instructor_check,
      independent_check_prompt, sequence_order, status
    ) VALUES (
      'invalid-independent-check', 'Invalid',
      'd1300000-0000-4000-8000-000000000101', 'Invalid fixture',
      '[{"id":"one","text":"A"}]', 'Check', ' ', 100, 'published'
    );
    RAISE EXCEPTION 'Blank published independent check was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- Published Mission structural identity is locked after progress exists.
DO $$
BEGIN
  BEGIN
    UPDATE public.training_missions SET code = 'changed-code'
    WHERE id = 'd1300000-0000-4000-8000-000000000201';
    RAISE EXCEPTION 'Mission code changed after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.training_missions
    SET skill_id = 'd1300000-0000-4000-8000-000000000104'
    WHERE id = 'd1300000-0000-4000-8000-000000000201';
    RAISE EXCEPTION 'Mission primary skill changed after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.training_missions SET sequence_order = 40
    WHERE id = 'd1300000-0000-4000-8000-000000000201';
    RAISE EXCEPTION 'Mission sequence changed after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.training_missions
    SET steps = '[{"id":"step-a","text":"A"},{"id":"new-step","text":"New"},{"id":"step-b","text":"B"}]'
    WHERE id = 'd1300000-0000-4000-8000-000000000201';
    RAISE EXCEPTION 'Mission step was added after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.training_missions
    SET steps = '[{"id":"step-a","text":"A"}]'
    WHERE id = 'd1300000-0000-4000-8000-000000000201';
    RAISE EXCEPTION 'Mission step was removed after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.training_missions
    SET steps = '[{"id":"step-b","text":"B"},{"id":"step-a","text":"A"}]'
    WHERE id = 'd1300000-0000-4000-8000-000000000201';
    RAISE EXCEPTION 'Mission step order changed after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    INSERT INTO public.training_mission_prerequisites VALUES (
      'd1300000-0000-4000-8000-000000000201',
      'd1300000-0000-4000-8000-000000000102'
    );
    RAISE EXCEPTION 'Mission prerequisite was added after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    DELETE FROM public.training_mission_prerequisites
    WHERE mission_id = 'd1300000-0000-4000-8000-000000000201';
    RAISE EXCEPTION 'Mission prerequisite was removed after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.training_mission_prerequisites
    SET required_skill_id = 'd1300000-0000-4000-8000-000000000102'
    WHERE mission_id = 'd1300000-0000-4000-8000-000000000201';
    RAISE EXCEPTION 'Mission prerequisite was replaced after progress';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END;
$$;

-- Wording and image edits preserve ordered IDs and remain allowed.
UPDATE public.training_missions
SET title = 'Locked Mission, corrected',
    goal = 'Corrected goal wording.',
    steps = '[{"id":"step-a","text":"Reworded A.","image":"/new-a.png"},{"id":"step-b","text":"Reworded B.","image":"/new-b.png"}]',
    optional_challenge = 'Try one more small change.',
    independent_check_prompt = 'Make one new behavior without step-by-step help.'
WHERE id = 'd1300000-0000-4000-8000-000000000201';

DO $$
BEGIN
  IF public.training_step_ids((
    SELECT steps FROM public.training_missions
    WHERE id = 'd1300000-0000-4000-8000-000000000201'
  )) IS DISTINCT FROM ARRAY['step-a', 'step-b']::text[] THEN
    RAISE EXCEPTION 'Allowed Mission wording edit changed step identity';
  END IF;
END;
$$;

-- Qualification criterion identity and required-skill set lock after attempts.
DO $$
BEGIN
  BEGIN
    UPDATE public.qualification_definitions SET code = 'changed-qualification'
    WHERE id = 'd1300000-0000-4000-8000-000000000302';
    RAISE EXCEPTION 'Qualification code changed after attempt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.qualification_definitions SET target_clearance = 4
    WHERE id = 'd1300000-0000-4000-8000-000000000302';
    RAISE EXCEPTION 'Qualification target clearance changed after attempt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.qualification_definitions
    SET rubric = '[{"code":"criterion_a","label":"A"},{"code":"new","label":"New"},{"code":"criterion_b","label":"B"}]'
    WHERE id = 'd1300000-0000-4000-8000-000000000302';
    RAISE EXCEPTION 'Qualification criterion was added after attempt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.qualification_definitions
    SET rubric = '[{"code":"criterion_a","label":"A"}]'
    WHERE id = 'd1300000-0000-4000-8000-000000000302';
    RAISE EXCEPTION 'Qualification criterion was removed after attempt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    UPDATE public.qualification_definitions
    SET rubric = '[{"code":"criterion_b","label":"B"},{"code":"criterion_a","label":"A"}]'
    WHERE id = 'd1300000-0000-4000-8000-000000000302';
    RAISE EXCEPTION 'Qualification criterion order changed after attempt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    INSERT INTO public.qualification_required_skills VALUES (
      'd1300000-0000-4000-8000-000000000302',
      'd1300000-0000-4000-8000-000000000102'
    );
    RAISE EXCEPTION 'Qualification required skill was added after attempt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  BEGIN
    DELETE FROM public.qualification_required_skills
    WHERE qualification_id = 'd1300000-0000-4000-8000-000000000302';
    RAISE EXCEPTION 'Qualification required skill was removed after attempt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END;
$$;

UPDATE public.qualification_definitions
SET title = 'Locked Qualification, corrected',
    description = 'Corrected qualification description.',
    task_brief = 'Corrected task wording.',
    rubric = '[{"code":"criterion_a","label":"Reworded A"},{"code":"criterion_b","label":"Reworded B"}]'
WHERE id = 'd1300000-0000-4000-8000-000000000302';

-- Student B creates a Session B verification item used for cross-session tests.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000012', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000012","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
DECLARE progress public.training_mission_progress;
BEGIN
  progress := public.start_training_mission('d1300000-0000-4000-8000-000000000207');
  PERFORM public.submit_training_mission_for_verification(
    progress.id,
    'd1300000-0000-4000-8000-000000000042'
  );
END;
$$;
RESET ROLE;

UPDATE public.training_mission_progress
SET id = 'd1300000-0000-4000-8000-000000000402'
WHERE student_id = 'd1300000-0000-4000-8000-000000000012'
  AND mission_id = 'd1300000-0000-4000-8000-000000000207';

-- ALL-of prerequisite eligibility and instructor-only test-out.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.start_training_mission('d1300000-0000-4000-8000-000000000202');
    RAISE EXCEPTION 'Student started Mission with both prerequisites missing';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.start_training_mission('d1300000-0000-4000-8000-000000000206');
    RAISE EXCEPTION 'Student started unpublished Mission';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  BEGIN
    INSERT INTO public.training_mission_progress (student_id, mission_id)
    VALUES (
      'd1300000-0000-4000-8000-000000000012',
      'd1300000-0000-4000-8000-000000000204'
    );
    RAISE EXCEPTION 'Student directly created another student progress row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.student_profiles SET clearance_level = 5
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Student directly changed clearance';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.student_profiles SET reputation_points = 99999
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Student directly changed reputation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.student_profiles SET prediction_accuracy = 100
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Student directly changed prediction accuracy';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.student_profiles (user_id, clearance_level)
    VALUES ('d1300000-0000-4000-8000-000000000011', 5);
    RAISE EXCEPTION 'Student directly inserted a profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Student directly deleted a profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.student_profiles SET grade = 6
  WHERE user_id = 'd1300000-0000-4000-8000-000000000011';

  IF (
    SELECT grade FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011'
  ) IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'Student self-service profile update did not persist';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
SELECT public.instructor_verify_skill(
  'd1300000-0000-4000-8000-000000000011',
  'd1300000-0000-4000-8000-000000000101',
  'd1300000-0000-4000-8000-000000000041',
  'First test-out provenance.'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.start_training_mission('d1300000-0000-4000-8000-000000000202');
    RAISE EXCEPTION 'Student started Mission with one of two prerequisites missing';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
BEGIN
  PERFORM public.instructor_verify_skill(
    'd1300000-0000-4000-8000-000000000011',
    'd1300000-0000-4000-8000-000000000102',
    'd1300000-0000-4000-8000-000000000041',
    'Second prerequisite.'
  );

  IF EXISTS (
    SELECT 1 FROM public.training_mission_progress
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'Instructor test-out created fake Mission progress';
  END IF;

  BEGIN
    PERFORM public.instructor_verify_skill(
      'd1300000-0000-4000-8000-000000000012',
      'd1300000-0000-4000-8000-000000000102',
      'd1300000-0000-4000-8000-000000000041',
      NULL
    );
    RAISE EXCEPTION 'Instructor A tested out unrelated Student B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Student A starts eligible work, cannot forge state, and must submit through a
-- legitimate live joined session.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
DECLARE
  dependent_progress public.training_mission_progress;
  provenance_progress public.training_mission_progress;
  volunteer_progress public.training_mission_progress;
  atomic_progress public.training_mission_progress;
BEGIN
  dependent_progress := public.start_training_mission('d1300000-0000-4000-8000-000000000202');
  provenance_progress := public.start_training_mission('d1300000-0000-4000-8000-000000000203');
  volunteer_progress := public.start_training_mission('d1300000-0000-4000-8000-000000000204');
  atomic_progress := public.start_training_mission('d1300000-0000-4000-8000-000000000205');

  BEGIN
    PERFORM public.set_training_mission_step(dependent_progress.id, 1);
    RAISE EXCEPTION 'Student set an invalid Training step';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM public.set_training_mission_step(dependent_progress.id, 0);

  BEGIN
    PERFORM public.submit_training_mission_for_verification(
      dependent_progress.id,
      'd1300000-0000-4000-8000-000000000042'
    );
    RAISE EXCEPTION 'Student submitted through unrelated Session B';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.submit_training_mission_for_verification(
      dependent_progress.id,
      'd1300000-0000-4000-8000-000000000043'
    );
    RAISE EXCEPTION 'Student submitted through a draft session';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.submit_training_mission_for_verification(
      (
        SELECT progress.id
        FROM public.training_mission_progress AS progress
        WHERE progress.student_id = 'd1300000-0000-4000-8000-000000000012'
          AND progress.mission_id = 'd1300000-0000-4000-8000-000000000207'
      ),
      'd1300000-0000-4000-8000-000000000042'
    );
    RAISE EXCEPTION 'Student submitted another student progress row';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  PERFORM public.submit_training_mission_for_verification(
    dependent_progress.id, 'd1300000-0000-4000-8000-000000000041'
  );
  PERFORM public.submit_training_mission_for_verification(
    provenance_progress.id, 'd1300000-0000-4000-8000-000000000041'
  );
  PERFORM public.submit_training_mission_for_verification(
    volunteer_progress.id, 'd1300000-0000-4000-8000-000000000041'
  );
  PERFORM public.submit_training_mission_for_verification(
    atomic_progress.id, 'd1300000-0000-4000-8000-000000000041'
  );

  BEGIN
    UPDATE public.training_mission_progress
    SET status = 'verified'
    WHERE id = dependent_progress.id;
    RAISE EXCEPTION 'Student directly marked Mission verified';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

UPDATE public.training_mission_progress
SET id = CASE mission_id
  WHEN 'd1300000-0000-4000-8000-000000000202'::uuid
    THEN 'd1300000-0000-4000-8000-000000000411'::uuid
  WHEN 'd1300000-0000-4000-8000-000000000203'::uuid
    THEN 'd1300000-0000-4000-8000-000000000412'::uuid
  WHEN 'd1300000-0000-4000-8000-000000000204'::uuid
    THEN 'd1300000-0000-4000-8000-000000000413'::uuid
  WHEN 'd1300000-0000-4000-8000-000000000205'::uuid
    THEN 'd1300000-0000-4000-8000-000000000414'::uuid
  ELSE id
END
WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
  AND mission_id IN (
    'd1300000-0000-4000-8000-000000000202',
    'd1300000-0000-4000-8000-000000000203',
    'd1300000-0000-4000-8000-000000000204',
    'd1300000-0000-4000-8000-000000000205'
  );

-- Volunteer A may return and verify only Session A Mission work.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000021', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000021","role":"authenticated","app_metadata":{"role":"volunteer"}}',
  true
);
DO $$
DECLARE volunteer_progress_id uuid;
BEGIN
  SELECT progress.id INTO volunteer_progress_id
  FROM public.training_mission_progress AS progress
  WHERE progress.student_id = 'd1300000-0000-4000-8000-000000000011'
    AND progress.mission_id = 'd1300000-0000-4000-8000-000000000204';

  PERFORM public.return_training_mission(volunteer_progress_id, 'Try the independent change again.');

  BEGIN
    PERFORM public.verify_training_mission(
      'd1300000-0000-4000-8000-000000000402'
    );
    RAISE EXCEPTION 'Volunteer A verified Session B work';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.instructor_verify_skill(
      'd1300000-0000-4000-8000-000000000011',
      'd1300000-0000-4000-8000-000000000105',
      'd1300000-0000-4000-8000-000000000041',
      NULL
    );
    RAISE EXCEPTION 'Volunteer tested out a skill';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.student_profiles SET clearance_level = 5
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Volunteer directly changed clearance';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
SELECT public.submit_training_mission_for_verification(
  (
    SELECT progress.id
    FROM public.training_mission_progress AS progress
    WHERE progress.mission_id = 'd1300000-0000-4000-8000-000000000204'
      AND progress.student_id = 'd1300000-0000-4000-8000-000000000011'
  ),
  'd1300000-0000-4000-8000-000000000041'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000021', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000021","role":"authenticated","app_metadata":{"role":"volunteer"}}',
  true
);
SELECT public.verify_training_mission(
  (
    SELECT progress.id
    FROM public.training_mission_progress AS progress
    WHERE progress.mission_id = 'd1300000-0000-4000-8000-000000000204'
      AND progress.student_id = 'd1300000-0000-4000-8000-000000000011'
  ),
  'Independent look change observed.'
);
SELECT public.verify_training_mission(
  (
    SELECT progress.id
    FROM public.training_mission_progress AS progress
    WHERE progress.mission_id = 'd1300000-0000-4000-8000-000000000203'
      AND progress.student_id = 'd1300000-0000-4000-8000-000000000011'
  ),
  'Independent event change observed.'
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.student_skill_verifications
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND skill_id = 'd1300000-0000-4000-8000-000000000101'
  ) <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.student_skill_verifications
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND skill_id = 'd1300000-0000-4000-8000-000000000101'
      AND source = 'instructor_test_out'
      AND source_mission_progress_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Mission completion overwrote original skill provenance';
  END IF;
END;
$$;

-- Instructor B cannot verify Session A; Instructor A can.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000002', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.verify_training_mission(
      'd1300000-0000-4000-8000-000000000411'
    );
    RAISE EXCEPTION 'Instructor B verified Instructor A session work';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
SELECT public.verify_training_mission(
  (
    SELECT progress.id
    FROM public.training_mission_progress AS progress
    WHERE progress.student_id = 'd1300000-0000-4000-8000-000000000011'
      AND progress.mission_id = 'd1300000-0000-4000-8000-000000000202'
  ),
  'Independent motion observed.'
);
RESET ROLE;

-- Force the skill insert to fail and prove the preceding progress UPDATE rolls
-- back with it. The trigger itself is rollback-only test instrumentation.
CREATE OR REPLACE FUNCTION public.test013_reject_atomic_skill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.skill_id = 'd1300000-0000-4000-8000-000000000105'::uuid THEN
    RAISE EXCEPTION 'forced atomicity failure' USING ERRCODE = 'P013A';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER test013_reject_atomic_skill
  BEFORE INSERT ON public.student_skill_verifications
  FOR EACH ROW EXECUTE FUNCTION public.test013_reject_atomic_skill();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.verify_training_mission((
      SELECT progress.id
      FROM public.training_mission_progress AS progress
      WHERE progress.student_id = 'd1300000-0000-4000-8000-000000000011'
        AND progress.mission_id = 'd1300000-0000-4000-8000-000000000205'
    ));
    RAISE EXCEPTION 'Forced skill failure did not abort verification';
  EXCEPTION WHEN SQLSTATE 'P013A' THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_mission_progress
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND mission_id = 'd1300000-0000-4000-8000-000000000205'
      AND status = 'awaiting_verification'
      AND verified_by IS NULL
      AND verified_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.student_skill_verifications
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND skill_id = 'd1300000-0000-4000-8000-000000000105'
  ) THEN
    RAISE EXCEPTION 'Mission and skill verification were not atomic';
  END IF;
END;
$$;

DROP TRIGGER test013_reject_atomic_skill ON public.student_skill_verifications;
DROP FUNCTION public.test013_reject_atomic_skill();

-- Qualification prerequisites, permissions, rubric enforcement, and clearance.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000012', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000012","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.start_qualification(
      'd1300000-0000-4000-8000-000000000301',
      'd1300000-0000-4000-8000-000000000042'
    );
    RAISE EXCEPTION 'Student B started qualification without all required skills';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
DECLARE attempt public.student_qualification_attempts;
BEGIN
  attempt := public.start_qualification(
    'd1300000-0000-4000-8000-000000000301',
    'd1300000-0000-4000-8000-000000000041'
  );

  BEGIN
    PERFORM public.start_qualification(
      'd1300000-0000-4000-8000-000000000301',
      'd1300000-0000-4000-8000-000000000041'
    );
    RAISE EXCEPTION 'Student created a second open qualification attempt';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;

  PERFORM public.save_qualification_evidence(
    attempt.id,
    'https://scratch.mit.edu/projects/130001/',
    'I changed the sprite movement.',
    'I used the green flag and restarted twice.',
    '{"green_flag_starts":true,"sprite_moves_across_stage":true,"message_after_moving":true,"personal_change_tested":true}'::jsonb
  );
  attempt := public.submit_qualification(attempt.id);

  BEGIN
    UPDATE public.student_qualification_attempts SET status = 'passed'
    WHERE id = attempt.id;
    RAISE EXCEPTION 'Student directly passed qualification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.review_qualification(
      attempt.id,
      '{"starts_program":true,"independent_change":true}',
      'passed',
      NULL
    );
    RAISE EXCEPTION 'Student reviewed own qualification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

UPDATE public.student_qualification_attempts
SET id = 'd1300000-0000-4000-8000-000000000502'
WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
  AND qualification_id = 'd1300000-0000-4000-8000-000000000301';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000021', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000021","role":"authenticated","app_metadata":{"role":"volunteer"}}',
  true
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.student_qualification_attempts) THEN
    RAISE EXCEPTION 'Volunteer can enumerate qualification attempts';
  END IF;

  BEGIN
    PERFORM public.review_qualification(
      'd1300000-0000-4000-8000-000000000502',
      '{"starts_program":true,"independent_change":true}',
      'passed',
      NULL
    );
    RAISE EXCEPTION 'Volunteer reviewed qualification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000002', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.review_qualification(
      'd1300000-0000-4000-8000-000000000502',
      '{"starts_program":true,"independent_change":true}',
      'passed',
      NULL
    );
    RAISE EXCEPTION 'Instructor B reviewed Instructor A attempt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
DECLARE attempt_id uuid;
BEGIN
  SELECT id INTO attempt_id
  FROM public.student_qualification_attempts
  WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
    AND qualification_id = 'd1300000-0000-4000-8000-000000000301';

  BEGIN
    PERFORM public.review_qualification(
      attempt_id, '{"starts_program":true}', 'passed', NULL
    );
    RAISE EXCEPTION 'Qualification passed with a missing criterion';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.review_qualification(
      attempt_id,
      '{"starts_program":true,"independent_change":false}',
      'passed', NULL
    );
    RAISE EXCEPTION 'Qualification passed with a false criterion';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.review_qualification(
      attempt_id,
      '{"starts_program":true,"independent_change":true,"unknown":true}',
      'passed', NULL
    );
    RAISE EXCEPTION 'Qualification accepted an unknown criterion';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  PERFORM public.review_qualification(
    attempt_id,
    '{"starts_program":true,"independent_change":true}',
    'passed',
    'All required criteria observed.'
  );
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.student_qualification_attempts
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND qualification_id = 'd1300000-0000-4000-8000-000000000301'
      AND status = 'passed'
  ) OR (
    SELECT clearance_level FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011'
  ) <> 1 THEN
    RAISE EXCEPTION 'Junior qualification did not promote Orientation to CL-1';
  END IF;
END;
$$;

-- A failed CL-2 qualification does not promote.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
DECLARE attempt public.student_qualification_attempts;
BEGIN
  attempt := public.start_qualification(
    'd1300000-0000-4000-8000-000000000304',
    'd1300000-0000-4000-8000-000000000041'
  );
  PERFORM public.save_qualification_evidence(
    attempt.id, 'https://scratch.mit.edu/projects/130002/',
    'I added a sound.', 'I ran it twice.',
    '{"green_flag_starts":true,"sprite_moves_across_stage":true,"message_after_moving":true,"personal_change_tested":true}'::jsonb
  );
  PERFORM public.submit_qualification(attempt.id);
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
SELECT public.review_qualification(
  (
    SELECT id FROM public.student_qualification_attempts
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND qualification_id = 'd1300000-0000-4000-8000-000000000304'
      AND status = 'awaiting_review'
  ),
  '{"builds_solution":false}',
  'needs_retry',
  'Try the independent change again.'
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT clearance_level FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011'
  ) <> 1 THEN
    RAISE EXCEPTION 'Failed qualification changed student clearance';
  END IF;
END;
$$;

-- Passing CL-2 promotes 1 -> 2.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
DECLARE attempt public.student_qualification_attempts;
BEGIN
  attempt := public.start_qualification(
    'd1300000-0000-4000-8000-000000000304',
    'd1300000-0000-4000-8000-000000000041'
  );
  PERFORM public.save_qualification_evidence(
    attempt.id, 'https://scratch.mit.edu/projects/130003/',
    'I changed the color.', 'I ran it twice.',
    '{"green_flag_starts":true,"sprite_moves_across_stage":true,"message_after_moving":true,"personal_change_tested":true}'::jsonb
  );
  PERFORM public.submit_qualification(attempt.id);
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
SELECT public.review_qualification(
  (
    SELECT id FROM public.student_qualification_attempts
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND qualification_id = 'd1300000-0000-4000-8000-000000000304'
      AND status = 'awaiting_review'
  ),
  '{"builds_solution":true}',
  'passed',
  NULL
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT clearance_level FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011'
  ) <> 2 THEN
    RAISE EXCEPTION 'Developer qualification did not promote CL-1 to CL-2';
  END IF;
END;
$$;

-- A later successful attempt at the same target remains exactly CL-2.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
DECLARE attempt public.student_qualification_attempts;
BEGIN
  attempt := public.start_qualification(
    'd1300000-0000-4000-8000-000000000304',
    'd1300000-0000-4000-8000-000000000041'
  );
  PERFORM public.save_qualification_evidence(
    attempt.id, 'https://scratch.mit.edu/projects/130004/',
    'I changed the move.', 'I ran it twice.',
    '{"green_flag_starts":true,"sprite_moves_across_stage":true,"message_after_moving":true,"personal_change_tested":true}'::jsonb
  );
  PERFORM public.submit_qualification(attempt.id);
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
SELECT public.review_qualification(
  (
    SELECT id FROM public.student_qualification_attempts
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND qualification_id = 'd1300000-0000-4000-8000-000000000304'
      AND status = 'awaiting_review'
  ),
  '{"builds_solution":true}',
  'passed',
  NULL
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT clearance_level FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011'
  ) <> 2 THEN
    RAISE EXCEPTION 'Repeated target qualification increased clearance beyond CL-2';
  END IF;
END;
$$;

-- A later lower-target qualification must not downgrade existing clearance.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
DECLARE attempt public.student_qualification_attempts;
BEGIN
  attempt := public.start_qualification(
    'd1300000-0000-4000-8000-000000000303',
    'd1300000-0000-4000-8000-000000000041'
  );
  PERFORM public.save_qualification_evidence(
    attempt.id, 'https://scratch.mit.edu/projects/130005/',
    'I changed the sprite.', 'I ran it twice.',
    '{"green_flag_starts":true,"sprite_moves_across_stage":true,"message_after_moving":true,"personal_change_tested":true}'::jsonb
  );
  PERFORM public.submit_qualification(attempt.id);
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
SELECT public.review_qualification(
  (
    SELECT id FROM public.student_qualification_attempts
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
      AND qualification_id = 'd1300000-0000-4000-8000-000000000303'
  ),
  '{"solo":true}',
  'passed',
  NULL
);
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT clearance_level FROM public.student_profiles
    WHERE user_id = 'd1300000-0000-4000-8000-000000000011'
  ) <> 2 THEN
    RAISE EXCEPTION 'Lower-target qualification downgraded clearance';
  END IF;
END;
$$;

-- RLS: student isolation, volunteer session scope, instructor ownership, and
-- longitudinal access after the student joins another instructor's session.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.training_mission_progress
    WHERE student_id = 'd1300000-0000-4000-8000-000000000012'
  ) OR EXISTS (
    SELECT 1 FROM public.student_skill_verifications
    WHERE student_id = 'd1300000-0000-4000-8000-000000000012'
  ) OR EXISTS (
    SELECT 1 FROM public.student_qualification_attempts
    WHERE student_id = 'd1300000-0000-4000-8000-000000000012'
  ) THEN
    RAISE EXCEPTION 'Student A can read Student B Training records';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000021', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000021","role":"authenticated","app_metadata":{"role":"volunteer"}}',
  true
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_mission_progress
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.student_skill_verifications
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
  ) OR EXISTS (
    SELECT 1 FROM public.training_mission_progress
    WHERE student_id = 'd1300000-0000-4000-8000-000000000012'
  ) OR EXISTS (
    SELECT 1 FROM public.student_qualification_attempts
  ) THEN
    RAISE EXCEPTION 'Volunteer longitudinal/session RLS scope failed';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000002', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.student_skill_verifications
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
  ) OR EXISTS (
    SELECT 1 FROM public.student_qualification_attempts
    WHERE session_id = 'd1300000-0000-4000-8000-000000000041'
  ) THEN
    RAISE EXCEPTION 'Instructor B can read Instructor A student records';
  END IF;
END;
$$;
RESET ROLE;

INSERT INTO public.session_participants (session_id, student_id) VALUES (
  'd1300000-0000-4000-8000-000000000042',
  'd1300000-0000-4000-8000-000000000011'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000002', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.student_skill_verifications
    WHERE student_id = 'd1300000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'Current Instructor B cannot read longitudinal skills';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_qualification_attempts
    WHERE session_id = 'd1300000-0000-4000-8000-000000000041'
  ) THEN
    RAISE EXCEPTION 'Instructor B can read Instructor A qualification attempts';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000003', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.training_mission_progress)
    OR EXISTS (SELECT 1 FROM public.student_skill_verifications)
    OR EXISTS (SELECT 1 FROM public.student_qualification_attempts)
  THEN
    RAISE EXCEPTION 'Unrelated Instructor C can enumerate Training records';
  END IF;
END;
$$;
RESET ROLE;

-- Defense in depth: even if the content constraint were absent, verification
-- independently refuses a blank independent-check prompt.
ALTER TABLE public.training_missions
  DROP CONSTRAINT training_missions_independent_check_nonblank_check;
UPDATE public.training_missions
SET independent_check_prompt = ''
WHERE id = 'd1300000-0000-4000-8000-000000000207';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1300000-0000-4000-8000-000000000022', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"d1300000-0000-4000-8000-000000000022","role":"authenticated","app_metadata":{"role":"volunteer"}}',
  true
);
DO $$
BEGIN
  BEGIN
    PERFORM public.verify_training_mission((
      SELECT progress.id
      FROM public.training_mission_progress AS progress
      WHERE progress.student_id = 'd1300000-0000-4000-8000-000000000012'
        AND progress.mission_id = 'd1300000-0000-4000-8000-000000000207'
    ));
    RAISE EXCEPTION 'Verification accepted a missing independent check';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.training_mission_progress
    WHERE student_id = 'd1300000-0000-4000-8000-000000000012'
      AND mission_id = 'd1300000-0000-4000-8000-000000000207'
      AND status = 'awaiting_verification'
  ) THEN
    RAISE EXCEPTION 'Failed independent-check verification changed progress';
  END IF;
END;
$$;

ROLLBACK;
