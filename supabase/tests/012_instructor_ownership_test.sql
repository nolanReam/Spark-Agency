-- Rollback-only ownership/RLS adversarial test. Run against a disposable/local
-- database after migrations through 012. No fixture may persist.

BEGIN;

INSERT INTO public.users (id, username, role, display_name) VALUES
  ('c1200000-0000-4000-8000-000000000001', 'owner_test_instructor_a', 'instructor', 'Owner Test Instructor A'),
  ('c1200000-0000-4000-8000-000000000002', 'owner_test_instructor_b', 'instructor', 'Owner Test Instructor B'),
  ('c1200000-0000-4000-8000-000000000011', 'owner_test_student_a', 'student', 'Owner Test Student A'),
  ('c1200000-0000-4000-8000-000000000012', 'owner_test_student_b', 'student', 'Owner Test Student B'),
  ('c1200000-0000-4000-8000-000000000013', 'owner_test_shared', 'student', 'Owner Test Shared Student'),
  ('c1200000-0000-4000-8000-000000000021', 'owner_test_volunteer_a', 'volunteer', 'Owner Test Volunteer A'),
  ('c1200000-0000-4000-8000-000000000022', 'owner_test_volunteer_b', 'volunteer', 'Owner Test Volunteer B');

INSERT INTO public.student_profiles (user_id, grade) VALUES
  ('c1200000-0000-4000-8000-000000000011', 5),
  ('c1200000-0000-4000-8000-000000000012', 5),
  ('c1200000-0000-4000-8000-000000000013', 5);

INSERT INTO public.cases (id, case_code, title, created_by, status) VALUES
  ('c1200000-0000-4000-8000-000000000031', 'OWN-A', 'Owned by A', 'c1200000-0000-4000-8000-000000000001', 'published'),
  ('c1200000-0000-4000-8000-000000000032', 'OWN-B', 'Owned by B', 'c1200000-0000-4000-8000-000000000002', 'published');

INSERT INTO public.sessions (id, instructor_id, session_code, case_ids, status) VALUES
  ('c1200000-0000-4000-8000-000000000041', 'c1200000-0000-4000-8000-000000000001', 'OWNTESTA', ARRAY['c1200000-0000-4000-8000-000000000031'::uuid], 'active'),
  ('c1200000-0000-4000-8000-000000000042', 'c1200000-0000-4000-8000-000000000002', 'OWNTESTB', ARRAY['c1200000-0000-4000-8000-000000000032'::uuid], 'active'),
  ('c1200000-0000-4000-8000-000000000043', 'c1200000-0000-4000-8000-000000000001', 'OWNEMPTY', ARRAY['c1200000-0000-4000-8000-000000000031'::uuid], 'open');

INSERT INTO public.session_participants (session_id, student_id) VALUES
  ('c1200000-0000-4000-8000-000000000041', 'c1200000-0000-4000-8000-000000000011'),
  ('c1200000-0000-4000-8000-000000000041', 'c1200000-0000-4000-8000-000000000013'),
  ('c1200000-0000-4000-8000-000000000041', 'c1200000-0000-4000-8000-000000000021'),
  ('c1200000-0000-4000-8000-000000000042', 'c1200000-0000-4000-8000-000000000012'),
  ('c1200000-0000-4000-8000-000000000042', 'c1200000-0000-4000-8000-000000000013'),
  ('c1200000-0000-4000-8000-000000000042', 'c1200000-0000-4000-8000-000000000022');

INSERT INTO public.case_progress (id, student_id, case_id, session_id, state) VALUES
  ('c1200000-0000-4000-8000-000000000051', 'c1200000-0000-4000-8000-000000000011', 'c1200000-0000-4000-8000-000000000031', 'c1200000-0000-4000-8000-000000000041', 'building'),
  ('c1200000-0000-4000-8000-000000000052', 'c1200000-0000-4000-8000-000000000012', 'c1200000-0000-4000-8000-000000000032', 'c1200000-0000-4000-8000-000000000042', 'building'),
  ('c1200000-0000-4000-8000-000000000053', 'c1200000-0000-4000-8000-000000000013', 'c1200000-0000-4000-8000-000000000031', 'c1200000-0000-4000-8000-000000000041', 'building'),
  ('c1200000-0000-4000-8000-000000000054', 'c1200000-0000-4000-8000-000000000013', 'c1200000-0000-4000-8000-000000000032', 'c1200000-0000-4000-8000-000000000042', 'building');

INSERT INTO public.student_concept_mastery (student_id, concept, mastery_pct)
VALUES ('c1200000-0000-4000-8000-000000000011', 'Variables', 50);

INSERT INTO public.intervention_flags (
  id, student_id, case_id, case_progress_id, reason
) VALUES
  (
    'c1200000-0000-4000-8000-000000000061',
    'c1200000-0000-4000-8000-000000000011',
    'c1200000-0000-4000-8000-000000000031',
    'c1200000-0000-4000-8000-000000000051',
    'student_raise_hand'
  ),
  (
    'c1200000-0000-4000-8000-000000000062',
    'c1200000-0000-4000-8000-000000000011',
    'c1200000-0000-4000-8000-000000000031',
    NULL,
    'wrong_prediction_repeat'
  );

INSERT INTO public.password_reset_requests (
  id, student_id, session_id, requested_by, expires_at
) VALUES
  (
    'c1200000-0000-4000-8000-000000000071',
    'c1200000-0000-4000-8000-000000000011',
    'c1200000-0000-4000-8000-000000000041',
    'c1200000-0000-4000-8000-000000000001',
    now() + interval '30 minutes'
  ),
  (
    'c1200000-0000-4000-8000-000000000072',
    'c1200000-0000-4000-8000-000000000013',
    'c1200000-0000-4000-8000-000000000041',
    'c1200000-0000-4000-8000-000000000001',
    now() + interval '30 minutes'
  );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c1200000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.cases WHERE id IN (
    'c1200000-0000-4000-8000-000000000031',
    'c1200000-0000-4000-8000-000000000032'
  )) <> 1 THEN RAISE EXCEPTION 'Instructor A case isolation failed'; END IF;
  IF (SELECT count(*) FROM public.sessions WHERE id IN (
    'c1200000-0000-4000-8000-000000000041',
    'c1200000-0000-4000-8000-000000000042'
  )) <> 1 THEN RAISE EXCEPTION 'Instructor A session isolation failed'; END IF;
  IF (SELECT count(*) FROM public.session_participants) <> 3 THEN
    RAISE EXCEPTION 'Instructor A participant isolation failed';
  END IF;
  IF (SELECT count(*) FROM public.session_participants
      WHERE session_id = 'c1200000-0000-4000-8000-000000000043') <> 0 THEN
    RAISE EXCEPTION 'Instructor A empty-session participant count failed';
  END IF;
  IF (SELECT count(*) FROM public.case_progress) <> 2 THEN
    RAISE EXCEPTION 'Instructor A historical progress isolation failed';
  END IF;
  IF (SELECT count(*) FROM public.intervention_flags) <> 1 THEN
    RAISE EXCEPTION 'Instructor A exact-progress Help Request scoping failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.student_concept_mastery) THEN
    RAISE EXCEPTION 'Instructor A received aggregate mastery access';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = 'c1200000-0000-4000-8000-000000000013')
     OR EXISTS (SELECT 1 FROM public.users WHERE id = 'c1200000-0000-4000-8000-000000000012') THEN
    RAISE EXCEPTION 'Instructor A shared/B-only student identity scoping failed';
  END IF;
  IF (SELECT count(*) FROM public.users WHERE id IN (
        'c1200000-0000-4000-8000-000000000011',
        'c1200000-0000-4000-8000-000000000013'
      ) AND role = 'student') <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.users
       WHERE id = 'c1200000-0000-4000-8000-000000000021'
         AND role = 'volunteer'
     )
     OR EXISTS (
       SELECT 1 FROM public.users
       WHERE id = 'c1200000-0000-4000-8000-000000000022'
     ) THEN
    RAISE EXCEPTION 'Instructor A participant profile visibility failed';
  END IF;
  IF (SELECT count(*) FROM public.password_reset_requests) <> 2 THEN
    RAISE EXCEPTION 'Instructor A reset visibility failed';
  END IF;
  PERFORM public.request_student_password_reset(
    'c1200000-0000-4000-8000-000000000011',
    'c1200000-0000-4000-8000-000000000041'
  );
END;
$$;

UPDATE public.cases SET title = 'forbidden' WHERE id = 'c1200000-0000-4000-8000-000000000032';
UPDATE public.cases SET status = 'archived' WHERE id = 'c1200000-0000-4000-8000-000000000032';
UPDATE public.sessions SET status = 'closed' WHERE id = 'c1200000-0000-4000-8000-000000000042';

DO $$
BEGIN
  BEGIN
    INSERT INTO public.cases (case_code, title, created_by)
    VALUES ('OWN-SPOOF', 'Spoofed owner', 'c1200000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Instructor A created a B-owned case';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.sessions (session_code, instructor_id, case_ids)
    VALUES (
      'OWNBADCASE',
      'c1200000-0000-4000-8000-000000000001',
      ARRAY['c1200000-0000-4000-8000-000000000032'::uuid]
    );
    RAISE EXCEPTION 'Instructor A assigned B case to A session';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cases WHERE id = 'c1200000-0000-4000-8000-000000000032' AND (title = 'forbidden' OR status = 'archived')) THEN
    RAISE EXCEPTION 'Instructor A mutated B case';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sessions WHERE id = 'c1200000-0000-4000-8000-000000000042' AND status = 'closed') THEN
    RAISE EXCEPTION 'Instructor A closed B session';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000002', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c1200000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cases WHERE id = 'c1200000-0000-4000-8000-000000000032')
     OR NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = 'c1200000-0000-4000-8000-000000000042')
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = 'c1200000-0000-4000-8000-000000000013') THEN
    RAISE EXCEPTION 'Instructor B cannot see owned/shared data';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cases WHERE id = 'c1200000-0000-4000-8000-000000000031')
     OR EXISTS (SELECT 1 FROM public.sessions WHERE id = 'c1200000-0000-4000-8000-000000000041')
     OR EXISTS (SELECT 1 FROM public.case_progress WHERE session_id = 'c1200000-0000-4000-8000-000000000041')
     OR EXISTS (SELECT 1 FROM public.password_reset_requests WHERE id = 'c1200000-0000-4000-8000-000000000071') THEN
    RAISE EXCEPTION 'Instructor B can see Instructor A data';
  END IF;
  IF EXISTS (
       SELECT 1 FROM public.users
       WHERE id IN (
         'c1200000-0000-4000-8000-000000000011',
         'c1200000-0000-4000-8000-000000000021'
       )
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.users
       WHERE id = 'c1200000-0000-4000-8000-000000000022'
         AND role = 'volunteer'
     ) THEN
    RAISE EXCEPTION 'Instructor B participant profile isolation failed';
  END IF;

  BEGIN
    PERFORM public.request_student_password_reset(
      'c1200000-0000-4000-8000-000000000011',
      'c1200000-0000-4000-8000-000000000041'
    );
    RAISE EXCEPTION 'Instructor B requested reset through A session';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.request_student_password_reset(
      'c1200000-0000-4000-8000-000000000013',
      'c1200000-0000-4000-8000-000000000042'
    );
    RAISE EXCEPTION 'Instructor B received Instructor A active shared-student request';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL;
  END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE claim record;
BEGIN
  SELECT * INTO claim FROM public.claim_password_reset_request(
    'c1200000-0000-4000-8000-000000000071',
    'c1200000-0000-4000-8000-000000000002'
  );
  IF claim.result_code <> 'FORBIDDEN' THEN
    RAISE EXCEPTION 'Instructor B cross-owner claim was not forbidden: %', row_to_json(claim);
  END IF;

  SELECT * INTO claim FROM public.claim_password_reset_request(
    'c1200000-0000-4000-8000-000000000071',
    'c1200000-0000-4000-8000-000000000001'
  );
  IF claim.result_code <> 'CLAIMED' THEN RAISE EXCEPTION 'Instructor A claim failed'; END IF;

  IF public.complete_password_reset(
    'c1200000-0000-4000-8000-000000000071',
    'c1200000-0000-4000-8000-000000000002'
  ) <> 'RESET_NOT_AVAILABLE' THEN
    RAISE EXCEPTION 'Instructor B completion was not rejected';
  END IF;
END;
$$;

RESET ROLE;
UPDATE public.password_reset_requests
SET processing_started_at = now() - interval '3 minutes'
WHERE id = 'c1200000-0000-4000-8000-000000000071';

SET LOCAL ROLE service_role;
DO $$
DECLARE claim record;
BEGIN
  SELECT * INTO claim FROM public.claim_password_reset_request(
    'c1200000-0000-4000-8000-000000000071',
    'c1200000-0000-4000-8000-000000000002'
  );
  IF claim.result_code <> 'FORBIDDEN' THEN RAISE EXCEPTION 'B reclaimed A stale request'; END IF;

  SELECT * INTO claim FROM public.claim_password_reset_request(
    'c1200000-0000-4000-8000-000000000071',
    'c1200000-0000-4000-8000-000000000001'
  );
  IF claim.result_code <> 'CLAIMED' OR claim.attempt_count <> 2 THEN
    RAISE EXCEPTION 'A could not reclaim own stale request: %', row_to_json(claim);
  END IF;
END;
$$;

RESET ROLE;
UPDATE public.password_reset_requests
SET status = 'expired', processing_by = NULL, processing_started_at = NULL,
    requested_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes'
WHERE id = 'c1200000-0000-4000-8000-000000000072';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000002', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c1200000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"role":"instructor"}}',
  true
);
DO $$
DECLARE new_request public.password_reset_requests;
BEGIN
  new_request := public.request_student_password_reset(
    'c1200000-0000-4000-8000-000000000013',
    'c1200000-0000-4000-8000-000000000042'
  );
  IF new_request.session_id <> 'c1200000-0000-4000-8000-000000000042'::uuid THEN
    RAISE EXCEPTION 'B-owned shared-student reset was not created';
  END IF;
END;
$$;

-- Student owns their work and membership but cannot see the other student's work.
SELECT set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000011', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c1200000-0000-4000-8000-000000000011","role":"authenticated","app_metadata":{"role":"student"}}',
  true
);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.case_progress) <> 1
     OR (SELECT count(*) FROM public.session_participants) <> 1
     OR (SELECT count(*) FROM public.intervention_flags) <> 2
     OR (SELECT count(*) FROM public.student_concept_mastery) <> 1
     OR (SELECT count(*) FROM public.users) <> 1 THEN
    RAISE EXCEPTION 'Student own/session behavior regressed';
  END IF;
END;
$$;

-- Joined volunteer sees only the A session and its exact-linked Help Request.
SELECT set_config('request.jwt.claim.sub', 'c1200000-0000-4000-8000-000000000021', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"c1200000-0000-4000-8000-000000000021","role":"authenticated","app_metadata":{"role":"volunteer"}}',
  true
);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.sessions) <> 1
     OR (SELECT count(*) FROM public.case_progress) <> 2
     OR (SELECT count(*) FROM public.intervention_flags) <> 1
     OR (SELECT count(*) FROM public.users) <> 3
     OR EXISTS (
       SELECT 1 FROM public.users
       WHERE id = 'c1200000-0000-4000-8000-000000000022'
     )
     OR EXISTS (SELECT 1 FROM public.student_concept_mastery) THEN
    RAISE EXCEPTION 'Volunteer joined-session behavior regressed';
  END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
