-- Instructor workspace ownership cutover.
-- This migration intentionally leaves unassigned legacy cases and ambiguous
-- intervention rows in place; the new policies make them fail closed.

BEGIN;

DO $$
DECLARE
  approved_case_ids CONSTANT uuid[] := ARRAY[
    'f064d9c7-d04d-4f34-b7ac-692763133329'::uuid,
    '56fe1001-625f-4dc7-a1da-262183f4474c'::uuid,
    '424ec7d5-1c1b-47a6-8c40-7c9e34296c51'::uuid
  ];
  approved_owner CONSTANT uuid := '00000000-0000-0000-0000-000000003001'::uuid;
  updated_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS app_user
    JOIN auth.users AS auth_user ON auth_user.id = app_user.id
    WHERE app_user.id = approved_owner
      AND app_user.role = 'instructor'::public.user_role
      AND auth_user.raw_app_meta_data ->> 'role' = 'instructor'
  ) THEN
    RAISE EXCEPTION 'Approved legacy case owner is not a reconciled instructor';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions AS session_row
    LEFT JOIN public.users AS app_user ON app_user.id = session_row.instructor_id
    LEFT JOIN auth.users AS auth_user ON auth_user.id = session_row.instructor_id
    WHERE session_row.instructor_id IS NULL
       OR app_user.role IS DISTINCT FROM 'instructor'::public.user_role
       OR auth_user.raw_app_meta_data ->> 'role' IS DISTINCT FROM 'instructor'
  ) THEN
    RAISE EXCEPTION 'Every existing session must have a reconciled instructor owner';
  END IF;

  IF (
    SELECT count(*)
    FROM public.cases AS case_row
    WHERE case_row.id = ANY(approved_case_ids)
      AND case_row.created_by IS NULL
  ) <> cardinality(approved_case_ids) THEN
    RAISE EXCEPTION 'Approved legacy cases are missing or no longer null-owned';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(approved_case_ids) AS approved_case(case_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.sessions AS session_row
      WHERE session_row.case_ids @> ARRAY[approved_case.case_id]
        AND session_row.instructor_id = approved_owner
    )
       OR EXISTS (
      SELECT 1
      FROM public.sessions AS session_row
      WHERE session_row.case_ids @> ARRAY[approved_case.case_id]
        AND session_row.instructor_id IS DISTINCT FROM approved_owner
    )
  ) THEN
    RAISE EXCEPTION 'Approved legacy cases do not have the expected session-derived owner';
  END IF;

  UPDATE public.cases
  SET created_by = approved_owner
  WHERE id = ANY(approved_case_ids)
    AND created_by IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> cardinality(approved_case_ids) THEN
    RAISE EXCEPTION 'Expected three guarded legacy case backfills, updated %', updated_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions AS session_row
    CROSS JOIN LATERAL unnest(session_row.case_ids) AS assigned(case_id)
    LEFT JOIN public.cases AS case_row ON case_row.id = assigned.case_id
    WHERE case_row.id IS NULL
       OR case_row.created_by IS DISTINCT FROM session_row.instructor_id
  ) THEN
    RAISE EXCEPTION 'Cross-instructor or missing session case assignment remains';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_cases_created_by
  ON public.cases (created_by);
CREATE INDEX IF NOT EXISTS idx_sessions_instructor_status_started
  ON public.sessions (instructor_id, status, started_at DESC);

-- These SECURITY DEFINER helpers expose only booleans and derive the browser
-- caller from auth.uid(). They avoid recursive RLS through sessions and
-- session_participants.
CREATE OR REPLACE FUNCTION public.instructor_owns_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'instructor',
      false
    )
    AND EXISTS (
      SELECT 1
      FROM public.users AS instructor
      JOIN public.sessions AS owned_session
        ON owned_session.instructor_id = instructor.id
      WHERE instructor.id = (SELECT auth.uid())
        AND instructor.role = 'instructor'::public.user_role
        AND owned_session.id = p_session_id
    );
$$;

CREATE OR REPLACE FUNCTION public.instructor_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'instructor',
      false
    )
    AND EXISTS (
      SELECT 1
      FROM public.users AS instructor
      JOIN public.sessions AS owned_session
        ON owned_session.instructor_id = instructor.id
      JOIN public.session_participants AS participant
        ON participant.session_id = owned_session.id
      WHERE instructor.id = (SELECT auth.uid())
        AND instructor.role = 'instructor'::public.user_role
        AND participant.student_id = p_student_id
    );
$$;

CREATE OR REPLACE FUNCTION public.instructor_can_access_volunteer(p_volunteer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'instructor',
      false
    )
    AND EXISTS (
      SELECT 1
      FROM public.users AS instructor
      JOIN public.sessions AS owned_session
        ON owned_session.instructor_id = instructor.id
      JOIN public.session_participants AS participant
        ON participant.session_id = owned_session.id
      JOIN public.users AS volunteer
        ON volunteer.id = participant.student_id
      WHERE instructor.id = (SELECT auth.uid())
        AND instructor.role = 'instructor'::public.user_role
        AND volunteer.id = p_volunteer_id
        AND volunteer.role = 'volunteer'::public.user_role
    );
$$;

CREATE OR REPLACE FUNCTION public.instructor_owns_all_cases(p_case_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_case_ids IS NOT NULL
    AND (SELECT auth.uid()) IS NOT NULL
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'instructor',
      false
    )
    AND EXISTS (
      SELECT 1 FROM public.users AS instructor
      WHERE instructor.id = (SELECT auth.uid())
        AND instructor.role = 'instructor'::public.user_role
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p_case_ids) AS assigned(case_id)
      LEFT JOIN public.cases AS case_row ON case_row.id = assigned.case_id
      WHERE case_row.id IS NULL
         OR case_row.created_by IS DISTINCT FROM (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.instructor_owns_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.instructor_can_access_student(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.instructor_can_access_volunteer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.instructor_owns_all_cases(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instructor_owns_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.instructor_can_access_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.instructor_can_access_volunteer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.instructor_owns_all_cases(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_case_builder(
  p_case_id uuid,
  p_case_data jsonb,
  p_lanes jsonb,
  p_concept_weights jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  saved_case_id uuid;
  supported_concepts CONSTANT text[] := ARRAY[
    'Variables', 'Loops', 'Conditionals', 'Events',
    'Operators', 'Lists', 'Functions', 'Custom Blocks'
  ];
BEGIN
  IF caller_id IS NULL OR NOT COALESCE(public.is_instructor(), false) THEN
    RAISE EXCEPTION 'Instructor role required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users AS instructor
    WHERE instructor.id = caller_id
      AND instructor.role = 'instructor'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Instructor role is not reconciled' USING ERRCODE = '42501';
  END IF;

  IF p_case_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cases AS owned_case
    WHERE owned_case.id = p_case_id
      AND owned_case.created_by = caller_id
  ) THEN
    RAISE EXCEPTION 'Case is not available' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_case_data ->> 'status', '') NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Case Builder status must be draft or published' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_lanes) IS DISTINCT FROM 'array'
     OR (SELECT count(*) FROM jsonb_array_elements(p_lanes)) <> 3
     OR (SELECT count(DISTINCT lane)
         FROM jsonb_to_recordset(p_lanes) AS lane_row(lane text)) <> 3
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_lanes) AS lane_row(lane text, description text, available boolean)
       WHERE lane_row.lane NOT IN ('Required', 'Extension', 'Challenge')
          OR lane_row.description IS NULL
          OR lane_row.available IS NULL
     ) THEN
    RAISE EXCEPTION 'Case Builder requires exactly Required, Extension, and Challenge lanes' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_concept_weights) IS DISTINCT FROM 'array'
     OR (SELECT count(*) FROM jsonb_array_elements(p_concept_weights)) <> array_length(supported_concepts, 1)
     OR (SELECT count(DISTINCT concept)
         FROM jsonb_to_recordset(p_concept_weights) AS weight_row(concept text)) <> array_length(supported_concepts, 1)
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_concept_weights) AS weight_row(concept text, points integer)
       WHERE NOT (weight_row.concept = ANY(supported_concepts))
          OR weight_row.points IS NULL
          OR weight_row.points NOT BETWEEN 0 AND 15
     ) THEN
    RAISE EXCEPTION 'Case Builder requires one 0-15 weight for every supported concept' USING ERRCODE = '22023';
  END IF;

  IF p_case_id IS NULL THEN
    INSERT INTO public.cases (
      case_code, title, client_brief, mission, constraints, tools_allowed,
      difficulty_lane, concept_tags, min_clearance, status,
      predict_prove_prompt, reflection_prompt, transfer_hint,
      reputation_reward, estimated_minutes, created_by
    ) VALUES (
      NULLIF(btrim(p_case_data ->> 'case_code'), ''),
      p_case_data ->> 'title',
      COALESCE(p_case_data ->> 'client_brief', ''),
      COALESCE(p_case_data ->> 'mission', ''),
      NULLIF(p_case_data ->> 'constraints', ''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_case_data -> 'tools_allowed', '[]'::jsonb))),
      (p_case_data ->> 'difficulty_lane')::public.difficulty_lane,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_case_data -> 'concept_tags', '[]'::jsonb))),
      (p_case_data ->> 'min_clearance')::smallint,
      (p_case_data ->> 'status')::public.case_status,
      NULLIF(p_case_data ->> 'predict_prove_prompt', ''),
      NULLIF(p_case_data ->> 'reflection_prompt', ''),
      NULLIF(p_case_data ->> 'transfer_hint', ''),
      (p_case_data ->> 'reputation_reward')::smallint,
      (p_case_data ->> 'estimated_minutes')::smallint,
      caller_id
    )
    RETURNING id INTO saved_case_id;
  ELSE
    UPDATE public.cases
    SET case_code = NULLIF(btrim(p_case_data ->> 'case_code'), ''),
        title = p_case_data ->> 'title',
        client_brief = COALESCE(p_case_data ->> 'client_brief', ''),
        mission = COALESCE(p_case_data ->> 'mission', ''),
        constraints = NULLIF(p_case_data ->> 'constraints', ''),
        tools_allowed = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_case_data -> 'tools_allowed', '[]'::jsonb))),
        difficulty_lane = (p_case_data ->> 'difficulty_lane')::public.difficulty_lane,
        concept_tags = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_case_data -> 'concept_tags', '[]'::jsonb))),
        min_clearance = (p_case_data ->> 'min_clearance')::smallint,
        status = (p_case_data ->> 'status')::public.case_status,
        predict_prove_prompt = NULLIF(p_case_data ->> 'predict_prove_prompt', ''),
        reflection_prompt = NULLIF(p_case_data ->> 'reflection_prompt', ''),
        transfer_hint = NULLIF(p_case_data ->> 'transfer_hint', ''),
        reputation_reward = (p_case_data ->> 'reputation_reward')::smallint,
        estimated_minutes = (p_case_data ->> 'estimated_minutes')::smallint
    WHERE id = p_case_id
      AND created_by = caller_id
    RETURNING id INTO saved_case_id;

    IF saved_case_id IS NULL THEN
      RAISE EXCEPTION 'Case is not available' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.case_lanes (case_id, lane, description, available)
  SELECT saved_case_id, lane_row.lane::public.lane_type, lane_row.description, lane_row.available
  FROM jsonb_to_recordset(p_lanes) AS lane_row(lane text, description text, available boolean)
  ON CONFLICT (case_id, lane) DO UPDATE
    SET description = EXCLUDED.description,
        available = EXCLUDED.available;

  INSERT INTO public.case_concept_weights (case_id, concept, points)
  SELECT saved_case_id, weight_row.concept, weight_row.points::smallint
  FROM jsonb_to_recordset(p_concept_weights) AS weight_row(concept text, points integer)
  ON CONFLICT (case_id, concept) DO UPDATE
    SET points = EXCLUDED.points;

  RETURN saved_case_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_case_builder(uuid, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_case_builder(uuid, jsonb, jsonb, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.request_student_password_reset(
  p_student_id uuid,
  p_session_id uuid
)
RETURNS public.password_reset_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id public.users.id%TYPE := auth.uid();
  trusted_role text := (auth.jwt() -> 'app_metadata' ->> 'role');
  requester_role public.user_role;
  target_role public.user_role;
  request_time timestamptz := now();
  reset_request public.password_reset_requests%ROWTYPE;
  may_reuse_request boolean;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_student_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'Student and session are required' USING ERRCODE = '22023';
  END IF;

  SELECT app_user.role INTO requester_role
  FROM public.users AS app_user
  WHERE app_user.id = requester_id;
  IF NOT FOUND
    OR trusted_role NOT IN ('volunteer', 'instructor')
    OR requester_role::text IS DISTINCT FROM trusted_role
  THEN
    RAISE EXCEPTION 'Volunteer or instructor role required' USING ERRCODE = '42501';
  END IF;

  SELECT app_user.role INTO target_role
  FROM public.users AS app_user
  WHERE app_user.id = p_student_id
  FOR UPDATE;
  IF NOT FOUND OR target_role <> 'student'::public.user_role THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.session_participants AS participant
    WHERE participant.session_id = p_session_id
      AND participant.student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'Student is not joined to the supplied session' USING ERRCODE = '42501';
  END IF;

  IF requester_role = 'instructor'::public.user_role
    AND NOT public.instructor_owns_session(p_session_id)
  THEN
    RAISE EXCEPTION 'Session is not available' USING ERRCODE = '42501';
  END IF;

  IF requester_role = 'volunteer'::public.user_role
    AND NOT EXISTS (
      SELECT 1 FROM public.session_participants AS participant
      WHERE participant.session_id = p_session_id
        AND participant.student_id = requester_id
    )
  THEN
    RAISE EXCEPTION 'Volunteer is not joined to the supplied session' USING ERRCODE = '42501';
  END IF;

  UPDATE public.password_reset_requests
  SET status = 'expired'::public.password_reset_status
  WHERE student_id = p_student_id
    AND status = 'pending'::public.password_reset_status
    AND expires_at <= request_time;

  SELECT request_row.* INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.student_id = p_student_id
    AND request_row.status IN (
      'pending'::public.password_reset_status,
      'processing'::public.password_reset_status
    )
  ORDER BY request_row.requested_at
  LIMIT 1;

  IF FOUND THEN
    may_reuse_request := CASE requester_role
      WHEN 'instructor'::public.user_role
        THEN public.instructor_owns_session(reset_request.session_id)
      WHEN 'volunteer'::public.user_role
        THEN reset_request.requested_by = requester_id
          AND EXISTS (
            SELECT 1 FROM public.session_participants AS participant
            WHERE participant.session_id = reset_request.session_id
              AND participant.student_id = requester_id
          )
      ELSE false
    END;
    IF NOT may_reuse_request THEN
      RAISE EXCEPTION 'An active password reset request already exists'
        USING ERRCODE = '55000';
    END IF;
    RETURN reset_request;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.password_reset_requests AS recent_request
    WHERE recent_request.student_id = p_student_id
      AND recent_request.requested_at > request_time - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'Password reset request cooldown is active' USING ERRCODE = '55000';
  END IF;

  BEGIN
    INSERT INTO public.password_reset_requests (
      student_id, session_id, requested_by, requested_at, expires_at
    ) VALUES (
      p_student_id, p_session_id, requester_id, request_time,
      request_time + interval '30 minutes'
    ) RETURNING * INTO reset_request;
  EXCEPTION WHEN unique_violation THEN
    SELECT request_row.* INTO reset_request
    FROM public.password_reset_requests AS request_row
    WHERE request_row.student_id = p_student_id
      AND request_row.status IN (
        'pending'::public.password_reset_status,
        'processing'::public.password_reset_status
      )
    ORDER BY request_row.requested_at
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    may_reuse_request := CASE requester_role
      WHEN 'instructor'::public.user_role
        THEN public.instructor_owns_session(reset_request.session_id)
      WHEN 'volunteer'::public.user_role
        THEN reset_request.requested_by = requester_id
          AND EXISTS (
            SELECT 1 FROM public.session_participants AS participant
            WHERE participant.session_id = reset_request.session_id
              AND participant.student_id = requester_id
          )
      ELSE false
    END;
    IF NOT may_reuse_request THEN
      RAISE EXCEPTION 'An active password reset request already exists'
        USING ERRCODE = '55000';
    END IF;
  END;

  RETURN reset_request;
END;
$$;

REVOKE ALL ON FUNCTION public.request_student_password_reset(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_student_password_reset(uuid, uuid)
  TO authenticated;

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
    SELECT 1 FROM public.users AS instructor
    WHERE instructor.id = p_instructor_id
      AND instructor.role = 'instructor'::public.user_role
  ) THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text, p_request_id, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  SELECT request_row.* INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'RESET_NOT_FOUND'::text, p_request_id, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sessions AS owned_session
    WHERE owned_session.id = reset_request.session_id
      AND owned_session.instructor_id = p_instructor_id
  ) THEN
    RETURN QUERY SELECT 'FORBIDDEN'::text, p_request_id, NULL::uuid, NULL::integer;
    RETURN;
  END IF;

  IF reset_request.status NOT IN (
    'pending'::public.password_reset_status,
    'processing'::public.password_reset_status
  ) THEN
    RETURN QUERY SELECT 'RESET_NOT_AVAILABLE'::text, reset_request.id,
      reset_request.student_id, reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.status = 'processing'::public.password_reset_status
    AND reset_request.processing_started_at > request_time - interval '2 minutes'
  THEN
    RETURN QUERY SELECT 'RESET_ALREADY_PROCESSING'::text, reset_request.id,
      reset_request.student_id, reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.expires_at <= request_time THEN
    UPDATE public.password_reset_requests
    SET status = 'expired'::public.password_reset_status,
        processing_by = NULL,
        processing_started_at = NULL
    WHERE id = reset_request.id;
    RETURN QUERY SELECT 'RESET_EXPIRED'::text, reset_request.id,
      reset_request.student_id, reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.attempt_count >= 3 THEN
    UPDATE public.password_reset_requests
    SET status = 'failed'::public.password_reset_status,
        processing_by = NULL,
        processing_started_at = NULL
    WHERE id = reset_request.id;
    RETURN QUERY SELECT 'RESET_ATTEMPTS_EXHAUSTED'::text, reset_request.id,
      reset_request.student_id, reset_request.attempt_count;
    RETURN;
  END IF;

  SELECT app_user.role INTO target_role
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
    RETURN QUERY SELECT 'TARGET_NOT_STUDENT'::text, reset_request.id,
      reset_request.student_id, reset_request.attempt_count;
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

  RETURN QUERY SELECT 'CLAIMED'::text, reset_request.id,
    reset_request.student_id, reset_request.attempt_count;
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
  SELECT request_row.* INTO reset_request
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
    SELECT 1 FROM public.sessions AS owned_session
    JOIN public.users AS instructor ON instructor.id = owned_session.instructor_id
    WHERE owned_session.id = reset_request.session_id
      AND owned_session.instructor_id = p_instructor_id
      AND instructor.role = 'instructor'::public.user_role
  ) THEN
    RETURN 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS student
    WHERE student.id = reset_request.student_id
      AND student.role = 'student'::public.user_role
  ) THEN
    RETURN 'TARGET_NOT_STUDENT';
  END IF;

  SELECT requirement.reset_request_id INTO existing_request_id
  FROM public.student_password_change_requirements AS requirement
  WHERE requirement.student_id = reset_request.student_id
  FOR UPDATE;
  IF FOUND THEN
    IF existing_request_id = reset_request.id THEN
      RETURN 'REQUIREMENT_READY';
    END IF;
    RETURN 'REQUIREMENT_MISMATCH';
  END IF;

  INSERT INTO public.student_password_change_requirements (student_id, reset_request_id)
  VALUES (reset_request.student_id, reset_request.id);
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
    'auth_password_update_failed', 'requirement_conflict',
    'target_lookup_failed', 'target_not_student'
  ) THEN
    RAISE EXCEPTION 'Invalid password reset failure code' USING ERRCODE = '22023';
  END IF;

  SELECT request_row.* INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND
    OR reset_request.status <> 'processing'::public.password_reset_status
    OR reset_request.processing_by IS DISTINCT FROM p_instructor_id
    OR NOT EXISTS (
      SELECT 1 FROM public.sessions AS owned_session
      JOIN public.users AS instructor ON instructor.id = owned_session.instructor_id
      WHERE owned_session.id = reset_request.session_id
        AND owned_session.instructor_id = p_instructor_id
        AND instructor.role = 'instructor'::public.user_role
    )
  THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.student_password_change_requirements AS requirement
  WHERE requirement.student_id = reset_request.student_id
    AND requirement.reset_request_id = reset_request.id;

  next_status := CASE
    WHEN reset_request.attempt_count >= 3 THEN 'failed'::public.password_reset_status
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
  SELECT request_row.* INTO reset_request
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
    SELECT 1 FROM public.sessions AS owned_session
    JOIN public.users AS instructor ON instructor.id = owned_session.instructor_id
    WHERE owned_session.id = reset_request.session_id
      AND owned_session.instructor_id = p_instructor_id
      AND instructor.role = 'instructor'::public.user_role
  ) THEN
    RETURN 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users AS student
    WHERE student.id = reset_request.student_id
      AND student.role = 'student'::public.user_role
  ) THEN
    RETURN 'TARGET_NOT_STUDENT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.student_password_change_requirements AS requirement
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

REVOKE ALL ON FUNCTION public.claim_password_reset_request(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_student_password_change_requirement(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_password_reset_attempt(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_password_reset(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_password_reset_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_student_password_change_requirement(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_password_reset_attempt(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_password_reset(uuid, uuid) TO service_role;

-- Password recovery, identity, and unused organization model.
DROP POLICY IF EXISTS "password_reset_requests_read_authorized"
  ON public.password_reset_requests;
CREATE POLICY "password_reset_requests_read_authorized"
  ON public.password_reset_requests FOR SELECT TO authenticated
  USING (
    public.instructor_owns_session(session_id)
    OR (
      public.is_volunteer()
      AND requested_by = (SELECT auth.uid())
      AND public.has_joined_session(session_id)
    )
  );

DROP POLICY IF EXISTS "users_read_own" ON public.users;
CREATE POLICY "users_read_own" ON public.users FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = id)
    OR (
      role = 'student'::public.user_role
      AND public.instructor_can_access_student(id)
    )
    OR (
      role = 'volunteer'::public.user_role
      AND public.instructor_can_access_volunteer(id)
    )
    OR (
      public.is_volunteer()
      AND role = 'student'::public.user_role
      AND EXISTS (
        SELECT 1 FROM public.session_participants AS participant
        WHERE participant.student_id = users.id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "profiles_read_own" ON public.student_profiles;
CREATE POLICY "profiles_read_own" ON public.student_profiles FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = user_id)
    OR public.instructor_can_access_student(user_id)
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1 FROM public.session_participants AS participant
        WHERE participant.student_id = student_profiles.user_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "orgs_read_auth" ON public.organizations;
DROP POLICY IF EXISTS "memberships_read_auth" ON public.memberships;
CREATE POLICY "memberships_read_auth" ON public.memberships FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = user_id
  );

-- Cases and case-owned configuration.
DROP POLICY IF EXISTS "cases_read_auth" ON public.cases;
CREATE POLICY "cases_read_auth" ON public.cases FOR SELECT TO authenticated
  USING (
    (public.is_instructor() AND created_by = (SELECT auth.uid()))
    OR (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') IN ('student', 'volunteer'),
        false
      )
      AND EXISTS (
        SELECT 1 FROM public.sessions AS joined_session
        WHERE joined_session.case_ids @> ARRAY[cases.id]
          AND public.has_joined_session(joined_session.id)
      )
    )
  );

DROP POLICY IF EXISTS "cases_insert_instructor" ON public.cases;
CREATE POLICY "cases_insert_instructor" ON public.cases FOR INSERT TO authenticated
  WITH CHECK (
    public.is_instructor()
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "cases_update_instructor" ON public.cases;
CREATE POLICY "cases_update_instructor" ON public.cases FOR UPDATE TO authenticated
  USING (
    public.is_instructor()
    AND created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_instructor()
    AND created_by = (SELECT auth.uid())
  );
DROP POLICY IF EXISTS "cases_delete_instructor" ON public.cases;

DROP POLICY IF EXISTS "lanes_read_auth" ON public.case_lanes;
CREATE POLICY "lanes_read_auth" ON public.case_lanes FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.cases AS visible_case
      WHERE visible_case.id = case_lanes.case_id
    )
  );

DROP POLICY IF EXISTS "weights_read_auth" ON public.case_concept_weights;
CREATE POLICY "weights_read_auth" ON public.case_concept_weights FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.cases AS visible_case
      WHERE visible_case.id = case_concept_weights.case_id
    )
  );

DROP POLICY IF EXISTS "gates_read_auth" ON public.prediction_gates;
CREATE POLICY "gates_read_auth" ON public.prediction_gates FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.cases AS visible_case
      WHERE visible_case.id = prediction_gates.case_id
    )
  );

-- Sessions and participants.
DROP POLICY IF EXISTS "sessions_read_auth" ON public.sessions;
CREATE POLICY "sessions_read_auth" ON public.sessions FOR SELECT TO authenticated
  USING (
    (
      public.is_instructor()
      AND instructor_id = (SELECT auth.uid())
    )
    OR (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') IN ('student', 'volunteer'),
        false
      )
      AND public.has_joined_session(id)
    )
  );

DROP POLICY IF EXISTS "sessions_insert_instructor" ON public.sessions;
CREATE POLICY "sessions_insert_instructor" ON public.sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_instructor()
    AND instructor_id = (SELECT auth.uid())
    AND public.instructor_owns_all_cases(case_ids)
  );

DROP POLICY IF EXISTS "sessions_update_instructor" ON public.sessions;
CREATE POLICY "sessions_update_instructor" ON public.sessions FOR UPDATE TO authenticated
  USING (
    public.is_instructor()
    AND instructor_id = (SELECT auth.uid())
  )
  WITH CHECK (
    public.is_instructor()
    AND instructor_id = (SELECT auth.uid())
    AND public.instructor_owns_all_cases(case_ids)
  );

DROP POLICY IF EXISTS "participants_read_auth" ON public.session_participants;
CREATE POLICY "participants_read_auth" ON public.session_participants FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
        false
      )
      AND (SELECT auth.uid()) = student_id
    )
    OR public.instructor_owns_session(session_id)
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  );
DROP POLICY IF EXISTS "participants_insert_student" ON public.session_participants;

-- Progress is authorized by its historical session, not current membership.
DROP POLICY IF EXISTS "progress_read_own" ON public.case_progress;
CREATE POLICY "progress_read_own" ON public.case_progress FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
        false
      )
      AND (SELECT auth.uid()) = student_id
    )
    OR public.instructor_owns_session(session_id)
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  );

DROP POLICY IF EXISTS "progress_insert_student" ON public.case_progress;
CREATE POLICY "progress_insert_student" ON public.case_progress FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
    AND (SELECT auth.uid()) = student_id
    AND public.has_joined_session(session_id)
    AND EXISTS (
      SELECT 1 FROM public.sessions AS joined_session
      WHERE joined_session.id = case_progress.session_id
        AND joined_session.case_ids @> ARRAY[case_progress.case_id]
    )
  );

DROP POLICY IF EXISTS "progress_update_student" ON public.case_progress;
CREATE POLICY "progress_update_student" ON public.case_progress FOR UPDATE TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
        false
      )
      AND (SELECT auth.uid()) = student_id
    )
    OR public.instructor_owns_session(session_id)
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  )
  WITH CHECK (
    (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
        false
      )
      AND (SELECT auth.uid()) = student_id
      AND public.has_joined_session(session_id)
    )
    OR public.instructor_owns_session(session_id)
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  );

-- Predictions, reviews, attachments, reflections, and lane attempts inherit
-- the caller's authorized case_progress row.
DROP POLICY IF EXISTS "predictions_read_own" ON public.predictions;
CREATE POLICY "predictions_read_own" ON public.predictions FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS visible_progress
      WHERE visible_progress.id = predictions.case_progress_id
    )
  );

DROP POLICY IF EXISTS "predictions_insert_student" ON public.predictions;
CREATE POLICY "predictions_insert_student" ON public.predictions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = predictions.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "reviews_read_auth" ON public.reviews;
CREATE POLICY "reviews_read_auth" ON public.reviews FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS visible_progress
      WHERE visible_progress.id = reviews.case_progress_id
    )
  );

DROP POLICY IF EXISTS "reviews_insert_auth" ON public.reviews;
CREATE POLICY "reviews_insert_auth" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.is_instructor()
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND public.instructor_owns_session(progress.session_id)
      )
    )
    OR (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
        false
      )
      AND claimed_by IS NULL
      AND claimed_at IS NULL
      AND reviewer_id IS NULL
      AND reviewed_at IS NULL
      AND outcome IS NULL
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND progress.student_id = (SELECT auth.uid())
      )
      AND (
        (review_type = 'implementation'::public.review_type AND prediction_id IS NULL)
        OR (
          review_type = 'prediction'::public.review_type
          AND EXISTS (
            SELECT 1 FROM public.predictions AS prediction
            WHERE prediction.id = reviews.prediction_id
              AND prediction.case_progress_id = reviews.case_progress_id
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "reviews_claim_update" ON public.reviews;
CREATE POLICY "reviews_claim_update" ON public.reviews FOR UPDATE TO authenticated
  USING (
    (
      public.is_instructor()
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND public.instructor_owns_session(progress.session_id)
      )
    )
    OR (
      public.is_volunteer()
      AND (claimed_by IS NULL OR claimed_by = (SELECT auth.uid()))
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  )
  WITH CHECK (
    (
      public.is_instructor()
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND public.instructor_owns_session(progress.session_id)
      )
    )
    OR (
      public.is_volunteer()
      AND claimed_by = (SELECT auth.uid())
      AND (reviewer_id IS NULL OR reviewer_id = (SELECT auth.uid()))
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "attachments_read_auth" ON public.review_attachments;
CREATE POLICY "attachments_read_auth" ON public.review_attachments FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.reviews AS visible_review
      WHERE visible_review.id = review_attachments.review_id
    )
  );

DROP POLICY IF EXISTS "attachments_insert_own" ON public.review_attachments;
CREATE POLICY "attachments_insert_own" ON public.review_attachments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = uploaded_by
    AND EXISTS (
      SELECT 1 FROM public.reviews AS visible_review
      WHERE visible_review.id = review_attachments.review_id
    )
  );

DROP POLICY IF EXISTS "reflections_read_own" ON public.reflections;
CREATE POLICY "reflections_read_own" ON public.reflections FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS visible_progress
      WHERE visible_progress.id = reflections.case_progress_id
    )
  );

DROP POLICY IF EXISTS "reflections_insert_student" ON public.reflections;
CREATE POLICY "reflections_insert_student" ON public.reflections FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "reflections_update_student" ON public.reflections;
CREATE POLICY "reflections_update_student" ON public.reflections FOR UPDATE TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "lane_attempts_read_own" ON public.lane_attempts;
CREATE POLICY "lane_attempts_read_own" ON public.lane_attempts FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS visible_progress
      WHERE visible_progress.id = lane_attempts.case_progress_id
    )
  );

DROP POLICY IF EXISTS "lane_attempts_insert_student" ON public.lane_attempts;
CREATE POLICY "lane_attempts_insert_student" ON public.lane_attempts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = lane_attempts.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

-- Null-progress legacy interventions remain available only to their student.
-- Instructor and volunteer access requires the exact progress/session chain.
DROP POLICY IF EXISTS "flags_read_own" ON public.intervention_flags;
CREATE POLICY "flags_read_own" ON public.intervention_flags FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
        false
      )
      AND (SELECT auth.uid()) = student_id
    )
    OR (
      case_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = intervention_flags.case_progress_id
          AND progress.student_id = intervention_flags.student_id
          AND progress.case_id = intervention_flags.case_id
          AND public.instructor_owns_session(progress.session_id)
      )
    )
    OR (
      public.is_volunteer()
      AND case_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = intervention_flags.case_progress_id
          AND progress.student_id = intervention_flags.student_id
          AND progress.case_id = intervention_flags.case_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "flags_insert_student" ON public.intervention_flags;
DROP POLICY IF EXISTS "flags_update_volunteer" ON public.intervention_flags;
CREATE POLICY "flags_update_volunteer" ON public.intervention_flags FOR UPDATE TO authenticated
  USING (
    (
      case_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = intervention_flags.case_progress_id
          AND progress.student_id = intervention_flags.student_id
          AND progress.case_id = intervention_flags.case_id
          AND public.instructor_owns_session(progress.session_id)
      )
    )
    OR (
      public.is_volunteer()
      AND case_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = intervention_flags.case_progress_id
          AND progress.student_id = intervention_flags.student_id
          AND progress.case_id = intervention_flags.case_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  )
  WITH CHECK (
    (
      case_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = intervention_flags.case_progress_id
          AND progress.student_id = intervention_flags.student_id
          AND progress.case_id = intervention_flags.case_id
          AND public.instructor_owns_session(progress.session_id)
      )
    )
    OR (
      public.is_volunteer()
      AND resolved_by = (SELECT auth.uid())
      AND case_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = intervention_flags.case_progress_id
          AND progress.student_id = intervention_flags.student_id
          AND progress.case_id = intervention_flags.case_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  );

-- Mastery lacks session provenance and is student-only in this phase.
DROP POLICY IF EXISTS "mastery_read_own" ON public.student_concept_mastery;
CREATE POLICY "mastery_read_own" ON public.student_concept_mastery FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
    AND (SELECT auth.uid()) = student_id
  );

DROP POLICY IF EXISTS "snapshots_read_own" ON public.concept_mastery_snapshots;
CREATE POLICY "snapshots_read_own" ON public.concept_mastery_snapshots FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
    AND (SELECT auth.uid()) = student_id
  );
DROP POLICY IF EXISTS "snapshots_insert_instructor" ON public.concept_mastery_snapshots;

DROP POLICY IF EXISTS "summaries_read_auth" ON public.session_summaries;
CREATE POLICY "summaries_read_auth" ON public.session_summaries FOR SELECT TO authenticated
  USING (public.instructor_owns_session(session_id));

DO $$
DECLARE
  required_policy record;
BEGIN
  IF (
    SELECT count(*)
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'instructor_owns_session',
        'instructor_can_access_student',
        'instructor_can_access_volunteer',
        'instructor_owns_all_cases'
      )
      AND procedure.prosecdef
      AND EXISTS (
        SELECT 1 FROM unnest(COALESCE(procedure.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting IN ('search_path=', 'search_path=""')
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'Ownership helpers were not created with the required hardening';
  END IF;

  FOR required_policy IN
    SELECT * FROM (VALUES
      ('cases', 'cases_read_auth'),
      ('cases', 'cases_insert_instructor'),
      ('cases', 'cases_update_instructor'),
      ('sessions', 'sessions_read_auth'),
      ('sessions', 'sessions_insert_instructor'),
      ('sessions', 'sessions_update_instructor'),
      ('session_participants', 'participants_read_auth'),
      ('case_progress', 'progress_read_own'),
      ('intervention_flags', 'flags_read_own'),
      ('password_reset_requests', 'password_reset_requests_read_authorized'),
      ('session_summaries', 'summaries_read_auth')
    ) AS expected(table_name, policy_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = required_policy.table_name
        AND policyname = required_policy.policy_name
    ) THEN
      RAISE EXCEPTION 'Required policy %.% was not installed',
        required_policy.table_name, required_policy.policy_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'cases', 'sessions', 'session_participants', 'case_progress',
        'intervention_flags', 'password_reset_requests', 'session_summaries'
      )
      AND (qual = 'public.is_instructor()' OR with_check = 'public.is_instructor()')
  ) THEN
    RAISE EXCEPTION 'A protected table retains a global instructor policy';
  END IF;

  IF has_function_privilege('anon', 'public.claim_password_reset_request(uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.claim_password_reset_request(uuid,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.claim_password_reset_request(uuid,uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Password reset lifecycle grants are not service-only';
  END IF;
END;
$$;

COMMIT;
