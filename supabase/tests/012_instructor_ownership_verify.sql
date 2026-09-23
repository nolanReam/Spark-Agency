-- Read-only verification for migration 012. Run only after migration 012 has
-- been applied in a controlled target. This script does not mutate data.

DO $$
DECLARE
  approved_owner CONSTANT uuid := '00000000-0000-0000-0000-000000003001'::uuid;
  approved_case_ids CONSTANT uuid[] := ARRAY[
    'f064d9c7-d04d-4f34-b7ac-692763133329'::uuid,
    '56fe1001-625f-4dc7-a1da-262183f4474c'::uuid,
    '424ec7d5-1c1b-47a6-8c40-7c9e34296c51'::uuid
  ];
  signature text;
BEGIN
  IF (SELECT count(*) FROM public.cases
      WHERE id = ANY(approved_case_ids) AND created_by = approved_owner) <> 3 THEN
    RAISE EXCEPTION 'The three approved legacy cases were not assigned to instructor1';
  END IF;

  IF (SELECT count(*) FROM public.cases WHERE created_by IS NULL) <> 21 THEN
    RAISE EXCEPTION 'Expected exactly 21 intentionally unresolved null-owner cases';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sessions AS session_row
    LEFT JOIN public.users AS owner ON owner.id = session_row.instructor_id
    WHERE session_row.instructor_id IS NULL
       OR owner.role IS DISTINCT FROM 'instructor'::public.user_role
  ) THEN
    RAISE EXCEPTION 'A session lacks a valid public instructor owner';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sessions AS session_row
    CROSS JOIN LATERAL unnest(session_row.case_ids) AS assigned(case_id)
    LEFT JOIN public.cases AS case_row ON case_row.id = assigned.case_id
    WHERE case_row.id IS NULL
       OR case_row.created_by IS DISTINCT FROM session_row.instructor_id
  ) THEN
    RAISE EXCEPTION 'A session has a missing or cross-instructor assigned case';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'cases', 'sessions', 'session_participants', 'case_progress',
        'reviews', 'intervention_flags', 'password_reset_requests',
        'session_summaries'
      )
      AND (qual = 'public.is_instructor()' OR with_check = 'public.is_instructor()')
  ) THEN
    RAISE EXCEPTION 'A protected table retains a global instructor policy branch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('student_concept_mastery', 'concept_mastery_snapshots')
      AND (COALESCE(qual, '') ILIKE '%is_instructor%'
        OR COALESCE(with_check, '') ILIKE '%is_instructor%')
  ) THEN
    RAISE EXCEPTION 'Mastery still grants instructor access';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND COALESCE(qual, '') ILIKE '%is_instructor%'
  ) THEN
    RAISE EXCEPTION 'Organizations retain broad instructor visibility';
  END IF;

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
      RAISE EXCEPTION 'Browser/public execution remains on %', signature;
    END IF;
    IF NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role cannot execute %', signature;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
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
    RAISE EXCEPTION 'PUBLIC can execute a password lifecycle helper';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'instructor_can_access_volunteer'
      AND procedure.prosecdef
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
      AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Volunteer visibility helper is missing or insufficiently hardened';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'users_read_own'
      AND COALESCE(qual, '') ILIKE '%instructor_can_access_volunteer%'
  ) THEN
    RAISE EXCEPTION 'User policy does not scope volunteer visibility through owned sessions';
  END IF;
END;
$$;

SELECT
  procedure.proname AS function_name,
  procedure.prosecdef AS security_definer,
  procedure.proconfig AS function_settings,
  has_function_privilege('authenticated', procedure.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc AS procedure
JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
WHERE namespace.nspname = 'public'
  AND procedure.proname IN (
    'instructor_owns_session',
    'instructor_can_access_student',
    'instructor_can_access_volunteer',
    'instructor_owns_all_cases',
    'save_case_builder'
  )
ORDER BY procedure.proname;

SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'student_profiles', 'organizations', 'memberships',
    'cases', 'case_lanes', 'case_concept_weights', 'prediction_gates',
    'sessions', 'session_participants', 'case_progress', 'predictions',
    'reviews', 'review_attachments', 'reflections', 'lane_attempts',
    'intervention_flags', 'student_concept_mastery',
    'concept_mastery_snapshots', 'session_summaries',
    'password_reset_requests'
  )
ORDER BY tablename, policyname;

SELECT id, case_code, created_by
FROM public.cases
WHERE id IN (
  'f064d9c7-d04d-4f34-b7ac-692763133329',
  '56fe1001-625f-4dc7-a1da-262183f4474c',
  '424ec7d5-1c1b-47a6-8c40-7c9e34296c51'
)
ORDER BY id;

SELECT count(*) AS intentionally_unresolved_null_owner_cases
FROM public.cases
WHERE created_by IS NULL;
