-- ============================================================
-- SPARK AGENCY — Complete Database Reconstruction
-- Extracted from Codize project (tadkbymxkdncqahzshml)
-- 12 migrations consolidated into a single deployment script
--
-- To apply: Run in Supabase SQL Editor for project oxiximaftgrpipqbrwej
-- WARNING: This DROPS and RECREATES the entire public schema
-- ============================================================

-- ============================================================
-- PHASE 1: ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'volunteer', 'instructor', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE difficulty_lane AS ENUM ('intro', 'core', 'advanced', 'elite');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE case_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lane_type AS ENUM ('Required', 'Extension', 'Challenge');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE case_progress_state AS ENUM (
    'not_started',
    'building',
    'implementation_review_claimed',
    'awaiting_implementation_review',
    'implementation_approved',
    'prediction_review_claimed',
    'awaiting_prediction_review',
    'prediction_approved',
    'testing_in_scratch',
    'reflection_pending',
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_type AS ENUM ('implementation', 'prediction');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('draft', 'open', 'active', 'closing', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE flag_reason AS ENUM ('stuck_10min', 'failed_gate_repeat', 'wrong_prediction_repeat', 'inactive', 'student_raise_hand');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE password_reset_status AS ENUM (
    'pending', 'processing', 'completed', 'cancelled', 'expired', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- PHASE 2: TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT UNIQUE NOT NULL
                  CHECK (
                    username = lower(btrim(username))
                    AND username ~ '^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$'
                  ),
  role            user_role NOT NULL,
  display_name    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_canonical_key
  ON users (lower(username));

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade                SMALLINT CHECK (grade BETWEEN 3 AND 6),
  age                  SMALLINT,
  interests            TEXT[] DEFAULT '{}',
  clearance_level      SMALLINT NOT NULL DEFAULT 1,
  reputation_points    INTEGER NOT NULL DEFAULT 0,
  prediction_accuracy  NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  guardian_contact     TEXT
);

CREATE TABLE IF NOT EXISTS organizations (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  org_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, org_id)
);

CREATE TABLE IF NOT EXISTS cases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID REFERENCES organizations(id),
  case_code           TEXT UNIQUE,
  title               TEXT NOT NULL,
  client_brief        TEXT NOT NULL DEFAULT '',
  mission             TEXT NOT NULL DEFAULT '',
  constraints         TEXT,
  tools_allowed       TEXT[] DEFAULT '{}',
  difficulty_lane     difficulty_lane NOT NULL DEFAULT 'core',
  developer_note      TEXT,
  concept_tags        TEXT[] DEFAULT '{}',
  starter_code        TEXT,
  expected_output     TEXT,
  min_clearance       SMALLINT NOT NULL DEFAULT 1,
  status              case_status NOT NULL DEFAULT 'draft',
  predict_prove_prompt TEXT,
  reflection_prompt   TEXT,
  transfer_hint       TEXT,
  reputation_reward   SMALLINT NOT NULL DEFAULT 25,
  estimated_minutes   SMALLINT,
  created_by          UUID REFERENCES users(id),
  published_at        TIMESTAMPTZ,
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_lanes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID REFERENCES cases(id) ON DELETE CASCADE,
  lane        lane_type NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  available   BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (case_id, lane)
);

CREATE TABLE IF NOT EXISTS case_concept_weights (
  case_id     UUID REFERENCES cases(id) ON DELETE CASCADE,
  concept     TEXT NOT NULL,
  points      SMALLINT NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 15),
  PRIMARY KEY (case_id, concept)
);

CREATE TABLE IF NOT EXISTS prediction_gates (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                   UUID UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  prompt                    TEXT NOT NULL,
  input_type                TEXT NOT NULL DEFAULT 'free_text',
  choices                   JSONB,
  requires_reflection_on_miss BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES organizations(id),
  instructor_id   UUID REFERENCES users(id),
  session_code    TEXT UNIQUE NOT NULL,
  case_ids        UUID[] NOT NULL DEFAULT '{}',
  status          session_status NOT NULL DEFAULT 'draft',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS session_participants (
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id            UUID NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
  requested_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  status                password_reset_status NOT NULL DEFAULT 'pending',
  expires_at            TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  processing_by         UUID REFERENCES users(id) ON DELETE RESTRICT,
  processing_started_at TIMESTAMPTZ,
  handled_by            UUID REFERENCES users(id) ON DELETE RESTRICT,
  handled_at            TIMESTAMPTZ,
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  last_attempt_at       TIMESTAMPTZ,
  last_failure_at       TIMESTAMPTZ,
  last_failure_code     TEXT,
  password_changed_at   TIMESTAMPTZ,
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
      status <> 'processing'::password_reset_status
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
      OR status = 'completed'::password_reset_status
    )
);

CREATE TABLE IF NOT EXISTS student_password_change_requirements (
  student_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  reset_request_id UUID NOT NULL UNIQUE,
  required_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_password_change_requirements_request_student_fkey
    FOREIGN KEY (student_id, reset_request_id)
    REFERENCES password_reset_requests(student_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS case_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES users(id),
  case_id       UUID REFERENCES cases(id),
  session_id    UUID REFERENCES sessions(id),
  state         case_progress_state NOT NULL DEFAULT 'not_started',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, case_id, session_id)
);

CREATE TABLE IF NOT EXISTS predictions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_progress_id  UUID REFERENCES case_progress(id) ON DELETE CASCADE,
  attempt_number    SMALLINT NOT NULL DEFAULT 1,
  prediction_text   TEXT NOT NULL,
  reasoning_text    TEXT NOT NULL,
  committed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'pending',
  UNIQUE (case_progress_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_progress_id  UUID REFERENCES case_progress(id) ON DELETE CASCADE,
  review_type       review_type NOT NULL,
  prediction_id     UUID REFERENCES predictions(id),
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at       TIMESTAMPTZ,
  reviewer_id       UUID REFERENCES users(id),
  claimed_by        UUID REFERENCES users(id),
  claimed_at        TIMESTAMPTZ,
  outcome           TEXT,
  note              TEXT
);

CREATE TABLE IF NOT EXISTS review_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    UUID REFERENCES reviews(id) ON DELETE CASCADE,
  image_url    TEXT NOT NULL,
  uploaded_by  UUID REFERENCES users(id),
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reflections (
  case_progress_id    UUID PRIMARY KEY REFERENCES case_progress(id) ON DELETE CASCADE,
  predicted_vs_actual TEXT NOT NULL,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intervention_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID REFERENCES users(id),
  case_id          UUID REFERENCES cases(id),
  case_progress_id UUID REFERENCES case_progress(id) ON DELETE SET NULL,
  reason           flag_reason NOT NULL,
  raised_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lane_attempts (
  case_progress_id UUID REFERENCES case_progress(id) ON DELETE CASCADE,
  lane             lane_type NOT NULL,
  attempted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_progress_id, lane)
);

CREATE TABLE IF NOT EXISTS concept_mastery_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES users(id),
  concept_tag TEXT NOT NULL,
  mastery_pct NUMERIC(5,2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_concept_mastery (
  student_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  concept     TEXT NOT NULL,
  mastery_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (mastery_pct BETWEEN 0 AND 100),
  PRIMARY KEY (student_id, concept)
);

CREATE TABLE IF NOT EXISTS session_summaries (
  session_id               UUID PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  students_participated    INTEGER NOT NULL,
  cases_completed          INTEGER NOT NULL,
  cases_in_progress        INTEGER NOT NULL,
  avg_wait_implementation  NUMERIC(6,2),
  avg_wait_prediction      NUMERIC(6,2),
  reviews_completed        INTEGER NOT NULL,
  help_requests_resolved   INTEGER NOT NULL,
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PHASE 3: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_case_progress_student ON case_progress (student_id, state);
CREATE INDEX IF NOT EXISTS idx_case_progress_state ON case_progress (state);
CREATE INDEX IF NOT EXISTS idx_cases_concept_tags ON cases USING GIN (concept_tags);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases (status);
CREATE INDEX IF NOT EXISTS idx_reviews_claimed ON reviews (review_type, reviewed_at) WHERE reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flags_unresolved ON intervention_flags (resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flags_progress_unresolved ON intervention_flags (case_progress_id, reason, raised_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mastery_student_concept ON concept_mastery_snapshots (student_id, concept_tag, recorded_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_session_participants_student_session ON session_participants (student_id, session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_case_ids ON sessions USING GIN (case_ids);
CREATE INDEX IF NOT EXISTS idx_case_progress_session ON case_progress (session_id);
CREATE INDEX IF NOT EXISTS idx_reviews_progress ON reviews (case_progress_id);
CREATE INDEX IF NOT EXISTS idx_flags_progress ON intervention_flags (case_progress_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_requests_student_active
  ON password_reset_requests (student_id)
  WHERE status IN (
    'pending'::password_reset_status,
    'processing'::password_reset_status
  );
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_requested_at
  ON password_reset_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_session
  ON password_reset_requests (session_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_requester
  ON password_reset_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_processing_by
  ON password_reset_requests (processing_by) WHERE processing_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_handled_by
  ON password_reset_requests (handled_by) WHERE handled_by IS NOT NULL;

-- ============================================================
-- PHASE 4: TRIGGER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_users_updated_at ON users;
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_cases_updated_at ON cases;
CREATE TRIGGER set_cases_updated_at BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_case_progress_updated_at ON case_progress;
CREATE TRIGGER set_case_progress_updated_at BEFORE UPDATE ON case_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sync auth.users → public.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username TEXT;
  v_role public.user_role;
  v_trusted_role TEXT;
  v_display_name TEXT;
BEGIN
  v_username := lower(btrim(COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    split_part(COALESCE(NEW.email, ''), '@', 1)
  )));

  IF v_username IS NULL
    OR v_username !~ '^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$'
  THEN
    RAISE EXCEPTION 'Invalid username metadata for Auth user';
  END IF;

  v_trusted_role := NEW.raw_app_meta_data->>'role';
  v_role := CASE
    WHEN v_trusted_role IN ('student', 'volunteer', 'instructor')
      THEN v_trusted_role::public.user_role
    ELSE 'student'::public.user_role
  END;

  v_display_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'display_name'), ''),
    v_username
  );

  INSERT INTO public.users (id, username, role, display_name)
  VALUES (NEW.id, v_username, v_role, v_display_name)
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    updated_at = now();

  IF v_role = 'student'::public.user_role THEN
    INSERT INTO public.student_profiles (user_id, clearance_level)
    VALUES (NEW.id, 1)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Supabase Admin createUser applies custom raw_app_meta_data after the initial
-- Auth row insert. Reconcile only trusted role changes; never read user metadata
-- for authorization or rewrite unrelated public profile fields.
CREATE OR REPLACE FUNCTION public.sync_auth_user_trusted_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := CASE
    WHEN NEW.raw_app_meta_data->>'role'
      IN ('student', 'volunteer', 'instructor')
      THEN (NEW.raw_app_meta_data->>'role')::public.user_role
    ELSE 'student'::public.user_role
  END;

  UPDATE public.users
  SET role = v_role
  WHERE id = NEW.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Cannot synchronize trusted role: public.users row is missing for Auth user %',
      NEW.id;
  END IF;

  IF v_role = 'student'::public.user_role THEN
    INSERT INTO public.student_profiles (user_id, clearance_level)
    VALUES (NEW.id, 1)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.student_profiles
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth_user_trusted_role()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_trusted_role_changed ON auth.users;
CREATE TRIGGER on_auth_user_trusted_role_changed
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW
  WHEN (
    (OLD.raw_app_meta_data->>'role')
      IS DISTINCT FROM
    (NEW.raw_app_meta_data->>'role')
  )
  EXECUTE FUNCTION public.sync_auth_user_trusted_role();

-- ============================================================
-- PHASE 5: RLS HELPER FUNCTIONS
-- ============================================================

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

-- SECURITY DEFINER avoids recursive RLS on session_participants. This helper
-- reveals only whether the current authenticated user joined the given session.
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

-- SECURITY DEFINER avoids recursive RLS while checking the caller's live
-- password-change requirement. JWT and public roles must remain reconciled.
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
  p_student_id UUID,
  p_session_id UUID
)
RETURNS public.password_reset_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id public.users.id%TYPE := auth.uid();
  trusted_role TEXT := (auth.jwt() -> 'app_metadata' ->> 'role');
  requester_role public.user_role;
  target_role public.user_role;
  request_time TIMESTAMPTZ := now();
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
      AND recent_request.requested_at > request_time - INTERVAL '5 minutes'
  ) THEN
    RAISE EXCEPTION 'Password reset request cooldown is active' USING ERRCODE = '55000';
  END IF;

  BEGIN
    INSERT INTO public.password_reset_requests (
      student_id, session_id, requested_by, requested_at, expires_at
    ) VALUES (
      p_student_id,
      p_session_id,
      requester_id,
      request_time,
      request_time + INTERVAL '30 minutes'
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
REVOKE ALL ON FUNCTION public.request_student_password_reset(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_student_password_reset(UUID, UUID) TO authenticated;

-- Phase 4B lifecycle RPCs are invoked only by authenticated Edge Functions
-- using service_role. Password values never enter the database.
CREATE OR REPLACE FUNCTION public.claim_password_reset_request(
  p_request_id UUID,
  p_instructor_id UUID
)
RETURNS TABLE (
  result_code TEXT,
  reset_request_id UUID,
  student_id UUID,
  attempt_count INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_time TIMESTAMPTZ := clock_timestamp();
  reset_request public.password_reset_requests%ROWTYPE;
  target_role public.user_role;
BEGIN
  IF p_request_id IS NULL OR p_instructor_id IS NULL THEN
    RETURN QUERY SELECT 'INVALID_REQUEST'::TEXT, NULL::UUID, NULL::UUID, NULL::INTEGER;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users AS instructor
    WHERE instructor.id = p_instructor_id
      AND instructor.role = 'instructor'::public.user_role
  ) THEN
    RETURN QUERY SELECT 'FORBIDDEN'::TEXT, p_request_id, NULL::UUID, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT request_row.* INTO reset_request
  FROM public.password_reset_requests AS request_row
  WHERE request_row.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'RESET_NOT_FOUND'::TEXT, p_request_id, NULL::UUID, NULL::INTEGER;
    RETURN;
  END IF;

  IF reset_request.status NOT IN (
    'pending'::public.password_reset_status,
    'processing'::public.password_reset_status
  ) THEN
    RETURN QUERY SELECT 'RESET_NOT_AVAILABLE'::TEXT, reset_request.id,
      reset_request.student_id, reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.status = 'processing'::public.password_reset_status
    AND reset_request.processing_started_at > request_time - INTERVAL '2 minutes'
  THEN
    RETURN QUERY SELECT 'RESET_ALREADY_PROCESSING'::TEXT, reset_request.id,
      reset_request.student_id, reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.expires_at <= request_time THEN
    UPDATE public.password_reset_requests
    SET status = 'expired'::public.password_reset_status,
        processing_by = NULL,
        processing_started_at = NULL
    WHERE id = reset_request.id;
    RETURN QUERY SELECT 'RESET_EXPIRED'::TEXT, reset_request.id,
      reset_request.student_id, reset_request.attempt_count;
    RETURN;
  END IF;

  IF reset_request.attempt_count >= 3 THEN
    UPDATE public.password_reset_requests
    SET status = 'failed'::public.password_reset_status,
        processing_by = NULL,
        processing_started_at = NULL
    WHERE id = reset_request.id;
    RETURN QUERY SELECT 'RESET_ATTEMPTS_EXHAUSTED'::TEXT, reset_request.id,
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
    RETURN QUERY SELECT 'TARGET_NOT_STUDENT'::TEXT, reset_request.id,
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

  RETURN QUERY SELECT 'CLAIMED'::TEXT, reset_request.id,
    reset_request.student_id, reset_request.attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_student_password_change_requirement(
  p_request_id UUID,
  p_instructor_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  reset_request public.password_reset_requests%ROWTYPE;
  existing_request_id UUID;
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
  p_request_id UUID,
  p_instructor_id UUID,
  p_failure_code TEXT
)
RETURNS public.password_reset_status
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_time TIMESTAMPTZ := clock_timestamp();
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
  p_request_id UUID,
  p_instructor_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  request_time TIMESTAMPTZ := clock_timestamp();
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

CREATE OR REPLACE FUNCTION public.complete_student_password_change(
  p_student_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  requirement_request_id UUID;
  reset_request public.password_reset_requests%ROWTYPE;
BEGIN
  SELECT requirement.reset_request_id INTO requirement_request_id
  FROM public.student_password_change_requirements AS requirement
  WHERE requirement.student_id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT request_row.* INTO reset_request
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

REVOKE ALL ON FUNCTION public.claim_password_reset_request(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_student_password_change_requirement(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_password_reset_attempt(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_password_reset(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_student_password_change(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_password_reset_request(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_student_password_change_requirement(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_password_reset_attempt(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_password_reset(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_student_password_change(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.join_session_by_code(p_session_code TEXT)
RETURNS public.sessions AS $$
DECLARE
  joining_user_id UUID := auth.uid();
  joining_role public.user_role;
  normalized_code TEXT := upper(btrim(p_session_code));
  joined_session public.sessions%ROWTYPE;
  other_live_session_code TEXT;
BEGIN
  IF joining_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF normalized_code IS NULL OR normalized_code = '' THEN
    RAISE EXCEPTION 'Session code is required' USING ERRCODE = '22023';
  END IF;

  SELECT role
  INTO joining_role
  FROM public.users
  WHERE id = joining_user_id
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

  SELECT *
  INTO joined_session
  FROM public.sessions
  WHERE session_code = normalized_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session code not found' USING ERRCODE = 'P0002';
  END IF;

  IF joined_session.status NOT IN ('open'::public.session_status, 'active'::public.session_status) THEN
    RAISE EXCEPTION 'Session is not open' USING ERRCODE = '55000';
  END IF;

  SELECT s.session_code
  INTO other_live_session_code
  FROM public.session_participants sp
  JOIN public.sessions s ON s.id = sp.session_id
  WHERE sp.student_id = joining_user_id
    AND s.id <> joined_session.id
    AND s.status IN ('open'::public.session_status, 'active'::public.session_status)
  ORDER BY sp.joined_at DESC
  LIMIT 1;

  IF other_live_session_code IS NOT NULL THEN
    RAISE EXCEPTION 'Already joined to live session %', other_live_session_code USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.session_participants (session_id, student_id)
  VALUES (joined_session.id, joining_user_id)
  ON CONFLICT (session_id, student_id) DO NOTHING;

  RETURN joined_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.join_session_by_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_session_by_code(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_case_builder(
  p_case_id UUID,
  p_case_data JSONB,
  p_lanes JSONB,
  p_concept_weights JSONB
)
RETURNS UUID AS $$
DECLARE
  saved_case_id UUID;
  supported_concepts CONSTANT TEXT[] := ARRAY[
    'Variables', 'Loops', 'Conditionals', 'Events',
    'Operators', 'Lists', 'Functions', 'Custom Blocks'
  ];
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.is_instructor(), false) THEN
    RAISE EXCEPTION 'Instructor role required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_case_data ->> 'status', '') NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Case Builder status must be draft or published' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_lanes) IS DISTINCT FROM 'array'
     OR (SELECT count(*) FROM jsonb_array_elements(p_lanes)) <> 3
     OR (SELECT count(DISTINCT lane)
         FROM jsonb_to_recordset(p_lanes) AS lane_row(lane TEXT)) <> 3
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_lanes) AS lane_row(lane TEXT, description TEXT, available BOOLEAN)
       WHERE lane_row.lane NOT IN ('Required', 'Extension', 'Challenge')
          OR lane_row.description IS NULL
          OR lane_row.available IS NULL
     ) THEN
    RAISE EXCEPTION 'Case Builder requires exactly Required, Extension, and Challenge lanes' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_concept_weights) IS DISTINCT FROM 'array'
     OR (SELECT count(*) FROM jsonb_array_elements(p_concept_weights)) <> array_length(supported_concepts, 1)
     OR (SELECT count(DISTINCT concept)
         FROM jsonb_to_recordset(p_concept_weights) AS weight_row(concept TEXT)) <> array_length(supported_concepts, 1)
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_concept_weights) AS weight_row(concept TEXT, points INTEGER)
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
      (p_case_data ->> 'difficulty_lane')::difficulty_lane,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_case_data -> 'concept_tags', '[]'::jsonb))),
      (p_case_data ->> 'min_clearance')::SMALLINT,
      (p_case_data ->> 'status')::case_status,
      NULLIF(p_case_data ->> 'predict_prove_prompt', ''),
      NULLIF(p_case_data ->> 'reflection_prompt', ''),
      NULLIF(p_case_data ->> 'transfer_hint', ''),
      (p_case_data ->> 'reputation_reward')::SMALLINT,
      (p_case_data ->> 'estimated_minutes')::SMALLINT,
      auth.uid()
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
        difficulty_lane = (p_case_data ->> 'difficulty_lane')::difficulty_lane,
        concept_tags = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_case_data -> 'concept_tags', '[]'::jsonb))),
        min_clearance = (p_case_data ->> 'min_clearance')::SMALLINT,
        status = (p_case_data ->> 'status')::case_status,
        predict_prove_prompt = NULLIF(p_case_data ->> 'predict_prove_prompt', ''),
        reflection_prompt = NULLIF(p_case_data ->> 'reflection_prompt', ''),
        transfer_hint = NULLIF(p_case_data ->> 'transfer_hint', ''),
        reputation_reward = (p_case_data ->> 'reputation_reward')::SMALLINT,
        estimated_minutes = (p_case_data ->> 'estimated_minutes')::SMALLINT
    WHERE id = p_case_id
    RETURNING id INTO saved_case_id;

    IF saved_case_id IS NULL THEN
      RAISE EXCEPTION 'Case % not found', p_case_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.case_lanes (case_id, lane, description, available)
  SELECT saved_case_id, lane_row.lane::lane_type, lane_row.description, lane_row.available
  FROM jsonb_to_recordset(p_lanes) AS lane_row(lane TEXT, description TEXT, available BOOLEAN)
  ON CONFLICT (case_id, lane) DO UPDATE
    SET description = EXCLUDED.description,
        available = EXCLUDED.available;

  INSERT INTO public.case_concept_weights (case_id, concept, points)
  SELECT saved_case_id, weight_row.concept, weight_row.points::SMALLINT
  FROM jsonb_to_recordset(p_concept_weights) AS weight_row(concept TEXT, points INTEGER)
  ON CONFLICT (case_id, concept) DO UPDATE
    SET points = EXCLUDED.points;

  RETURN saved_case_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.save_case_builder(UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_case_builder(UUID, JSONB, JSONB, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.raise_hand_for_progress(p_case_progress_id UUID)
RETURNS public.intervention_flags AS $$
DECLARE
  caller_id UUID := auth.uid();
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

  SELECT *
  INTO progress_row
  FROM public.case_progress
  WHERE id = p_case_progress_id
    AND student_id = caller_id
    AND state NOT IN ('not_started', 'completed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active case progress not found for authenticated student' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO active_flag
  FROM public.intervention_flags
  WHERE case_progress_id = progress_row.id
    AND reason = 'student_raise_hand'
    AND resolved_at IS NULL
  ORDER BY raised_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN active_flag;
  END IF;

  INSERT INTO public.intervention_flags (student_id, case_id, case_progress_id, reason)
  VALUES (caller_id, progress_row.case_id, progress_row.id, 'student_raise_hand')
  RETURNING * INTO active_flag;

  RETURN active_flag;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.resolve_own_raise_hand_for_progress(p_case_progress_id UUID)
RETURNS public.intervention_flags AS $$
DECLARE
  caller_id UUID := auth.uid();
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
    UPDATE public.intervention_flags
    SET resolved_at = now(),
        resolved_by = caller_id
    WHERE student_id = caller_id
      AND case_progress_id = p_case_progress_id
      AND reason = 'student_raise_hand'
      AND resolved_at IS NULL
    RETURNING *
  )
  SELECT *
  INTO resolved_flag
  FROM resolved
  ORDER BY raised_at DESC
  LIMIT 1;

  RETURN resolved_flag;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.raise_hand_for_progress(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.raise_hand_for_progress(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_own_raise_hand_for_progress(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_own_raise_hand_for_progress(UUID) TO authenticated;

-- ============================================================
-- PHASE 6: ENABLE RLS ON ALL TABLES
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;

-- ============================================================
-- PHASE 7: RLS POLICIES
-- ============================================================

-- password recovery
DROP POLICY IF EXISTS "password_reset_requests_read_authorized"
  ON password_reset_requests;
CREATE POLICY "password_reset_requests_read_authorized"
  ON password_reset_requests FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    OR (
      public.is_volunteer()
      AND requested_by = (SELECT auth.uid())
      AND public.has_joined_session(session_id)
    )
  );

DROP POLICY IF EXISTS "password_change_requirements_read_own"
  ON student_password_change_requirements;
CREATE POLICY "password_change_requirements_read_own"
  ON student_password_change_requirements FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = student_id
    AND COALESCE(
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'student',
      false
    )
  );

-- users
DROP POLICY IF EXISTS "users_read_own" ON users;
CREATE POLICY "users_read_own" ON users FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = id)
    OR public.is_instructor()
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
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_insert_auth" ON users;

-- student_profiles
DROP POLICY IF EXISTS "profiles_read_own" ON student_profiles;
CREATE POLICY "profiles_read_own" ON student_profiles FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = user_id)
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1 FROM public.session_participants AS participant
        WHERE participant.student_id = student_profiles.user_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );
DROP POLICY IF EXISTS "profiles_update_own" ON student_profiles;
CREATE POLICY "profiles_update_own" ON student_profiles FOR UPDATE TO authenticated
  USING ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "profiles_insert_own" ON student_profiles;
CREATE POLICY "profiles_insert_own" ON student_profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = user_id);

-- organizations
DROP POLICY IF EXISTS "orgs_read_auth" ON organizations;
CREATE POLICY "orgs_read_auth" ON organizations FOR SELECT TO authenticated
  USING (public.is_instructor());

-- memberships
DROP POLICY IF EXISTS "memberships_read_auth" ON memberships;
CREATE POLICY "memberships_read_auth" ON memberships FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = user_id)
    OR public.is_instructor()
  );

-- cases
DROP POLICY IF EXISTS "cases_read_auth" ON cases;
CREATE POLICY "cases_read_auth" ON cases FOR SELECT TO authenticated
  USING (
    public.is_instructor()
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
DROP POLICY IF EXISTS "cases_insert_instructor" ON cases;
CREATE POLICY "cases_insert_instructor" ON cases FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor());
DROP POLICY IF EXISTS "cases_update_instructor" ON cases;
CREATE POLICY "cases_update_instructor" ON cases FOR UPDATE TO authenticated
  USING (public.is_instructor()) WITH CHECK (public.is_instructor());
DROP POLICY IF EXISTS "cases_delete_instructor" ON cases;

-- case_lanes
DROP POLICY IF EXISTS "lanes_read_auth" ON case_lanes;
CREATE POLICY "lanes_read_auth" ON case_lanes FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_lanes.case_id)
  );

-- case_concept_weights
DROP POLICY IF EXISTS "weights_read_auth" ON case_concept_weights;
CREATE POLICY "weights_read_auth" ON case_concept_weights FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_concept_weights.case_id)
  );

-- prediction_gates
DROP POLICY IF EXISTS "gates_read_auth" ON prediction_gates;
CREATE POLICY "gates_read_auth" ON prediction_gates FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (SELECT 1 FROM public.cases WHERE cases.id = prediction_gates.case_id)
  );

-- sessions
DROP POLICY IF EXISTS "sessions_read_auth" ON sessions;
CREATE POLICY "sessions_read_auth" ON sessions FOR SELECT TO authenticated
  USING (
    public.is_instructor()
    OR (
      (SELECT public.may_access_normal_app())
      AND COALESCE(
        ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') IN ('student', 'volunteer'),
        false
      )
      AND public.has_joined_session(id)
    )
  );
DROP POLICY IF EXISTS "sessions_insert_instructor" ON sessions;
CREATE POLICY "sessions_insert_instructor" ON sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor());
DROP POLICY IF EXISTS "sessions_update_instructor" ON sessions;
CREATE POLICY "sessions_update_instructor" ON sessions FOR UPDATE TO authenticated
  USING (public.is_instructor()) WITH CHECK (public.is_instructor());

-- session_participants
DROP POLICY IF EXISTS "participants_read_auth" ON session_participants;
CREATE POLICY "participants_read_auth" ON session_participants FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = student_id)
    OR public.is_instructor()
    OR (public.is_volunteer() AND public.has_joined_session(session_id))
  );
DROP POLICY IF EXISTS "participants_insert_student" ON session_participants;

-- case_progress
DROP POLICY IF EXISTS "progress_read_own" ON case_progress;
CREATE POLICY "progress_read_own" ON case_progress FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = student_id)
    OR public.is_instructor()
    OR (public.is_volunteer() AND public.has_joined_session(session_id))
  );
DROP POLICY IF EXISTS "progress_insert_student" ON case_progress;
CREATE POLICY "progress_insert_student" ON case_progress FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = student_id
    AND public.has_joined_session(session_id)
    AND EXISTS (
      SELECT 1 FROM public.sessions AS joined_session
      WHERE joined_session.id = case_progress.session_id
        AND joined_session.case_ids @> ARRAY[case_progress.case_id]
    )
  );
DROP POLICY IF EXISTS "progress_update_student" ON case_progress;
CREATE POLICY "progress_update_student" ON case_progress FOR UPDATE TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = student_id)
    OR public.is_instructor()
    OR (public.is_volunteer() AND public.has_joined_session(session_id))
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
    OR public.is_instructor()
    OR (public.is_volunteer() AND public.has_joined_session(session_id))
  );

-- predictions
DROP POLICY IF EXISTS "predictions_read_own" ON predictions;
CREATE POLICY "predictions_read_own" ON predictions FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND
    EXISTS (SELECT 1 FROM public.case_progress AS progress WHERE progress.id = predictions.case_progress_id)
  );
DROP POLICY IF EXISTS "predictions_insert_student" ON predictions;
CREATE POLICY "predictions_insert_student" ON predictions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = predictions.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

-- reviews
DROP POLICY IF EXISTS "reviews_read_auth" ON reviews;
CREATE POLICY "reviews_read_auth" ON reviews FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = reviews.case_progress_id
    )
  );
DROP POLICY IF EXISTS "reviews_insert_auth" ON reviews;
CREATE POLICY "reviews_insert_auth" ON reviews FOR INSERT TO authenticated
  WITH CHECK (
    public.is_instructor()
    OR (
      (SELECT public.may_access_normal_app())
      AND claimed_by IS NULL AND claimed_at IS NULL
      AND reviewer_id IS NULL AND reviewed_at IS NULL AND outcome IS NULL
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
DROP POLICY IF EXISTS "reviews_claim_update" ON reviews;
CREATE POLICY "reviews_claim_update" ON reviews FOR UPDATE TO authenticated
  USING (
    public.is_instructor()
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
    public.is_instructor()
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

-- review_attachments
DROP POLICY IF EXISTS "attachments_read_auth" ON review_attachments;
CREATE POLICY "attachments_read_auth" ON review_attachments FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.reviews
      WHERE reviews.id = review_attachments.review_id
    )
  );
DROP POLICY IF EXISTS "attachments_insert_own" ON review_attachments;
CREATE POLICY "attachments_insert_own" ON review_attachments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND (SELECT auth.uid()) = uploaded_by
    AND EXISTS (SELECT 1 FROM public.reviews WHERE reviews.id = review_attachments.review_id)
  );

-- reflections
DROP POLICY IF EXISTS "reflections_read_own" ON reflections;
CREATE POLICY "reflections_read_own" ON reflections FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND
    EXISTS (SELECT 1 FROM public.case_progress AS progress WHERE progress.id = reflections.case_progress_id)
  );
DROP POLICY IF EXISTS "reflections_insert_student" ON reflections;
CREATE POLICY "reflections_insert_student" ON reflections FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS "reflections_update_student" ON reflections;
CREATE POLICY "reflections_update_student" ON reflections FOR UPDATE TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = reflections.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

-- intervention_flags
DROP POLICY IF EXISTS "flags_read_own" ON intervention_flags;
CREATE POLICY "flags_read_own" ON intervention_flags FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = student_id)
    OR public.is_instructor()
    OR (
      public.is_volunteer() AND case_progress_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.case_progress AS progress
        WHERE progress.id = intervention_flags.case_progress_id
          AND progress.student_id = intervention_flags.student_id
          AND progress.case_id = intervention_flags.case_id
          AND public.has_joined_session(progress.session_id)
      )
    )
  );
DROP POLICY IF EXISTS "flags_insert_student" ON intervention_flags;
DROP POLICY IF EXISTS "flags_update_volunteer" ON intervention_flags;
CREATE POLICY "flags_update_volunteer" ON intervention_flags FOR UPDATE TO authenticated
  USING (
    public.is_instructor()
    OR (
      public.is_volunteer() AND case_progress_id IS NOT NULL
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
    public.is_instructor()
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

-- lane_attempts
DROP POLICY IF EXISTS "lane_attempts_read_own" ON lane_attempts;
CREATE POLICY "lane_attempts_read_own" ON lane_attempts FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND
    EXISTS (SELECT 1 FROM public.case_progress AS progress WHERE progress.id = lane_attempts.case_progress_id)
  );
DROP POLICY IF EXISTS "lane_attempts_insert_student" ON lane_attempts;
CREATE POLICY "lane_attempts_insert_student" ON lane_attempts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.may_access_normal_app())
    AND EXISTS (
      SELECT 1 FROM public.case_progress AS progress
      WHERE progress.id = lane_attempts.case_progress_id
        AND progress.student_id = (SELECT auth.uid())
    )
  );

-- student_concept_mastery
DROP POLICY IF EXISTS "mastery_read_own" ON student_concept_mastery;
CREATE POLICY "mastery_read_own" ON student_concept_mastery FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = student_id)
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1 FROM public.session_participants AS participant
        WHERE participant.student_id = student_concept_mastery.student_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

-- concept_mastery_snapshots
DROP POLICY IF EXISTS "snapshots_read_own" ON concept_mastery_snapshots;
CREATE POLICY "snapshots_read_own" ON concept_mastery_snapshots FOR SELECT TO authenticated
  USING (
    ((SELECT public.may_access_normal_app()) AND (SELECT auth.uid()) = student_id)
    OR public.is_instructor()
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1 FROM public.session_participants AS participant
        WHERE participant.student_id = concept_mastery_snapshots.student_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );
DROP POLICY IF EXISTS "snapshots_insert_instructor" ON concept_mastery_snapshots;
CREATE POLICY "snapshots_insert_instructor" ON concept_mastery_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_instructor());

-- session_summaries
DROP POLICY IF EXISTS "summaries_read_auth" ON session_summaries;
CREATE POLICY "summaries_read_auth" ON session_summaries FOR SELECT TO authenticated
  USING (public.is_instructor());

-- ============================================================
-- PHASE 8: TABLE GRANTS (CRITICAL — PostgREST prerequisite)
-- ============================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT INSERT ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT UPDATE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

-- Recovery lifecycle tables are browser read-only. RLS further limits the
-- authenticated SELECT rows; only service_role receives direct write grants.
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

-- public.users is provisioned by the Auth trigger. Browser clients may read
-- authorized rows but cannot create profiles or change roles/usernames.
REVOKE INSERT, UPDATE ON TABLE public.users FROM authenticated;

-- Joining and Help Requests use validated SECURITY DEFINER RPCs. Keep browser
-- updates limited to the columns used by the current state/claim/resolve flows.
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

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.is_instructor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_volunteer() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_volunteer_or_instructor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_joined_session(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.may_access_normal_app() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_student_password_reset(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_password_reset_request(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_student_password_change_requirement(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_password_reset_attempt(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_password_reset(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_student_password_change(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_instructor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_volunteer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_volunteer_or_instructor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_joined_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.may_access_normal_app() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_student_password_reset(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_password_reset_request(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_student_password_change_requirement(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_password_reset_attempt(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_password_reset(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_student_password_change(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.raise_hand_for_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_own_raise_hand_for_progress(UUID) TO authenticated;

-- ============================================================
-- PHASE 9: SEED DATA
-- ============================================================

-- Organization
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Spark Agency — Riverside Chapter')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PHASE 10: AUTH USERS (must be created via Supabase Auth or SQL)
-- ============================================================
-- IMPORTANT: Run this section separately in the Supabase SQL Editor
-- The trigger on_auth_user_created will auto-populate public.users

-- Set search path for auth schema access
-- SELECT set_config('search_path', 'auth, public, extensions', false);
--
-- INSERT OR UPDATE auth.users for each dev account:
--
-- student1 (Maya R., clearance 3)
-- INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
-- VALUES ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000000', 'student1@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Maya R.","role":"student","username":"student1"}', 'authenticated', 'authenticated', now(), now())
-- ON CONFLICT (id) DO NOTHING;
--
-- [Repeat for student2—student6, volunteer1, instructor1]

-- ============================================================
-- PHASE 11: SEED DATA (public tables — after auth users exist)
-- ============================================================

-- Student profiles (only after auth.users + trigger have populated public.users)
INSERT INTO student_profiles (user_id, grade, age, interests, clearance_level, reputation_points, prediction_accuracy) VALUES
  ('00000000-0000-0000-0000-000000001001', 5, 10, ARRAY['games', 'art'], 3, 85, 72.5),
  ('00000000-0000-0000-0000-000000001002', 4, 9, ARRAY['sports'], 2, 50, 65.0),
  ('00000000-0000-0000-0000-000000001003', 5, 11, ARRAY['robots', 'music', 'animals'], 4, 110, 88.0),
  ('00000000-0000-0000-0000-000000001004', 4, 9, ARRAY['games'], 3, 70, 70.0),
  ('00000000-0000-0000-0000-000000001005', 3, 8, ARRAY['legos'], 2, 40, 55.0),
  ('00000000-0000-0000-0000-000000001006', 5, 10, ARRAY['art', 'music'], 3, 95, 78.0)
ON CONFLICT (user_id) DO UPDATE SET
  clearance_level = EXCLUDED.clearance_level,
  reputation_points = EXCLUDED.reputation_points,
  prediction_accuracy = EXCLUDED.prediction_accuracy,
  grade = EXCLUDED.grade,
  age = EXCLUDED.age,
  interests = EXCLUDED.interests;

-- Cases
INSERT INTO cases (id, org_id, case_code, title, client_brief, mission, tools_allowed, concept_tags, min_clearance, status, predict_prove_prompt, reflection_prompt, transfer_hint, reputation_reward, estimated_minutes, created_by, published_at) VALUES
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000000001', 'L1-03',
   'Loop Tracker — Daily Step Counter',
   'Northwind Fitness wants a Scratch project that tracks a sprite''s steps across 7 days.',
   'Build a project using a repeat loop to add 7 day-values to a running total.',
   ARRAY['repeat', 'variables', 'operators (+, <)', 'say block'],
   ARRAY['Loops', 'Variables'], 2, 'published',
   'What will total and below_goal equal when your project finishes running?',
   'What actually happened when you ran your project?',
   'This total-plus-counter pattern shows up anytime you need to tally scores while flagging exceptions.',
   25, 30, '00000000-0000-0000-0000-000000003001', now()),
  ('00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000000001', 'L1-04',
   'Greeting Bot — Welcome Message',
   'Riverside Library needs an automated greeting system.',
   'Build a program that uses variables and conditionals for different greetings.',
   ARRAY['variables', 'conditionals', 'if/else', 'say block'],
   ARRAY['Variables', 'Conditionals'], 2, 'published',
   'What message will be displayed when visitor_type = "student"?',
   'Did the output match your prediction? What surprised you?',
   'Personalized messages based on data are everywhere — email greetings, app welcome screens.',
   20, 25, '00000000-0000-0000-0000-000000003001', now()),
  ('00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000000001', 'L2-01',
   'Color Mixer — Paint Studio',
   'Downtown Arts Co-op wants a tool that shows color blending.',
   'Use variables and operators to create a color-mixing tool.',
   ARRAY['variables', 'operators', 'say block', 'costume change'],
   ARRAY['Variables', 'Operators'], 3, 'draft',
   'If color1 = "blue" and color2 = "yellow", what will the output be?',
   'Test all 3 primary color combinations. How accurate was your mixer?',
   'Combinatorial logic — you see this pattern in recipe apps and character creators.',
   30, 35, '00000000-0000-0000-0000-000000003001', null)
ON CONFLICT (id) DO NOTHING;

-- Case lanes
INSERT INTO case_lanes (id, case_id, lane, description, available) VALUES
  ('00000000-0000-0000-0000-000000020001', '00000000-0000-0000-0000-000000010001', 'Required', 'Use a repeat loop to add 7 day-values to a running total.', true),
  ('00000000-0000-0000-0000-000000020002', '00000000-0000-0000-0000-000000010001', 'Extension', 'Count how many days fell below the 5,000-step goal.', true),
  ('00000000-0000-0000-0000-000000020003', '00000000-0000-0000-0000-000000010001', 'Challenge', 'Sprite visually reacts on any day below goal.', true),
  ('00000000-0000-0000-0000-000000020004', '00000000-0000-0000-0000-000000010002', 'Required', 'Create greeting logic for student, researcher, guest.', true),
  ('00000000-0000-0000-0000-000000020005', '00000000-0000-0000-0000-000000010002', 'Extension', 'Add "volunteer" as a fourth visitor type.', true),
  ('00000000-0000-0000-0000-000000020006', '00000000-0000-0000-0000-000000010002', 'Challenge', 'Random surprise message occasionally.', false),
  ('00000000-0000-0000-0000-000000020007', '00000000-0000-0000-0000-000000010003', 'Required', 'Store two colors and show the blend.', true),
  ('00000000-0000-0000-0000-000000020008', '00000000-0000-0000-0000-000000010003', 'Extension', 'Add tertiary color mixing.', true),
  ('00000000-0000-0000-0000-000000020009', '00000000-0000-0000-0000-000000010003', 'Challenge', 'Show gradient bar of intermediate shades.', false)
ON CONFLICT (id) DO NOTHING;

-- Case concept weights
INSERT INTO case_concept_weights (case_id, concept, points) VALUES
  ('00000000-0000-0000-0000-000000010001', 'Loops', 12), ('00000000-0000-0000-0000-000000010001', 'Variables', 8),
  ('00000000-0000-0000-0000-000000010001', 'Operators', 3), ('00000000-0000-0000-0000-000000010001', 'Events', 2),
  ('00000000-0000-0000-0000-000000010002', 'Variables', 10), ('00000000-0000-0000-0000-000000010002', 'Conditionals', 10),
  ('00000000-0000-0000-0000-000000010002', 'Events', 5), ('00000000-0000-0000-0000-000000010003', 'Variables', 8),
  ('00000000-0000-0000-0000-000000010003', 'Operators', 12)
ON CONFLICT (case_id, concept) DO NOTHING;

-- Prediction gates
INSERT INTO prediction_gates (id, case_id, prompt, input_type) VALUES
  ('00000000-0000-0000-0000-000000030001', '00000000-0000-0000-0000-000000010001', 'What will total and below_goal equal?', 'free_text'),
  ('00000000-0000-0000-0000-000000030002', '00000000-0000-0000-0000-000000010002', 'What message will display for visitor_type = "student"?', 'free_text'),
  ('00000000-0000-0000-0000-000000030003', '00000000-0000-0000-0000-000000010003', 'If color1=blue and color2=yellow, what is the output?', 'free_text')
ON CONFLICT (id) DO NOTHING;

-- Session (active)
INSERT INTO sessions (id, org_id, instructor_id, session_code, case_ids, status) VALUES (
  '00000000-0000-0000-0000-000000040001',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000003001',
  'AGENCY-271',
  ARRAY['00000000-0000-0000-0000-000000010001','00000000-0000-0000-0000-000000010002']::uuid[],
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Session participants
INSERT INTO session_participants (session_id, student_id) VALUES
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000001001'),
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000001002'),
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000001003'),
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000001004'),
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000001005'),
  ('00000000-0000-0000-0000-000000040001', '00000000-0000-0000-0000-000000001006')
ON CONFLICT (session_id, student_id) DO NOTHING;

-- Case progress
INSERT INTO case_progress (id, student_id, case_id, session_id, state) VALUES
  ('00000000-0000-0000-0000-000000050001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000040001', 'awaiting_implementation_review'),
  ('00000000-0000-0000-0000-000000050002', '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000040001', 'awaiting_implementation_review'),
  ('00000000-0000-0000-0000-000000050003', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000040001', 'awaiting_prediction_review'),
  ('00000000-0000-0000-0000-000000050004', '00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000040001', 'awaiting_prediction_review'),
  ('00000000-0000-0000-0000-000000050005', '00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000040001', 'building'),
  ('00000000-0000-0000-0000-000000050006', '00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000040001', 'implementation_review_claimed')
ON CONFLICT (id) DO NOTHING;

-- Reviews (implementation)
INSERT INTO reviews (id, case_progress_id, review_type, requested_at) VALUES
  ('00000000-0000-0000-0000-000000060001', '00000000-0000-0000-0000-000000050001', 'implementation', now() - interval '4 minutes'),
  ('00000000-0000-0000-0000-000000060002', '00000000-0000-0000-0000-000000050002', 'implementation', now() - interval '12 minutes')
ON CONFLICT (id) DO NOTHING;

-- Reviews (claimed)
INSERT INTO reviews (id, case_progress_id, review_type, requested_at, claimed_by, claimed_at)
VALUES ('00000000-0000-0000-0000-000000060003', '00000000-0000-0000-0000-000000050006', 'implementation', now() - interval '2 minutes', '00000000-0000-0000-0000-000000002001', now() - interval '1 minute')
ON CONFLICT (id) DO NOTHING;

-- Predictions
INSERT INTO predictions (id, case_progress_id, attempt_number, prediction_text, reasoning_text, status) VALUES
  ('00000000-0000-0000-0000-000000070001', '00000000-0000-0000-0000-000000050003', 1,
   'I think it will say ''Feed me!'' because hunger starts at 7 and 7 > 5.',
   'Because the if block checks hunger > 5 first so that branch runs.', 'pending'),
  ('00000000-0000-0000-0000-000000070002', '00000000-0000-0000-0000-000000050004', 1,
   'I think total will be 39910 and below_goal will be 3.',
   'I added all 7 values by hand and counted which were under 5000.', 'pending')
ON CONFLICT (id) DO NOTHING;

-- Reviews (prediction)
INSERT INTO reviews (id, case_progress_id, review_type, prediction_id, requested_at) VALUES
  ('00000000-0000-0000-0000-000000060004', '00000000-0000-0000-0000-000000050003', 'prediction', '00000000-0000-0000-0000-000000070001', now() - interval '22 minutes'),
  ('00000000-0000-0000-0000-000000060005', '00000000-0000-0000-0000-000000050004', 'prediction', '00000000-0000-0000-0000-000000070002', now() - interval '3 minutes')
ON CONFLICT (id) DO NOTHING;

-- Intervention flags
INSERT INTO intervention_flags (id, student_id, case_id, reason, raised_at) VALUES
  ('00000000-0000-0000-0000-000000080001', '00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000010001', 'student_raise_hand', now() - interval '11 minutes'),
  ('00000000-0000-0000-0000-000000080002', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000010001', 'wrong_prediction_repeat', now() - interval '6 minutes')
ON CONFLICT (id) DO NOTHING;

-- Student concept mastery
INSERT INTO student_concept_mastery (student_id, concept, mastery_pct) VALUES
  ('00000000-0000-0000-0000-000000001001', 'Variables', 72), ('00000000-0000-0000-0000-000000001001', 'Loops', 58),
  ('00000000-0000-0000-0000-000000001001', 'Conditionals', 45), ('00000000-0000-0000-0000-000000001001', 'Events', 60),
  ('00000000-0000-0000-0000-000000001001', 'Operators', 50)
ON CONFLICT (student_id, concept) DO NOTHING;

-- ============================================================
-- PHASE 12: INSTRUCTOR OWNERSHIP SCOPING (FINAL STATE)
-- Fresh installs omit migration 012's live-only guarded case backfill.
-- ============================================================

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
