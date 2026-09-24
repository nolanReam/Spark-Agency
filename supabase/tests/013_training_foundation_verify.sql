-- Read-only catalog verification for Migration 013. Run after applying
-- migrations through 013 in a disposable/local database or controlled target.

DO $$
DECLARE
  expected_table text;
  expected_index text;
  signature text;
  browser_function text;
BEGIN
  FOREACH expected_table IN ARRAY ARRAY[
    'skills',
    'training_missions',
    'training_mission_prerequisites',
    'training_mission_progress',
    'student_skill_verifications',
    'qualification_definitions',
    'qualification_required_skills',
    'student_qualification_attempts'
  ] LOOP
    IF to_regclass('public.' || expected_table) IS NULL THEN
      RAISE EXCEPTION 'Missing Migration 013 table: %', expected_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = expected_table
        AND relation.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', expected_table;
    END IF;

    IF has_table_privilege('anon', 'public.' || expected_table, 'SELECT')
      OR has_table_privilege('anon', 'public.' || expected_table, 'INSERT')
      OR has_table_privilege('anon', 'public.' || expected_table, 'UPDATE')
      OR has_table_privilege('anon', 'public.' || expected_table, 'DELETE')
    THEN
      RAISE EXCEPTION 'anon retains a privilege on public.%', expected_table;
    END IF;

    IF NOT has_table_privilege(
      'authenticated', 'public.' || expected_table, 'SELECT'
    ) THEN
      RAISE EXCEPTION 'authenticated lacks SELECT on public.%', expected_table;
    END IF;

    IF has_table_privilege(
      'authenticated', 'public.' || expected_table, 'INSERT'
    ) OR has_table_privilege(
      'authenticated', 'public.' || expected_table, 'UPDATE'
    ) OR has_table_privilege(
      'authenticated', 'public.' || expected_table, 'DELETE'
    ) THEN
      RAISE EXCEPTION 'authenticated retains direct DML on public.%', expected_table;
    END IF;
  END LOOP;

  FOREACH expected_index IN ARRAY ARRAY[
    'idx_training_missions_status_sequence',
    'idx_training_missions_skill',
    'idx_training_mission_prerequisites_skill',
    'idx_training_progress_student_status',
    'idx_training_progress_verification_queue',
    'idx_skill_verifications_skill_student',
    'idx_qualification_definitions_status_sequence',
    'idx_qualification_required_skills_skill',
    'idx_qualification_attempts_student_status',
    'idx_qualification_attempts_review_queue',
    'idx_qualification_attempts_one_open'
  ] LOOP
    IF to_regclass('public.' || expected_index) IS NULL THEN
      RAISE EXCEPTION 'Missing Migration 013 index: %', expected_index;
    END IF;
  END LOOP;

  IF (
    SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder)
    FROM pg_type AS enum_type
    JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
    JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
    WHERE namespace.nspname = 'public'
      AND enum_type.typname = 'training_mission_progress_status'
  ) IS DISTINCT FROM ARRAY[
    'in_progress', 'awaiting_verification', 'verified'
  ]::text[] THEN
    RAISE EXCEPTION 'Unexpected Training Mission progress statuses';
  END IF;

  IF (
    SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder)
    FROM pg_type AS enum_type
    JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
    JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
    WHERE namespace.nspname = 'public'
      AND enum_type.typname = 'skill_verification_source'
  ) IS DISTINCT FROM ARRAY[
    'mission_verification', 'instructor_test_out'
  ]::text[] THEN
    RAISE EXCEPTION 'Unexpected skill-verification sources';
  END IF;

  IF (
    SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder)
    FROM pg_type AS enum_type
    JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
    JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
    WHERE namespace.nspname = 'public'
      AND enum_type.typname = 'qualification_attempt_status'
  ) IS DISTINCT FROM ARRAY[
    'in_progress', 'awaiting_review', 'needs_retry', 'passed'
  ]::text[] THEN
    RAISE EXCEPTION 'Unexpected qualification attempt statuses';
  END IF;

  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'qualification_definitions'
      AND column_name = 'target_clearance'
  ) IS DISTINCT FROM (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_profiles'
      AND column_name = 'clearance_level'
  ) THEN
    RAISE EXCEPTION 'Qualification target clearance duplicates the clearance type';
  END IF;

  IF COALESCE((
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_profiles'
      AND column_name = 'clearance_level'
  ), '') NOT IN ('0', '0::smallint') THEN
    RAISE EXCEPTION 'Student clearance default is not Orientation (0)';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.student_profiles'::regclass
      AND conname = 'student_profiles_clearance_level_check'
      AND contype = 'c'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'Student clearance 0-5 check is missing or unvalidated';
  END IF;

  IF has_table_privilege('authenticated', 'public.student_profiles', 'INSERT')
    OR has_table_privilege('authenticated', 'public.student_profiles', 'DELETE')
  THEN
    RAISE EXCEPTION 'authenticated can create or delete student profiles';
  END IF;

  FOREACH expected_table IN ARRAY ARRAY[
    'clearance_level', 'reputation_points', 'prediction_accuracy'
  ] LOOP
    IF has_column_privilege(
      'authenticated', 'public.student_profiles', expected_table, 'UPDATE'
    ) THEN
      RAISE EXCEPTION 'authenticated can directly update protected profile column %',
        expected_table;
    END IF;
  END LOOP;

  FOREACH expected_table IN ARRAY ARRAY[
    'grade', 'age', 'interests', 'guardian_contact'
  ] LOOP
    IF NOT has_column_privilege(
      'authenticated', 'public.student_profiles', expected_table, 'UPDATE'
    ) THEN
      RAISE EXCEPTION 'authenticated lacks self-service profile column %',
        expected_table;
    END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public.start_training_mission(uuid)',
    'public.set_training_mission_step(uuid,integer)',
    'public.submit_training_mission_for_verification(uuid,uuid)',
    'public.verify_training_mission(uuid,text)',
    'public.return_training_mission(uuid,text)',
    'public.instructor_verify_skill(uuid,uuid,uuid,text)',
    'public.start_qualification(uuid,uuid)',
    'public.submit_qualification(uuid)',
    'public.review_qualification(uuid,jsonb,text,text)'
  ] LOOP
    IF has_function_privilege('anon', signature, 'EXECUTE')
      OR NOT has_function_privilege('authenticated', signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Unexpected browser RPC grant on %', signature;
    END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public.training_steps_are_valid(jsonb,boolean)',
    'public.training_step_ids(jsonb)',
    'public.qualification_rubric_is_valid(jsonb,boolean)',
    'public.qualification_rubric_codes(jsonb)',
    'public.protect_training_mission_structure()',
    'public.protect_training_prerequisite_set()',
    'public.protect_qualification_structure()',
    'public.protect_qualification_required_skill_set()',
    'public.validate_skill_verification_provenance()',
    'public.handle_new_auth_user()',
    'public.sync_auth_user_trusted_role()'
  ] LOOP
    IF has_function_privilege('anon', signature, 'EXECUTE')
      OR has_function_privilege('authenticated', signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Internal helper is browser-callable: %', signature;
    END IF;
  END LOOP;

  FOREACH browser_function IN ARRAY ARRAY[
    'start_training_mission',
    'set_training_mission_step',
    'submit_training_mission_for_verification',
    'verify_training_mission',
    'return_training_mission',
    'instructor_verify_skill',
    'start_qualification',
    'submit_qualification',
    'review_qualification',
    'current_reconciled_role',
    'handle_new_auth_user',
    'sync_auth_user_trusted_role'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = browser_function
        AND procedure.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
          WHERE setting IN ('search_path=', 'search_path=""')
        )
    ) THEN
      RAISE EXCEPTION 'Browser function % is not hardened', browser_function;
    END IF;
  END LOOP;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'skills',
        'training_missions',
        'training_mission_prerequisites',
        'training_mission_progress',
        'student_skill_verifications',
        'qualification_definitions',
        'qualification_required_skills',
        'student_qualification_attempts'
      )
      AND cmd = 'SELECT'
  ) <> 8 THEN
    RAISE EXCEPTION 'Expected one SELECT policy on each Migration 013 table';
  END IF;
END;
$$;

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'skills',
    'training_missions',
    'training_mission_prerequisites',
    'training_mission_progress',
    'student_skill_verifications',
    'qualification_definitions',
    'qualification_required_skills',
    'student_qualification_attempts'
  )
ORDER BY table_name, ordinal_position;

SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'skills',
    'training_missions',
    'training_mission_prerequisites',
    'training_mission_progress',
    'student_skill_verifications',
    'qualification_definitions',
    'qualification_required_skills',
    'student_qualification_attempts'
  )
ORDER BY tablename, policyname;
