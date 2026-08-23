-- Phase 4A: Student password recovery database foundation.
-- This migration stores lifecycle metadata only. It never stores password data
-- and does not modify Supabase Auth.

BEGIN;

DO $$
BEGIN
  CREATE TYPE public.password_reset_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'cancelled',
    'expired',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            uuid NOT NULL
                        REFERENCES public.users(id) ON DELETE RESTRICT,
  session_id            uuid NOT NULL
                        REFERENCES public.sessions(id) ON DELETE RESTRICT,
  requested_by          uuid NOT NULL
                        REFERENCES public.users(id) ON DELETE RESTRICT,
  requested_at          timestamptz NOT NULL DEFAULT now(),
  status                public.password_reset_status NOT NULL DEFAULT 'pending',
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  processing_by         uuid
                        REFERENCES public.users(id) ON DELETE RESTRICT,
  processing_started_at timestamptz,
  handled_by            uuid
                        REFERENCES public.users(id) ON DELETE RESTRICT,
  handled_at            timestamptz,
  attempt_count         integer NOT NULL DEFAULT 0,
  last_attempt_at       timestamptz,
  last_failure_at       timestamptz,
  last_failure_code     text,
  password_changed_at   timestamptz,
  CONSTRAINT password_reset_requests_student_id_id_key
    UNIQUE (student_id, id),
  CONSTRAINT password_reset_requests_expiration_order_check
    CHECK (expires_at > requested_at),
  CONSTRAINT password_reset_requests_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT password_reset_requests_attempt_metadata_check
    CHECK (
      (attempt_count = 0 AND last_attempt_at IS NULL)
      OR (attempt_count > 0 AND last_attempt_at IS NOT NULL)
    ),
  CONSTRAINT password_reset_requests_processing_metadata_check
    CHECK ((processing_by IS NULL) = (processing_started_at IS NULL)),
  CONSTRAINT password_reset_requests_processing_status_check
    CHECK (
      status <> 'processing'::public.password_reset_status
      OR (processing_by IS NOT NULL AND processing_started_at IS NOT NULL)
    ),
  CONSTRAINT password_reset_requests_handled_metadata_check
    CHECK ((handled_by IS NULL) = (handled_at IS NULL)),
  CONSTRAINT password_reset_requests_failure_metadata_check
    CHECK ((last_failure_at IS NULL) = (last_failure_code IS NULL)),
  CONSTRAINT password_reset_requests_failure_code_check
    CHECK (
      last_failure_code IS NULL
      OR last_failure_code ~ '^[a-z0-9][a-z0-9_]{0,63}$'
    ),
  CONSTRAINT password_reset_requests_password_changed_status_check
    CHECK (
      password_changed_at IS NULL
      OR status = 'completed'::public.password_reset_status
    )
);

CREATE TABLE IF NOT EXISTS public.student_password_change_requirements (
  student_id      uuid PRIMARY KEY
                  REFERENCES public.users(id) ON DELETE RESTRICT,
  reset_request_id uuid NOT NULL UNIQUE,
  required_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_password_change_requirements_request_student_fkey
    FOREIGN KEY (student_id, reset_request_id)
    REFERENCES public.password_reset_requests(student_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_requests_student_active
  ON public.password_reset_requests (student_id)
  WHERE status IN (
    'pending'::public.password_reset_status,
    'processing'::public.password_reset_status
  );
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_requested_at
  ON public.password_reset_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_session
  ON public.password_reset_requests (session_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_requester
  ON public.password_reset_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_processing_by
  ON public.password_reset_requests (processing_by)
  WHERE processing_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_handled_by
  ON public.password_reset_requests (handled_by)
  WHERE handled_by IS NOT NULL;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_password_change_requirements ENABLE ROW LEVEL SECURITY;

-- This SECURITY DEFINER helper avoids recursive RLS: normal-app policies call
-- it while it checks the caller's own live requirement row. It exposes only a
-- boolean about the authenticated caller and reconciles JWT and public roles.
CREATE OR REPLACE FUNCTION public.may_access_normal_app()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH caller AS (
    SELECT
      (SELECT auth.uid()) AS user_id,
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') AS trusted_role
  )
  SELECT CASE
    WHEN caller.user_id IS NULL
      OR caller.trusted_role NOT IN ('student', 'volunteer', 'instructor')
      THEN false
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.users AS app_user
      WHERE app_user.id = caller.user_id
        AND app_user.role::text = caller.trusted_role
    )
      THEN false
    WHEN caller.trusted_role IN ('volunteer', 'instructor')
      THEN true
    WHEN caller.trusted_role = 'student'
      THEN NOT EXISTS (
        SELECT 1
        FROM public.student_password_change_requirements AS requirement
        WHERE requirement.student_id = caller.user_id
      )
    ELSE false
  END
  FROM caller;
$$;

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
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_student_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'Student and session are required' USING ERRCODE = '22023';
  END IF;

  SELECT app_user.role
  INTO requester_role
  FROM public.users AS app_user
  WHERE app_user.id = requester_id;

  IF NOT FOUND
    OR trusted_role NOT IN ('volunteer', 'instructor')
    OR requester_role::text IS DISTINCT FROM trusted_role
  THEN
    RAISE EXCEPTION 'Volunteer or instructor role required' USING ERRCODE = '42501';
  END IF;

  -- The target row lock serializes request/cooldown decisions per student.
  SELECT app_user.role
  INTO target_role
  FROM public.users AS app_user
  WHERE app_user.id = p_student_id
  FOR UPDATE;

  IF NOT FOUND OR target_role <> 'student'::public.user_role THEN
    RAISE EXCEPTION 'Student not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.session_participants AS participant
    WHERE participant.session_id = p_session_id
      AND participant.student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'Student is not joined to the supplied session' USING ERRCODE = '42501';
  END IF;

  IF requester_role = 'volunteer'::public.user_role
    AND NOT EXISTS (
      SELECT 1
      FROM public.session_participants AS participant
      WHERE participant.session_id = p_session_id
        AND participant.student_id = requester_id
    )
  THEN
    RAISE EXCEPTION 'Volunteer is not joined to the supplied session' USING ERRCODE = '42501';
  END IF;

  -- Expiration is decided by the database clock. Processing work is not
  -- auto-expired here; Phase 4B will own processing lease recovery.
  UPDATE public.password_reset_requests
  SET status = 'expired'::public.password_reset_status
  WHERE student_id = p_student_id
    AND status = 'pending'::public.password_reset_status
    AND expires_at <= request_time;

  SELECT request_row.*
  INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.student_id = p_student_id
    AND request_row.status IN (
      'pending'::public.password_reset_status,
      'processing'::public.password_reset_status
    )
  ORDER BY request_row.requested_at
  LIMIT 1;

  IF FOUND THEN
    IF requester_role = 'volunteer'::public.user_role
      AND (
        reset_request.requested_by <> requester_id
        OR NOT EXISTS (
          SELECT 1
          FROM public.session_participants AS participant
          WHERE participant.session_id = reset_request.session_id
            AND participant.student_id = requester_id
        )
      )
    THEN
      RAISE EXCEPTION 'An active password reset request already exists'
        USING ERRCODE = '55000';
    END IF;

    RETURN reset_request;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.password_reset_requests AS recent_request
    WHERE recent_request.student_id = p_student_id
      AND recent_request.requested_at > request_time - interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'Password reset request cooldown is active' USING ERRCODE = '55000';
  END IF;

  BEGIN
    INSERT INTO public.password_reset_requests (
      student_id,
      session_id,
      requested_by,
      requested_at,
      expires_at
    ) VALUES (
      p_student_id,
      p_session_id,
      requester_id,
      request_time,
      request_time + interval '30 minutes'
    )
    RETURNING * INTO reset_request;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT request_row.*
      INTO reset_request
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

      IF requester_role = 'volunteer'::public.user_role
        AND (
          reset_request.requested_by <> requester_id
          OR NOT EXISTS (
            SELECT 1
            FROM public.session_participants AS participant
            WHERE participant.session_id = reset_request.session_id
              AND participant.student_id = requester_id
          )
        )
      THEN
        RAISE EXCEPTION 'An active password reset request already exists'
          USING ERRCODE = '55000';
      END IF;
  END;

  RETURN reset_request;
END;
$$;

REVOKE ALL ON FUNCTION public.may_access_normal_app() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_access_normal_app() TO authenticated;
REVOKE ALL ON FUNCTION public.request_student_password_reset(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_student_password_reset(uuid, uuid) TO authenticated;

-- Recovery-table browser access is deliberately read-only and policy-limited.
REVOKE ALL ON TABLE public.password_reset_requests
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.student_password_change_requirements
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.password_reset_requests TO authenticated;
GRANT SELECT ON TABLE public.student_password_change_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.password_reset_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.student_password_change_requirements TO service_role;

DROP POLICY IF EXISTS "password_reset_requests_read_authorized"
  ON public.password_reset_requests;
CREATE POLICY "password_reset_requests_read_authorized"
  ON public.password_reset_requests
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    OR (
      public.is_volunteer()
      AND requested_by = (SELECT auth.uid())
      AND public.has_joined_session(session_id)
    )
  );

DROP POLICY IF EXISTS "password_change_requirements_read_own"
  ON public.student_password_change_requirements;
CREATE POLICY "password_change_requirements_read_own"
  ON public.student_password_change_requirements
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
  );

-- Gate only the student/own-data branches from migration 009. Instructor and
-- volunteer branches retain their existing scope and relationship checks.

DROP POLICY IF EXISTS "users_read_own" ON public.users;
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = id)
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND role = 'student'::public.user_role
      AND EXISTS (
        SELECT 1
        FROM public.session_participants AS participant
        WHERE participant.student_id = users.id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "profiles_read_own" ON public.student_profiles;
CREATE POLICY "profiles_read_own" ON public.student_profiles
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = user_id)
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1
        FROM public.session_participants AS participant
        WHERE participant.student_id = student_profiles.user_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.student_profiles;
CREATE POLICY "profiles_update_own" ON public.student_profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = user_id
  )
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = user_id
  );

DROP POLICY IF EXISTS "profiles_insert_own" ON public.student_profiles;
CREATE POLICY "profiles_insert_own" ON public.student_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = user_id
  );

DROP POLICY IF EXISTS "memberships_read_auth" ON public.memberships;
CREATE POLICY "memberships_read_auth" ON public.memberships
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = user_id)
    OR public.is_instructor()
  );

DROP POLICY IF EXISTS "cases_read_auth" ON public.cases;
CREATE POLICY "cases_read_auth" ON public.cases
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    OR (
      (SELECT public.may_access_normal_app())
      AND EXISTS (
        SELECT 1
        FROM public.sessions AS joined_session
        WHERE joined_session.case_ids @> ARRAY[cases.id]
          AND public.has_joined_session(joined_session.id)
      )
    )
  );

DROP POLICY IF EXISTS "lanes_read_auth" ON public.case_lanes;
CREATE POLICY "lanes_read_auth" ON public.case_lanes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = case_lanes.case_id
    )
  );

DROP POLICY IF EXISTS "weights_read_auth" ON public.case_concept_weights;
CREATE POLICY "weights_read_auth" ON public.case_concept_weights
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = case_concept_weights.case_id
    )
  );

DROP POLICY IF EXISTS "gates_read_auth" ON public.prediction_gates;
CREATE POLICY "gates_read_auth" ON public.prediction_gates
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = prediction_gates.case_id
    )
  );

DROP POLICY IF EXISTS "sessions_read_auth" ON public.sessions;
CREATE POLICY "sessions_read_auth" ON public.sessions
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    OR (
      (SELECT public.may_access_normal_app())
      AND public.has_joined_session(id)
    )
  );

DROP POLICY IF EXISTS "participants_read_auth" ON public.session_participants;
CREATE POLICY "participants_read_auth" ON public.session_participants
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = student_id)
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  );

DROP POLICY IF EXISTS "progress_read_own" ON public.case_progress;
CREATE POLICY "progress_read_own" ON public.case_progress
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = student_id)
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  );

DROP POLICY IF EXISTS "progress_insert_student" ON public.case_progress;
CREATE POLICY "progress_insert_student" ON public.case_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = student_id
    AND public.has_joined_session(session_id)
    AND EXISTS (
      SELECT 1
      FROM public.sessions AS joined_session
      WHERE joined_session.id = case_progress.session_id
        AND joined_session.case_ids @> ARRAY[case_progress.case_id]
    )
  );

DROP POLICY IF EXISTS "progress_update_student" ON public.case_progress;
CREATE POLICY "progress_update_student" ON public.case_progress
  FOR UPDATE TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND (SELECT auth.uid()) = student_id
    )
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  )
  WITH CHECK (
    (
      (SELECT public.may_access_normal_app())
      AND (SELECT auth.uid()) = student_id
      AND public.has_joined_session(session_id)
    )
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  );

DROP POLICY IF EXISTS "predictions_read_own" ON public.predictions;
CREATE POLICY "predictions_read_own" ON public.predictions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = predictions.case_progress_id
    )
  );

DROP POLICY IF EXISTS "predictions_insert_student" ON public.predictions;
CREATE POLICY "predictions_insert_student" ON public.predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = predictions.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "reviews_read_auth" ON public.reviews;
CREATE POLICY "reviews_read_auth" ON public.reviews
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = reviews.case_progress_id
    )
  );

DROP POLICY IF EXISTS "reviews_insert_auth" ON public.reviews;
CREATE POLICY "reviews_insert_auth" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_instructor()
    OR (
      (SELECT public.may_access_normal_app())
      AND claimed_by IS NULL
      AND claimed_at IS NULL
      AND reviewer_id IS NULL
      AND reviewed_at IS NULL
      AND outcome IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND progress.student_id = (SELECT auth.uid())
      )
      AND (
        (review_type = 'implementation'::public.review_type AND prediction_id IS NULL)
        OR (
          review_type = 'prediction'::public.review_type
          AND EXISTS (
            SELECT 1
            FROM public.predictions AS prediction
            WHERE prediction.id = reviews.prediction_id
              AND prediction.case_progress_id = reviews.case_progress_id
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "attachments_read_auth" ON public.review_attachments;
CREATE POLICY "attachments_read_auth" ON public.review_attachments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_attachments.review_id
    )
  );

DROP POLICY IF EXISTS "attachments_insert_own" ON public.review_attachments;
CREATE POLICY "attachments_insert_own" ON public.review_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = uploaded_by
    AND EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_attachments.review_id
    )
  );

DROP POLICY IF EXISTS "reflections_read_own" ON public.reflections;
CREATE POLICY "reflections_read_own" ON public.reflections
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
    )
  );

DROP POLICY IF EXISTS "reflections_insert_student" ON public.reflections;
CREATE POLICY "reflections_insert_student" ON public.reflections
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "reflections_update_student" ON public.reflections;
CREATE POLICY "reflections_update_student" ON public.reflections
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "flags_read_own" ON public.intervention_flags;
CREATE POLICY "flags_read_own" ON public.intervention_flags
  FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND (SELECT auth.uid()) = student_id
    )
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND case_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.case_progress AS progress
        WHERE progress.id = intervention_flags.case_progress_id
          AND progress.student_id = intervention_flags.student_id
          AND progress.case_id = intervention_flags.case_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "lane_attempts_read_own" ON public.lane_attempts;
CREATE POLICY "lane_attempts_read_own" ON public.lane_attempts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = lane_attempts.case_progress_id
    )
  );

DROP POLICY IF EXISTS "lane_attempts_insert_student" ON public.lane_attempts;
CREATE POLICY "lane_attempts_insert_student" ON public.lane_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = lane_attempts.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "mastery_read_own" ON public.student_concept_mastery;
CREATE POLICY "mastery_read_own" ON public.student_concept_mastery
  FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND (SELECT auth.uid()) = student_id
    )
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1
        FROM public.session_participants AS participant
        WHERE participant.student_id = student_concept_mastery.student_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "snapshots_read_own" ON public.concept_mastery_snapshots;
CREATE POLICY "snapshots_read_own" ON public.concept_mastery_snapshots
  FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND (SELECT auth.uid()) = student_id
    )
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1
        FROM public.session_participants AS participant
        WHERE participant.student_id = concept_mastery_snapshots.student_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

-- SECURITY DEFINER normal-workflow RPCs must enforce the same live gate.
CREATE OR REPLACE FUNCTION public.join_session_by_code(p_session_code text)
RETURNS public.sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  joining_user_id uuid := auth.uid();
  joining_role public.user_role;
  normalized_code text := upper(btrim(p_session_code));
  joined_session public.sessions%ROWTYPE;
  other_live_session_code text;
BEGIN
  IF joining_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF normalized_code IS NULL OR normalized_code = '' THEN
    RAISE EXCEPTION 'Session code is required' USING ERRCODE = '22023';
  END IF;

  SELECT app_user.role
  INTO joining_role
  FROM public.users AS app_user
  WHERE app_user.id = joining_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF joining_role NOT IN ('student'::public.user_role, 'volunteer'::public.user_role) THEN
    RAISE EXCEPTION 'Only students and volunteers can join sessions' USING ERRCODE = '42501';
  END IF;

  IF NOT public.may_access_normal_app() THEN
    RAISE EXCEPTION 'Password change required before normal application access'
      USING ERRCODE = '42501';
  END IF;

  SELECT session_row.*
  INTO joined_session
  FROM public.sessions AS session_row
  WHERE session_row.session_code = normalized_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session code not found' USING ERRCODE = 'P0002';
  END IF;

  IF joined_session.status NOT IN (
    'open'::public.session_status,
    'active'::public.session_status
  ) THEN
    RAISE EXCEPTION 'Session is not open' USING ERRCODE = '55000';
  END IF;

  SELECT session_row.session_code
  INTO other_live_session_code
  FROM public.session_participants AS participant
  JOIN public.sessions AS session_row ON session_row.id = participant.session_id
  WHERE participant.student_id = joining_user_id
    AND session_row.id <> joined_session.id
    AND session_row.status IN (
      'open'::public.session_status,
      'active'::public.session_status
    )
  ORDER BY participant.joined_at DESC
  LIMIT 1;

  IF other_live_session_code IS NOT NULL THEN
    RAISE EXCEPTION 'Already joined to live session %', other_live_session_code
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.session_participants (session_id, student_id)
  VALUES (joined_session.id, joining_user_id)
  ON CONFLICT (session_id, student_id) DO NOTHING;

  RETURN joined_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.raise_hand_for_progress(p_case_progress_id uuid)
RETURNS public.intervention_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  progress_row public.case_progress%ROWTYPE;
  active_flag public.intervention_flags%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT public.may_access_normal_app() THEN
    RAISE EXCEPTION 'Password change required before normal application access'
      USING ERRCODE = '42501';
  END IF;

  SELECT progress.*
  INTO progress_row
  FROM public.case_progress AS progress
  WHERE progress.id = p_case_progress_id
    AND progress.student_id = caller_id
    AND progress.state NOT IN (
      'not_started'::public.case_progress_state,
      'completed'::public.case_progress_state
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active case progress not found for authenticated student'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT flag.*
  INTO active_flag
  FROM public.intervention_flags AS flag
  WHERE flag.case_progress_id = progress_row.id
    AND flag.reason = 'student_raise_hand'::public.flag_reason
    AND flag.resolved_at IS NULL
  ORDER BY flag.raised_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN active_flag;
  END IF;

  INSERT INTO public.intervention_flags (
    student_id,
    case_id,
    case_progress_id,
    reason
  ) VALUES (
    caller_id,
    progress_row.case_id,
    progress_row.id,
    'student_raise_hand'::public.flag_reason
  )
  RETURNING * INTO active_flag;

  RETURN active_flag;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_own_raise_hand_for_progress(
  p_case_progress_id uuid
)
RETURNS public.intervention_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  resolved_flag public.intervention_flags%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT public.may_access_normal_app() THEN
    RAISE EXCEPTION 'Password change required before normal application access'
      USING ERRCODE = '42501';
  END IF;

  WITH resolved AS (
    UPDATE public.intervention_flags AS flag
    SET resolved_at = now(),
        resolved_by = caller_id
    WHERE flag.student_id = caller_id
      AND flag.case_progress_id = p_case_progress_id
      AND flag.reason = 'student_raise_hand'::public.flag_reason
      AND flag.resolved_at IS NULL
    RETURNING flag.*
  )
  SELECT resolved.*
  INTO resolved_flag
  FROM resolved
  ORDER BY resolved.raised_at DESC
  LIMIT 1;

  RETURN resolved_flag;
END;
$$;

REVOKE ALL ON FUNCTION public.join_session_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_session_by_code(text) TO authenticated;
REVOKE ALL ON FUNCTION public.raise_hand_for_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_hand_for_progress(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_own_raise_hand_for_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_own_raise_hand_for_progress(uuid) TO authenticated;

COMMIT;
