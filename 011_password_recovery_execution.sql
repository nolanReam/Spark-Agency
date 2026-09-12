-- Phase 4B: secure server-side student password recovery execution.
-- These lifecycle RPCs are service-role only. Password values never enter SQL.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_password_reset_request(
  p_request_id uuid,
  p_instructor_id uuid
)
RETURNS TABLE (
  result_code text,
  reset_request_id uuid,
  student_id uuid,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_time timestamptz := clock_timestamp();
  reset_request public.password_reset_requests%ROWTYPE;
  target_role public.user_role;
BEGIN
  IF p_request_id IS NULL OR p_instructor_id IS NULL THEN
    RETURN QUERY SELECT 'INVALID_REQUEST'::text, NULL::uuid, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS instructor
    WHERE instructor.id = p_instructor_id
      AND instructor.role = 'instructor'::public.user_role
  ) THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text, p_request_id, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT request_row.*
  INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'RESET_NOT_FOUND'::text, p_request_id, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF reset_request.status NOT IN (
    'pending'::public.password_reset_status,
    'processing'::public.password_reset_status
  ) THEN
    RETURN QUERY SELECT
      'RESET_NOT_AVAILABLE'::text,
      reset_request.id,
      reset_request.student_id,
      reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.status = 'processing'::public.password_reset_status
    AND reset_request.processing_started_at > request_time - interval '2 minutes'
  THEN
    RETURN QUERY SELECT
      'RESET_ALREADY_PROCESSING'::text,
      reset_request.id,
      reset_request.student_id,
      reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.expires_at <= request_time THEN
    UPDATE public.password_reset_requests
    SET status = 'expired'::public.password_reset_status,
        processing_by = NULL,
        processing_started_at = NULL
    WHERE id = reset_request.id;

    RETURN QUERY SELECT
      'RESET_EXPIRED'::text,
      reset_request.id,
      reset_request.student_id,
      reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.attempt_count >= 3 THEN
    UPDATE public.password_reset_requests
    SET status = 'failed'::public.password_reset_status,
        processing_by = NULL,
        processing_started_at = NULL
    WHERE id = reset_request.id;

    RETURN QUERY SELECT
      'RESET_ATTEMPTS_EXHAUSTED'::text,
      reset_request.id,
      reset_request.student_id,
      reset_request.attempt_count;
    RETURN;
  END IF;

  SELECT app_user.role
  INTO target_role
  FROM public.users AS app_user
  WHERE app_user.id = reset_request.student_id;

  IF NOT FOUND OR target_role <> 'student'::public.user_role THEN
    UPDATE public.password_reset_requests
    SET status = 'failed'::public.password_reset_status,
        processing_by = NULL,
        processing_started_at = NULL,
        last_failure_at = request_time,
        last_failure_code = 'target_not_student'
    WHERE id = reset_request.id;

    RETURN QUERY SELECT
      'TARGET_NOT_STUDENT'::text,
      reset_request.id,
      reset_request.student_id,
      reset_request.attempt_count;
    RETURN;
  END IF;

  UPDATE public.password_reset_requests
  SET status = 'processing'::public.password_reset_status,
      processing_by = p_instructor_id,
      processing_started_at = request_time,
      attempt_count = reset_request.attempt_count + 1,
      last_attempt_at = request_time
  WHERE id = reset_request.id
  RETURNING password_reset_requests.attempt_count
  INTO reset_request.attempt_count;

  RETURN QUERY SELECT
    'CLAIMED'::text,
    reset_request.id,
    reset_request.student_id,
    reset_request.attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_student_password_change_requirement(
  p_request_id uuid,
  p_instructor_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  reset_request public.password_reset_requests%ROWTYPE;
  existing_request_id uuid;
BEGIN
  SELECT request_row.*
  INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND
    OR reset_request.status <> 'processing'::public.password_reset_status
    OR reset_request.processing_by IS DISTINCT FROM p_instructor_id
  THEN
    RETURN 'RESET_NOT_AVAILABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS student
    WHERE student.id = reset_request.student_id
      AND student.role = 'student'::public.user_role
  ) THEN
    RETURN 'TARGET_NOT_STUDENT';
  END IF;

  SELECT requirement.reset_request_id
  INTO existing_request_id
  FROM public.student_password_change_requirements AS requirement
  WHERE requirement.student_id = reset_request.student_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_request_id = reset_request.id THEN
      RETURN 'REQUIREMENT_READY';
    END IF;
    RETURN 'REQUIREMENT_MISMATCH';
  END IF;

  INSERT INTO public.student_password_change_requirements (
    student_id,
    reset_request_id
  ) VALUES (
    reset_request.student_id,
    reset_request.id
  );

  RETURN 'REQUIREMENT_READY';
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_password_reset_attempt(
  p_request_id uuid,
  p_instructor_id uuid,
  p_failure_code text
)
RETURNS public.password_reset_status
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_time timestamptz := clock_timestamp();
  reset_request public.password_reset_requests%ROWTYPE;
  next_status public.password_reset_status;
BEGIN
  IF p_failure_code NOT IN (
    'auth_password_update_failed',
    'requirement_conflict',
    'target_lookup_failed',
    'target_not_student'
  ) THEN
    RAISE EXCEPTION 'Invalid password reset failure code' USING ERRCODE = '22023';
  END IF;

  SELECT request_row.*
  INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND
    OR reset_request.status <> 'processing'::public.password_reset_status
    OR reset_request.processing_by IS DISTINCT FROM p_instructor_id
  THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.student_password_change_requirements AS requirement
  WHERE requirement.student_id = reset_request.student_id
    AND requirement.reset_request_id = reset_request.id;

  next_status := CASE
    WHEN reset_request.attempt_count >= 3
      THEN 'failed'::public.password_reset_status
    ELSE 'pending'::public.password_reset_status
  END;

  UPDATE public.password_reset_requests
  SET status = next_status,
      processing_by = NULL,
      processing_started_at = NULL,
      last_failure_at = request_time,
      last_failure_code = p_failure_code
  WHERE id = reset_request.id;

  RETURN next_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_password_reset(
  p_request_id uuid,
  p_instructor_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_time timestamptz := clock_timestamp();
  reset_request public.password_reset_requests%ROWTYPE;
BEGIN
  SELECT request_row.*
  INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND
    OR reset_request.status <> 'processing'::public.password_reset_status
    OR reset_request.processing_by IS DISTINCT FROM p_instructor_id
  THEN
    RETURN 'RESET_NOT_AVAILABLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS student
    WHERE student.id = reset_request.student_id
      AND student.role = 'student'::public.user_role
  ) THEN
    RETURN 'TARGET_NOT_STUDENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.student_password_change_requirements AS requirement
    WHERE requirement.student_id = reset_request.student_id
      AND requirement.reset_request_id = reset_request.id
  ) THEN
    RETURN 'REQUIREMENT_MISMATCH';
  END IF;

  UPDATE public.password_reset_requests
  SET status = 'completed'::public.password_reset_status,
      handled_by = p_instructor_id,
      handled_at = request_time,
      processing_by = NULL,
      processing_started_at = NULL
  WHERE id = reset_request.id;

  RETURN 'RESET_COMPLETED';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_student_password_change(
  p_student_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  requirement_request_id uuid;
  reset_request public.password_reset_requests%ROWTYPE;
BEGIN
  SELECT requirement.reset_request_id
  INTO requirement_request_id
  FROM public.student_password_change_requirements AS requirement
  WHERE requirement.student_id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT request_row.*
  INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.id = requirement_request_id
  FOR UPDATE;

  IF NOT FOUND
    OR reset_request.status <> 'completed'::public.password_reset_status
    OR reset_request.student_id IS DISTINCT FROM p_student_id
  THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.student_password_change_requirements AS requirement
  WHERE requirement.student_id = p_student_id
    AND requirement.reset_request_id = reset_request.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.password_reset_requests
  SET password_changed_at = clock_timestamp()
  WHERE id = reset_request.id
    AND student_id = p_student_id
    AND status = 'completed'::public.password_reset_status;

  RETURN reset_request.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_password_reset_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_student_password_change_requirement(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_password_reset_attempt(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_password_reset(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_student_password_change(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_password_reset_request(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_student_password_change_requirement(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_password_reset_attempt(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_password_reset(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_student_password_change(uuid)
  TO service_role;

COMMIT;
