-- Phase 4: Scope browser access to trusted session membership.
-- This migration does not alter or delete production data.

BEGIN;

-- JWT role checks do not need elevated privileges.
CREATE OR REPLACE FUNCTION public.is_instructor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'instructor',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_volunteer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'volunteer',
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_volunteer_or_instructor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role')
      IN ('volunteer', 'instructor'),
    false
  );
$$;

-- SECURITY DEFINER is required here so policies on session_participants can
-- check the caller's membership without recursively invoking themselves. The
-- function accepts only a session ID and reveals only the caller's membership.
CREATE OR REPLACE FUNCTION public.has_joined_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.session_participants AS participant
      WHERE participant.session_id = p_session_id
        AND participant.student_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.is_instructor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_volunteer() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_volunteer_or_instructor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_joined_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_instructor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_volunteer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_volunteer_or_instructor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_joined_session(uuid) TO authenticated;

-- Support the membership and relationship checks used by the policies below.
CREATE INDEX IF NOT EXISTS idx_session_participants_student_session
  ON public.session_participants (student_id, session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_case_ids
  ON public.sessions USING gin (case_ids);
CREATE INDEX IF NOT EXISTS idx_case_progress_session
  ON public.case_progress (session_id);
CREATE INDEX IF NOT EXISTS idx_reviews_progress
  ON public.reviews (case_progress_id);
CREATE INDEX IF NOT EXISTS idx_flags_progress
  ON public.intervention_flags (case_progress_id);

-- users
DROP POLICY IF EXISTS "users_read_own" ON public.users;
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = id
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

-- student_profiles
DROP POLICY IF EXISTS "profiles_read_own" ON public.student_profiles;
CREATE POLICY "profiles_read_own" ON public.student_profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
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
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.student_profiles;
CREATE POLICY "profiles_insert_own" ON public.student_profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- organizations and memberships
DROP POLICY IF EXISTS "orgs_read_auth" ON public.organizations;
CREATE POLICY "orgs_read_auth" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_instructor());

DROP POLICY IF EXISTS "memberships_read_auth" ON public.memberships;
CREATE POLICY "memberships_read_auth" ON public.memberships
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id OR public.is_instructor());

-- cases and case-owned configuration
DROP POLICY IF EXISTS "cases_read_auth" ON public.cases;
CREATE POLICY "cases_read_auth" ON public.cases
  FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    OR EXISTS (
      SELECT 1
      FROM public.sessions AS joined_session
      WHERE joined_session.case_ids @> ARRAY[cases.id]
        AND public.has_joined_session(joined_session.id)
    )
  );

DROP POLICY IF EXISTS "cases_insert_instructor" ON public.cases;
CREATE POLICY "cases_insert_instructor" ON public.cases
  FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor());

DROP POLICY IF EXISTS "cases_update_instructor" ON public.cases;
CREATE POLICY "cases_update_instructor" ON public.cases
  FOR UPDATE TO authenticated
  USING (public.is_instructor())
  WITH CHECK (public.is_instructor());

DROP POLICY IF EXISTS "cases_delete_instructor" ON public.cases;

DROP POLICY IF EXISTS "lanes_read_auth" ON public.case_lanes;
CREATE POLICY "lanes_read_auth" ON public.case_lanes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = case_lanes.case_id
    )
  );

DROP POLICY IF EXISTS "weights_read_auth" ON public.case_concept_weights;
CREATE POLICY "weights_read_auth" ON public.case_concept_weights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = case_concept_weights.case_id
    )
  );

DROP POLICY IF EXISTS "gates_read_auth" ON public.prediction_gates;
CREATE POLICY "gates_read_auth" ON public.prediction_gates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases
      WHERE cases.id = prediction_gates.case_id
    )
  );

-- sessions and authoritative membership
DROP POLICY IF EXISTS "sessions_read_auth" ON public.sessions;
CREATE POLICY "sessions_read_auth" ON public.sessions
  FOR SELECT TO authenticated
  USING (public.is_instructor() OR public.has_joined_session(id));

DROP POLICY IF EXISTS "sessions_insert_instructor" ON public.sessions;
CREATE POLICY "sessions_insert_instructor" ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor());

DROP POLICY IF EXISTS "sessions_update_instructor" ON public.sessions;
CREATE POLICY "sessions_update_instructor" ON public.sessions
  FOR UPDATE TO authenticated
  USING (public.is_instructor())
  WITH CHECK (public.is_instructor());

DROP POLICY IF EXISTS "participants_read_auth" ON public.session_participants;
CREATE POLICY "participants_read_auth" ON public.session_participants
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  );

-- Joining is deliberately available only through join_session_by_code(text).
DROP POLICY IF EXISTS "participants_insert_student" ON public.session_participants;

-- case_progress
DROP POLICY IF EXISTS "progress_read_own" ON public.case_progress;
CREATE POLICY "progress_read_own" ON public.case_progress
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
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
    (SELECT auth.uid()) = student_id
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
    (SELECT auth.uid()) = student_id
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  )
  WITH CHECK (
    (
      (SELECT auth.uid()) = student_id
      AND public.has_joined_session(session_id)
    )
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND public.has_joined_session(session_id)
    )
  );

-- predictions
DROP POLICY IF EXISTS "predictions_read_own" ON public.predictions;
CREATE POLICY "predictions_read_own" ON public.predictions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = predictions.case_progress_id
    )
  );

DROP POLICY IF EXISTS "predictions_insert_student" ON public.predictions;
CREATE POLICY "predictions_insert_student" ON public.predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = predictions.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

-- reviews
DROP POLICY IF EXISTS "reviews_read_auth" ON public.reviews;
CREATE POLICY "reviews_read_auth" ON public.reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
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
      claimed_by IS NULL
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

DROP POLICY IF EXISTS "reviews_claim_update" ON public.reviews;
CREATE POLICY "reviews_claim_update" ON public.reviews
  FOR UPDATE TO authenticated
  USING (
    public.is_instructor()
    OR (
      public.is_volunteer()
      AND (claimed_by IS NULL OR claimed_by = (SELECT auth.uid()))
      AND EXISTS (
        SELECT 1
        FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  )
  WITH CHECK (
    public.is_instructor()
    OR (
      public.is_volunteer()
      AND claimed_by = (SELECT auth.uid())
      AND (reviewer_id IS NULL OR reviewer_id = (SELECT auth.uid()))
      AND EXISTS (
        SELECT 1
        FROM public.case_progress AS progress
        WHERE progress.id = reviews.case_progress_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  );

-- review_attachments
DROP POLICY IF EXISTS "attachments_read_auth" ON public.review_attachments;
CREATE POLICY "attachments_read_auth" ON public.review_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_attachments.review_id
    )
  );

DROP POLICY IF EXISTS "attachments_insert_own" ON public.review_attachments;
CREATE POLICY "attachments_insert_own" ON public.review_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = uploaded_by
    AND EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_attachments.review_id
    )
  );

-- reflections
DROP POLICY IF EXISTS "reflections_read_own" ON public.reflections;
CREATE POLICY "reflections_read_own" ON public.reflections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
    )
  );

DROP POLICY IF EXISTS "reflections_insert_student" ON public.reflections;
CREATE POLICY "reflections_insert_student" ON public.reflections
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
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
    EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

-- intervention_flags
DROP POLICY IF EXISTS "flags_read_own" ON public.intervention_flags;
CREATE POLICY "flags_read_own" ON public.intervention_flags
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
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

DROP POLICY IF EXISTS "flags_insert_student" ON public.intervention_flags;

DROP POLICY IF EXISTS "flags_update_volunteer" ON public.intervention_flags;
CREATE POLICY "flags_update_volunteer" ON public.intervention_flags
  FOR UPDATE TO authenticated
  USING (
    public.is_instructor()
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
  )
  WITH CHECK (
    public.is_instructor()
    OR (
      public.is_volunteer()
      AND resolved_by = (SELECT auth.uid())
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

-- lane attempts
DROP POLICY IF EXISTS "lane_attempts_read_own" ON public.lane_attempts;
CREATE POLICY "lane_attempts_read_own" ON public.lane_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = lane_attempts.case_progress_id
    )
  );

DROP POLICY IF EXISTS "lane_attempts_insert_student" ON public.lane_attempts;
CREATE POLICY "lane_attempts_insert_student" ON public.lane_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.case_progress AS progress
      WHERE progress.id = lane_attempts.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

-- mastery and history
DROP POLICY IF EXISTS "mastery_read_own" ON public.student_concept_mastery;
CREATE POLICY "mastery_read_own" ON public.student_concept_mastery
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
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
    (SELECT auth.uid()) = student_id
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

DROP POLICY IF EXISTS "snapshots_insert_instructor" ON public.concept_mastery_snapshots;
CREATE POLICY "snapshots_insert_instructor" ON public.concept_mastery_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor());

-- session summaries
DROP POLICY IF EXISTS "summaries_read_auth" ON public.session_summaries;
CREATE POLICY "summaries_read_auth" ON public.session_summaries
  FOR SELECT TO authenticated
  USING (public.is_instructor());

-- Keep relationship keys immutable to browser clients. The existing workflow
-- only updates state/timestamps, claim/decision fields, and flag resolution.
REVOKE INSERT ON TABLE public.session_participants FROM authenticated;
REVOKE DELETE ON TABLE public.cases FROM authenticated;
REVOKE UPDATE ON TABLE public.case_progress FROM authenticated;
GRANT UPDATE (state, updated_at) ON TABLE public.case_progress TO authenticated;
REVOKE UPDATE ON TABLE public.reviews FROM authenticated;
GRANT UPDATE (
  claimed_by, claimed_at, reviewer_id, reviewed_at, outcome, note
) ON TABLE public.reviews TO authenticated;
REVOKE INSERT ON TABLE public.intervention_flags FROM authenticated;
REVOKE UPDATE ON TABLE public.intervention_flags FROM authenticated;
GRANT UPDATE (resolved_at, resolved_by)
  ON TABLE public.intervention_flags TO authenticated;

COMMIT;
