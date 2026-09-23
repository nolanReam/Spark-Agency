-- Phase 4B lifecycle tests with migration 012 ownership expectations. Run only
-- against a disposable/local database after migrations through 012.

BEGIN;

INSERT INTO public.users (id, username, role, display_name) VALUES
  ('b4000000-0000-4000-8000-000000000001', 'phase4b_instructor_1', 'instructor', 'Phase 4B Instructor 1'),
  ('b4000000-0000-4000-8000-000000000002', 'phase4b_instructor_2', 'instructor', 'Phase 4B Instructor 2'),
  ('b4000000-0000-4000-8000-000000000011', 'phase4b_student_1', 'student', 'Phase 4B Student 1'),
  ('b4000000-0000-4000-8000-000000000012', 'phase4b_student_2', 'student', 'Phase 4B Student 2'),
  ('b4000000-0000-4000-8000-000000000013', 'phase4b_student_3', 'student', 'Phase 4B Student 3');

INSERT INTO public.sessions (
  id, instructor_id, session_code, status
) VALUES (
  'b4000000-0000-4000-8000-000000000020',
  'b4000000-0000-4000-8000-000000000001',
  'P4BTEST1',
  'active'
);

-- Request 31 is the claim/lease/failure-cap fixture.
INSERT INTO public.password_reset_requests (
  id, student_id, session_id, requested_by, expires_at
) VALUES (
  'b4000000-0000-4000-8000-000000000031',
  'b4000000-0000-4000-8000-000000000011',
  'b4000000-0000-4000-8000-000000000020',
  'b4000000-0000-4000-8000-000000000001',
  now() + interval '30 minutes'
);

DO $$
DECLARE
  claim record;
BEGIN
  SELECT * INTO claim
  FROM public.claim_password_reset_request(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000001'
  );
  IF claim.result_code <> 'CLAIMED' OR claim.attempt_count <> 1 THEN
    RAISE EXCEPTION 'first claim assertion failed: %', row_to_json(claim);
  END IF;

  SELECT * INTO claim
  FROM public.claim_password_reset_request(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000002'
  );
  IF claim.result_code <> 'FORBIDDEN' THEN
    RAISE EXCEPTION 'cross-instructor active claim was not forbidden: %', row_to_json(claim);
  END IF;
END;
$$;

DO $$
DECLARE
  result text;
BEGIN
  result := public.ensure_student_password_change_requirement(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000001'
  );
  IF result <> 'REQUIREMENT_READY' THEN
    RAISE EXCEPTION 'requirement creation assertion failed: %', result;
  END IF;

  result := public.ensure_student_password_change_requirement(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000001'
  );
  IF result <> 'REQUIREMENT_READY' THEN
    RAISE EXCEPTION 'requirement idempotency assertion failed: %', result;
  END IF;
END;
$$;

-- A completed historical request gives the same student a valid but mismatched
-- requirement target. The active request must reject it.
INSERT INTO public.password_reset_requests (
  id, student_id, session_id, requested_by, requested_at, expires_at,
  status, handled_by, handled_at
) VALUES (
  'b4000000-0000-4000-8000-000000000032',
  'b4000000-0000-4000-8000-000000000011',
  'b4000000-0000-4000-8000-000000000020',
  'b4000000-0000-4000-8000-000000000001',
  now() - interval '1 hour',
  now() - interval '30 minutes',
  'completed',
  'b4000000-0000-4000-8000-000000000001',
  now() - interval '45 minutes'
);
UPDATE public.student_password_change_requirements
SET reset_request_id = 'b4000000-0000-4000-8000-000000000032'
WHERE student_id = 'b4000000-0000-4000-8000-000000000011';

DO $$
BEGIN
  IF public.ensure_student_password_change_requirement(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000001'
  ) <> 'REQUIREMENT_MISMATCH' THEN
    RAISE EXCEPTION 'mismatched requirement was not rejected';
  END IF;
END;
$$;

-- Restore request 31's requirement, and create a separate requirement that a
-- failure transition for request 31 must not remove.
UPDATE public.student_password_change_requirements
SET reset_request_id = 'b4000000-0000-4000-8000-000000000031'
WHERE student_id = 'b4000000-0000-4000-8000-000000000011';

INSERT INTO public.password_reset_requests (
  id, student_id, session_id, requested_by, requested_at, expires_at,
  status, processing_by, processing_started_at, attempt_count, last_attempt_at
) VALUES (
  'b4000000-0000-4000-8000-000000000033',
  'b4000000-0000-4000-8000-000000000012',
  'b4000000-0000-4000-8000-000000000020',
  'b4000000-0000-4000-8000-000000000001',
  now(),
  now() + interval '30 minutes',
  'processing',
  'b4000000-0000-4000-8000-000000000001',
  now(),
  1,
  now()
);
INSERT INTO public.student_password_change_requirements (student_id, reset_request_id)
VALUES (
  'b4000000-0000-4000-8000-000000000012',
  'b4000000-0000-4000-8000-000000000033'
);

DO $$
DECLARE
  next_status public.password_reset_status;
BEGIN
  next_status := public.fail_password_reset_attempt(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000001',
    'auth_password_update_failed'
  );
  IF next_status <> 'pending'::public.password_reset_status THEN
    RAISE EXCEPTION 'pre-cap failure did not return to pending: %', next_status;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.student_password_change_requirements
    WHERE reset_request_id = 'b4000000-0000-4000-8000-000000000031'
  ) THEN
    RAISE EXCEPTION 'matching provisional requirement was retained';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_password_change_requirements
    WHERE reset_request_id = 'b4000000-0000-4000-8000-000000000033'
  ) THEN
    RAISE EXCEPTION 'unrelated requirement was removed';
  END IF;
END;
$$;

-- Claim request 31 again, age its lease, reject another instructor, then let
-- the owning instructor reclaim it.
DO $$
DECLARE
  claim record;
BEGIN
  SELECT * INTO claim
  FROM public.claim_password_reset_request(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000001'
  );
  IF claim.result_code <> 'CLAIMED' OR claim.attempt_count <> 2 THEN
    RAISE EXCEPTION 'second attempt assertion failed: %', row_to_json(claim);
  END IF;

  UPDATE public.password_reset_requests
  SET processing_started_at = now() - interval '3 minutes'
  WHERE id = 'b4000000-0000-4000-8000-000000000031';

  SELECT * INTO claim
  FROM public.claim_password_reset_request(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000002'
  );
  IF claim.result_code <> 'FORBIDDEN' THEN
    RAISE EXCEPTION 'cross-instructor stale lease claim was not forbidden: %', row_to_json(claim);
  END IF;

  SELECT * INTO claim
  FROM public.claim_password_reset_request(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000001'
  );
  IF claim.result_code <> 'CLAIMED' OR claim.attempt_count <> 3 THEN
    RAISE EXCEPTION 'owner stale lease reclaim assertion failed: %', row_to_json(claim);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.password_reset_requests
    WHERE id = 'b4000000-0000-4000-8000-000000000031'
      AND processing_by = 'b4000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'stale lease did not retain the owning processing actor';
  END IF;
END;
$$;

DO $$
BEGIN
  IF public.fail_password_reset_attempt(
    'b4000000-0000-4000-8000-000000000031',
    'b4000000-0000-4000-8000-000000000001',
    'auth_password_update_failed'
  ) <> 'failed'::public.password_reset_status THEN
    RAISE EXCEPTION 'final failure did not exhaust request';
  END IF;
END;
$$;

-- Request 33 exercises successful reset completion and student completion.
DO $$
BEGIN
  IF public.complete_password_reset(
    'b4000000-0000-4000-8000-000000000033',
    'b4000000-0000-4000-8000-000000000001'
  ) <> 'RESET_COMPLETED' THEN
    RAISE EXCEPTION 'reset completion failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.password_reset_requests
    WHERE id = 'b4000000-0000-4000-8000-000000000033'
      AND status = 'completed'
      AND handled_by = 'b4000000-0000-4000-8000-000000000001'
      AND handled_at IS NOT NULL
      AND processing_by IS NULL
      AND processing_started_at IS NULL
      AND password_changed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'completed reset metadata assertion failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_password_change_requirements
    WHERE reset_request_id = 'b4000000-0000-4000-8000-000000000033'
  ) THEN
    RAISE EXCEPTION 'successful reset removed its requirement';
  END IF;
END;
$$;

DO $$
DECLARE
  completed_request_id uuid;
BEGIN
  completed_request_id := public.complete_student_password_change(
    'b4000000-0000-4000-8000-000000000012'
  );
  IF completed_request_id <> 'b4000000-0000-4000-8000-000000000033'::uuid THEN
    RAISE EXCEPTION 'student password completion returned wrong request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.student_password_change_requirements
    WHERE student_id = 'b4000000-0000-4000-8000-000000000012'
  ) THEN
    RAISE EXCEPTION 'student completion retained requirement';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.password_reset_requests
    WHERE id = 'b4000000-0000-4000-8000-000000000033'
      AND password_changed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'student completion did not set password_changed_at';
  END IF;
END;
$$;

-- Expired work is rejected and persisted as expired before any Auth caller
-- could use the returned result to continue execution.
INSERT INTO public.password_reset_requests (
  id, student_id, session_id, requested_by, requested_at, expires_at
) VALUES (
  'b4000000-0000-4000-8000-000000000035',
  'b4000000-0000-4000-8000-000000000012',
  'b4000000-0000-4000-8000-000000000020',
  'b4000000-0000-4000-8000-000000000001',
  now() - interval '1 hour',
  now() - interval '30 minutes'
);

DO $$
DECLARE
  claim record;
BEGIN
  SELECT * INTO claim
  FROM public.claim_password_reset_request(
    'b4000000-0000-4000-8000-000000000035',
    'b4000000-0000-4000-8000-000000000001'
  );
  IF claim.result_code <> 'RESET_EXPIRED' THEN
    RAISE EXCEPTION 'expired request assertion failed: %', row_to_json(claim);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.password_reset_requests
    WHERE id = 'b4000000-0000-4000-8000-000000000035'
      AND status = 'expired'
  ) THEN
    RAISE EXCEPTION 'expired status was not persisted';
  END IF;
END;
$$;

-- A pending request already at the cap must become failed without a new claim.
INSERT INTO public.password_reset_requests (
  id, student_id, session_id, requested_by, expires_at,
  attempt_count, last_attempt_at
) VALUES (
  'b4000000-0000-4000-8000-000000000034',
  'b4000000-0000-4000-8000-000000000013',
  'b4000000-0000-4000-8000-000000000020',
  'b4000000-0000-4000-8000-000000000001',
  now() + interval '30 minutes',
  3,
  now()
);

DO $$
DECLARE
  claim record;
BEGIN
  SELECT * INTO claim
  FROM public.claim_password_reset_request(
    'b4000000-0000-4000-8000-000000000034',
    'b4000000-0000-4000-8000-000000000001'
  );
  IF claim.result_code <> 'RESET_ATTEMPTS_EXHAUSTED' THEN
    RAISE EXCEPTION 'attempt cap assertion failed: %', row_to_json(claim);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.password_reset_requests
    WHERE id = 'b4000000-0000-4000-8000-000000000034'
      AND status = 'failed'
      AND attempt_count = 3
  ) THEN
    RAISE EXCEPTION 'attempt cap did not persist failed status';
  END IF;
END;
$$;

DO $$
DECLARE
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.claim_password_reset_request(uuid,uuid)',
    'public.ensure_student_password_change_requirement(uuid,uuid)',
    'public.fail_password_reset_attempt(uuid,uuid,text)',
    'public.complete_password_reset(uuid,uuid)',
    'public.complete_student_password_change(uuid)'
  ] LOOP
    IF has_function_privilege('anon', signature, 'EXECUTE')
      OR has_function_privilege('authenticated', signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'browser role can execute %', signature;
    END IF;
    IF NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role cannot execute %', signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND grantee = 'PUBLIC'
      AND privilege_type = 'EXECUTE'
      AND routine_name IN (
        'claim_password_reset_request',
        'ensure_student_password_change_requirement',
        'fail_password_reset_attempt',
        'complete_password_reset',
        'complete_student_password_change'
      )
  ) THEN
    RAISE EXCEPTION 'PUBLIC can execute a Phase 4B lifecycle helper';
  END IF;
END;
$$;

ROLLBACK;
