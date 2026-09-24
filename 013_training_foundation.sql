-- Migration 013: Training Mission and qualification backend foundation.
-- This migration is additive. It does not seed curriculum, change Case File
-- behavior, or modify existing student clearance values.

BEGIN;

-- Orientation is the initial student state. Existing clearance values are
-- preserved: changing a column default and adding a validating check do not
-- rewrite rows.
ALTER TABLE public.student_profiles
  ALTER COLUMN clearance_level SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.student_profiles'::regclass
      AND conname = 'student_profiles_clearance_level_check'
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT student_profiles_clearance_level_check
      CHECK (clearance_level BETWEEN 0 AND 5);
  END IF;
END;
$$;

-- Auth provisioning is the only supported student-profile creation path.
-- Omit clearance_level so the schema default remains authoritative.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username text;
  v_role public.user_role;
  v_trusted_role text;
  v_display_name text;
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
    INSERT INTO public.student_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_trusted_role()
RETURNS trigger
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
    INSERT INTO public.student_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.student_profiles
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_auth_user_trusted_role()
  FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  CREATE TYPE public.training_mission_status AS ENUM (
    'draft', 'published', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.training_mission_progress_status AS ENUM (
    'in_progress', 'awaiting_verification', 'verified'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.skill_verification_source AS ENUM (
    'mission_verification', 'instructor_test_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.qualification_definition_status AS ENUM (
    'draft', 'published', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.qualification_attempt_status AS ENUM (
    'in_progress', 'awaiting_review', 'needs_retry', 'passed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Validation helpers are immutable and intentionally expose no data. They are
-- kept separate so table checks and structural-lock triggers use one canonical
-- interpretation of stable JSON identifiers.
CREATE OR REPLACE FUNCTION public.training_steps_are_valid(
  p_steps jsonb,
  p_require_nonempty boolean
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_steps IS NULL OR jsonb_typeof(p_steps) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;

  IF p_require_nonempty AND jsonb_array_length(p_steps) = 0 THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_steps) AS item(step)
    WHERE jsonb_typeof(item.step) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item.step -> 'id') IS DISTINCT FROM 'string'
       OR btrim(item.step ->> 'id') = ''
       OR jsonb_typeof(item.step -> 'text') IS DISTINCT FROM 'string'
       OR btrim(item.step ->> 'text') = ''
  ) THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT count(*) = count(DISTINCT btrim(item.step ->> 'id'))
    FROM jsonb_array_elements(p_steps) AS item(step)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.training_step_ids(p_steps jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    array_agg(btrim(item.step ->> 'id') ORDER BY item.ordinality),
    ARRAY[]::text[]
  )
  FROM jsonb_array_elements(p_steps) WITH ORDINALITY AS item(step, ordinality);
$$;

CREATE OR REPLACE FUNCTION public.qualification_rubric_is_valid(
  p_rubric jsonb,
  p_require_nonempty boolean
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF p_rubric IS NULL OR jsonb_typeof(p_rubric) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;

  IF p_require_nonempty AND jsonb_array_length(p_rubric) = 0 THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rubric) AS item(criterion)
    WHERE jsonb_typeof(item.criterion) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item.criterion -> 'code') IS DISTINCT FROM 'string'
       OR btrim(item.criterion ->> 'code') = ''
       OR jsonb_typeof(item.criterion -> 'label') IS DISTINCT FROM 'string'
       OR btrim(item.criterion ->> 'label') = ''
  ) THEN
    RETURN false;
  END IF;

  RETURN (
    SELECT count(*) = count(DISTINCT btrim(item.criterion ->> 'code'))
    FROM jsonb_array_elements(p_rubric) AS item(criterion)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.qualification_rubric_codes(p_rubric jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    array_agg(btrim(item.criterion ->> 'code') ORDER BY item.ordinality),
    ARRAY[]::text[]
  )
  FROM jsonb_array_elements(p_rubric)
    WITH ORDINALITY AS item(criterion, ordinality);
$$;

CREATE TABLE IF NOT EXISTS public.skills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  name          text NOT NULL,
  description   text NOT NULL,
  display_order smallint NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_code_nonblank_check CHECK (btrim(code) <> ''),
  CONSTRAINT skills_name_nonblank_check CHECK (btrim(name) <> ''),
  CONSTRAINT skills_description_nonblank_check CHECK (btrim(description) <> ''),
  CONSTRAINT skills_display_order_positive_check CHECK (display_order > 0)
);

CREATE TABLE IF NOT EXISTS public.training_missions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text UNIQUE NOT NULL,
  title                    text NOT NULL,
  skill_id                 uuid NOT NULL
                           REFERENCES public.skills(id) ON DELETE RESTRICT,
  goal                     text NOT NULL,
  steps                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  instructor_check         text NOT NULL,
  independent_check_prompt text NOT NULL,
  optional_challenge       text,
  cover_asset_url          text,
  sequence_order           smallint NOT NULL,
  status                   public.training_mission_status NOT NULL DEFAULT 'draft',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_missions_code_nonblank_check CHECK (btrim(code) <> ''),
  CONSTRAINT training_missions_title_nonblank_check CHECK (btrim(title) <> ''),
  CONSTRAINT training_missions_goal_nonblank_check CHECK (btrim(goal) <> ''),
  CONSTRAINT training_missions_instructor_check_nonblank_check
    CHECK (btrim(instructor_check) <> ''),
  CONSTRAINT training_missions_independent_check_nonblank_check
    CHECK (btrim(independent_check_prompt) <> ''),
  CONSTRAINT training_missions_sequence_order_positive_check
    CHECK (sequence_order > 0),
  CONSTRAINT training_missions_steps_shape_check
    CHECK (
      public.training_steps_are_valid(
        steps,
        status = 'published'::public.training_mission_status
      )
    )
);

CREATE TABLE IF NOT EXISTS public.training_mission_prerequisites (
  mission_id       uuid NOT NULL
                   REFERENCES public.training_missions(id) ON DELETE CASCADE,
  required_skill_id uuid NOT NULL
                   REFERENCES public.skills(id) ON DELETE RESTRICT,
  PRIMARY KEY (mission_id, required_skill_id)
);

CREATE TABLE IF NOT EXISTS public.training_mission_progress (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid NOT NULL
                          REFERENCES public.users(id) ON DELETE RESTRICT,
  mission_id              uuid NOT NULL
                          REFERENCES public.training_missions(id) ON DELETE RESTRICT,
  status                  public.training_mission_progress_status NOT NULL
                          DEFAULT 'in_progress',
  current_step            integer NOT NULL DEFAULT 0,
  started_at              timestamptz NOT NULL DEFAULT now(),
  submitted_at            timestamptz,
  verification_session_id uuid
                          REFERENCES public.sessions(id) ON DELETE RESTRICT,
  verified_by             uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  verified_at             timestamptz,
  feedback                text,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_mission_progress_student_mission_key
    UNIQUE (student_id, mission_id),
  CONSTRAINT training_mission_progress_current_step_check CHECK (current_step >= 0),
  CONSTRAINT training_mission_progress_state_metadata_check CHECK (
    (
      status = 'in_progress'::public.training_mission_progress_status
      AND submitted_at IS NULL
      AND verification_session_id IS NULL
      AND verified_by IS NULL
      AND verified_at IS NULL
    )
    OR (
      status = 'awaiting_verification'::public.training_mission_progress_status
      AND submitted_at IS NOT NULL
      AND verification_session_id IS NOT NULL
      AND verified_by IS NULL
      AND verified_at IS NULL
    )
    OR (
      status = 'verified'::public.training_mission_progress_status
      AND submitted_at IS NOT NULL
      AND verification_session_id IS NOT NULL
      AND verified_by IS NOT NULL
      AND verified_at IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS public.student_skill_verifications (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id                 uuid NOT NULL
                             REFERENCES public.users(id) ON DELETE RESTRICT,
  skill_id                   uuid NOT NULL
                             REFERENCES public.skills(id) ON DELETE RESTRICT,
  source                     public.skill_verification_source NOT NULL,
  source_mission_progress_id uuid UNIQUE
                             REFERENCES public.training_mission_progress(id)
                             ON DELETE RESTRICT,
  verified_by                uuid NOT NULL
                             REFERENCES public.users(id) ON DELETE RESTRICT,
  verified_in_session_id     uuid NOT NULL
                             REFERENCES public.sessions(id) ON DELETE RESTRICT,
  verified_at                timestamptz NOT NULL DEFAULT now(),
  notes                      text,
  CONSTRAINT student_skill_verifications_student_skill_key
    UNIQUE (student_id, skill_id),
  CONSTRAINT student_skill_verifications_source_check CHECK (
    (
      source = 'mission_verification'::public.skill_verification_source
      AND source_mission_progress_id IS NOT NULL
    )
    OR (
      source = 'instructor_test_out'::public.skill_verification_source
      AND source_mission_progress_id IS NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS public.qualification_definitions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text UNIQUE NOT NULL,
  title            text NOT NULL,
  description      text NOT NULL,
  target_clearance smallint NOT NULL,
  task_brief       text NOT NULL,
  requirements     jsonb NOT NULL DEFAULT '[]'::jsonb,
  rubric           jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence_order   smallint NOT NULL,
  status           public.qualification_definition_status NOT NULL DEFAULT 'draft',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qualification_definitions_code_nonblank_check CHECK (btrim(code) <> ''),
  CONSTRAINT qualification_definitions_title_nonblank_check CHECK (btrim(title) <> ''),
  CONSTRAINT qualification_definitions_description_nonblank_check
    CHECK (btrim(description) <> ''),
  CONSTRAINT qualification_definitions_target_clearance_check
    CHECK (target_clearance BETWEEN 1 AND 5),
  CONSTRAINT qualification_definitions_task_brief_nonblank_check
    CHECK (btrim(task_brief) <> ''),
  CONSTRAINT qualification_definitions_requirements_shape_check
    CHECK (jsonb_typeof(requirements) IN ('array', 'object')),
  CONSTRAINT qualification_definitions_rubric_shape_check
    CHECK (
      public.qualification_rubric_is_valid(
        rubric,
        status = 'published'::public.qualification_definition_status
      )
    ),
  CONSTRAINT qualification_definitions_sequence_order_positive_check
    CHECK (sequence_order > 0)
);

CREATE TABLE IF NOT EXISTS public.qualification_required_skills (
  qualification_id uuid NOT NULL
                   REFERENCES public.qualification_definitions(id) ON DELETE CASCADE,
  skill_id         uuid NOT NULL
                   REFERENCES public.skills(id) ON DELETE RESTRICT,
  PRIMARY KEY (qualification_id, skill_id)
);

CREATE TABLE IF NOT EXISTS public.student_qualification_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL
                    REFERENCES public.users(id) ON DELETE RESTRICT,
  qualification_id  uuid NOT NULL
                    REFERENCES public.qualification_definitions(id) ON DELETE RESTRICT,
  session_id        uuid NOT NULL
                    REFERENCES public.sessions(id) ON DELETE RESTRICT,
  attempt_number    integer NOT NULL,
  status            public.qualification_attempt_status NOT NULL DEFAULT 'in_progress',
  started_at        timestamptz NOT NULL DEFAULT now(),
  submitted_at      timestamptz,
  criterion_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by       uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_at       timestamptz,
  feedback          text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_qualification_attempts_number_positive_check
    CHECK (attempt_number > 0),
  CONSTRAINT student_qualification_attempts_student_qualification_number_key
    UNIQUE (student_id, qualification_id, attempt_number),
  CONSTRAINT student_qualification_attempts_criterion_results_shape_check
    CHECK (jsonb_typeof(criterion_results) = 'object'),
  CONSTRAINT student_qualification_attempts_state_metadata_check CHECK (
    (
      status = 'in_progress'::public.qualification_attempt_status
      AND submitted_at IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
    )
    OR (
      status = 'awaiting_review'::public.qualification_attempt_status
      AND submitted_at IS NOT NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
    )
    OR (
      status IN (
        'needs_retry'::public.qualification_attempt_status,
        'passed'::public.qualification_attempt_status
      )
      AND submitted_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_training_missions_status_sequence
  ON public.training_missions (status, sequence_order);
CREATE INDEX IF NOT EXISTS idx_training_missions_skill
  ON public.training_missions (skill_id);
CREATE INDEX IF NOT EXISTS idx_training_mission_prerequisites_skill
  ON public.training_mission_prerequisites (required_skill_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_student_status
  ON public.training_mission_progress (student_id, status);
CREATE INDEX IF NOT EXISTS idx_training_progress_verification_queue
  ON public.training_mission_progress (
    verification_session_id, submitted_at
  )
  WHERE status = 'awaiting_verification'::public.training_mission_progress_status;
CREATE INDEX IF NOT EXISTS idx_skill_verifications_skill_student
  ON public.student_skill_verifications (skill_id, student_id);
CREATE INDEX IF NOT EXISTS idx_qualification_definitions_status_sequence
  ON public.qualification_definitions (status, sequence_order);
CREATE INDEX IF NOT EXISTS idx_qualification_required_skills_skill
  ON public.qualification_required_skills (skill_id, qualification_id);
CREATE INDEX IF NOT EXISTS idx_qualification_attempts_student_status
  ON public.student_qualification_attempts (student_id, status);
CREATE INDEX IF NOT EXISTS idx_qualification_attempts_review_queue
  ON public.student_qualification_attempts (session_id, submitted_at)
  WHERE status = 'awaiting_review'::public.qualification_attempt_status;
CREATE UNIQUE INDEX IF NOT EXISTS idx_qualification_attempts_one_open
  ON public.student_qualification_attempts (student_id, qualification_id)
  WHERE status IN (
    'in_progress'::public.qualification_attempt_status,
    'awaiting_review'::public.qualification_attempt_status
  );

DROP TRIGGER IF EXISTS set_skills_updated_at ON public.skills;
CREATE TRIGGER set_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_training_missions_updated_at ON public.training_missions;
CREATE TRIGGER set_training_missions_updated_at
  BEFORE UPDATE ON public.training_missions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_training_progress_updated_at
  ON public.training_mission_progress;
CREATE TRIGGER set_training_progress_updated_at
  BEFORE UPDATE ON public.training_mission_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_qualification_definitions_updated_at
  ON public.qualification_definitions;
CREATE TRIGGER set_qualification_definitions_updated_at
  BEFORE UPDATE ON public.qualification_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_qualification_attempts_updated_at
  ON public.student_qualification_attempts;
CREATE TRIGGER set_qualification_attempts_updated_at
  BEFORE UPDATE ON public.student_qualification_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Any progress proves that the mission was published, because progress can
-- only be created by start_training_mission. The lock therefore remains in
-- force if the mission is later archived.
CREATE OR REPLACE FUNCTION public.protect_training_mission_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.training_mission_progress AS progress
    WHERE progress.mission_id = OLD.id
  ) AND (
    NEW.code IS DISTINCT FROM OLD.code
    OR NEW.skill_id IS DISTINCT FROM OLD.skill_id
    OR NEW.sequence_order IS DISTINCT FROM OLD.sequence_order
    OR public.training_step_ids(NEW.steps)
       IS DISTINCT FROM public.training_step_ids(OLD.steps)
  ) THEN
    RAISE EXCEPTION
      'Published Training Mission structure is locked after student progress exists'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_training_mission_structure
  ON public.training_missions;
CREATE TRIGGER protect_training_mission_structure
  BEFORE UPDATE ON public.training_missions
  FOR EACH ROW EXECUTE FUNCTION public.protect_training_mission_structure();

CREATE OR REPLACE FUNCTION public.protect_training_prerequisite_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  affected_mission_id uuid := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.mission_id
    ELSE NEW.mission_id
  END;
BEGIN
  -- Serialize prerequisite edits with start_training_mission, which holds a
  -- share lock on the same Mission row while checking eligibility.
  PERFORM 1
  FROM public.training_missions AS mission
  WHERE mission.id = affected_mission_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.training_mission_progress AS progress
    WHERE progress.mission_id = affected_mission_id
  ) THEN
    RAISE EXCEPTION
      'Training Mission prerequisites are locked after student progress exists'
      USING ERRCODE = '55000';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS protect_training_prerequisite_set
  ON public.training_mission_prerequisites;
CREATE TRIGGER protect_training_prerequisite_set
  BEFORE INSERT OR UPDATE OR DELETE ON public.training_mission_prerequisites
  FOR EACH ROW EXECUTE FUNCTION public.protect_training_prerequisite_set();

CREATE OR REPLACE FUNCTION public.protect_qualification_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.student_qualification_attempts AS attempt
    WHERE attempt.qualification_id = OLD.id
  ) AND (
    NEW.code IS DISTINCT FROM OLD.code
    OR NEW.target_clearance IS DISTINCT FROM OLD.target_clearance
    OR public.qualification_rubric_codes(NEW.rubric)
       IS DISTINCT FROM public.qualification_rubric_codes(OLD.rubric)
  ) THEN
    RAISE EXCEPTION
      'Qualification structure is locked after student attempts exist'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_qualification_structure
  ON public.qualification_definitions;
CREATE TRIGGER protect_qualification_structure
  BEFORE UPDATE ON public.qualification_definitions
  FOR EACH ROW EXECUTE FUNCTION public.protect_qualification_structure();

CREATE OR REPLACE FUNCTION public.protect_qualification_required_skill_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  affected_qualification_id uuid := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.qualification_id
    ELSE NEW.qualification_id
  END;
BEGIN
  -- Serialize required-skill edits with start_qualification, which holds a
  -- share lock on the same definition while checking eligibility.
  PERFORM 1
  FROM public.qualification_definitions AS qualification
  WHERE qualification.id = affected_qualification_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.student_qualification_attempts AS attempt
    WHERE attempt.qualification_id = affected_qualification_id
  ) THEN
    RAISE EXCEPTION
      'Qualification required skills are locked after student attempts exist'
      USING ERRCODE = '55000';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS protect_qualification_required_skill_set
  ON public.qualification_required_skills;
CREATE TRIGGER protect_qualification_required_skill_set
  BEFORE INSERT OR UPDATE OR DELETE ON public.qualification_required_skills
  FOR EACH ROW EXECUTE FUNCTION public.protect_qualification_required_skill_set();

-- This trigger is defense in depth for service/admin writes. Browser writes are
-- denied, and the normal mission-verification RPC also creates only matching
-- student/mission/skill provenance.
CREATE OR REPLACE FUNCTION public.validate_skill_verification_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.source = 'mission_verification'::public.skill_verification_source
    AND NOT EXISTS (
      SELECT 1
      FROM public.training_mission_progress AS progress
      JOIN public.training_missions AS mission ON mission.id = progress.mission_id
      WHERE progress.id = NEW.source_mission_progress_id
        AND progress.student_id = NEW.student_id
        AND mission.skill_id = NEW.skill_id
        AND progress.status = 'verified'::public.training_mission_progress_status
    )
  THEN
    RAISE EXCEPTION 'Mission skill-verification provenance does not match verified progress'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_skill_verification_provenance
  ON public.student_skill_verifications;
CREATE TRIGGER validate_skill_verification_provenance
  BEFORE INSERT OR UPDATE ON public.student_skill_verifications
  FOR EACH ROW EXECUTE FUNCTION public.validate_skill_verification_provenance();

-- Returns only the caller's reconciled role. SECURITY DEFINER avoids depending
-- on public.users RLS from state-transition functions.
CREATE OR REPLACE FUNCTION public.current_reconciled_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_user.role
  FROM public.users AS app_user
  WHERE app_user.id = (SELECT auth.uid())
    AND app_user.role::text =
      ((SELECT auth.jwt()) -> 'app_metadata' ->> 'role')
    AND app_user.role IN (
      'student'::public.user_role,
      'volunteer'::public.user_role,
      'instructor'::public.user_role
    );
$$;

CREATE OR REPLACE FUNCTION public.start_training_mission(p_mission_id uuid)
RETURNS public.training_mission_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  mission_row public.training_missions%ROWTYPE;
  progress_row public.training_mission_progress%ROWTYPE;
BEGIN
  IF caller_id IS NULL
    OR public.current_reconciled_role() IS DISTINCT FROM 'student'::public.user_role
  THEN
    RAISE EXCEPTION 'Reconciled student role required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.may_access_normal_app() THEN
    RAISE EXCEPTION 'Password change required before normal application access'
      USING ERRCODE = '42501';
  END IF;

  SELECT mission.* INTO mission_row
  FROM public.training_missions AS mission
  JOIN public.skills AS skill ON skill.id = mission.skill_id
  WHERE mission.id = p_mission_id
    AND mission.status = 'published'::public.training_mission_status
    AND skill.is_active
  FOR SHARE OF mission;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published Training Mission not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.training_mission_prerequisites AS prerequisite
    WHERE prerequisite.mission_id = mission_row.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_skill_verifications AS verification
        WHERE verification.student_id = caller_id
          AND verification.skill_id = prerequisite.required_skill_id
      )
  ) THEN
    RAISE EXCEPTION 'Training Mission prerequisites are not demonstrated'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.training_mission_progress (student_id, mission_id, current_step)
  VALUES (caller_id, mission_row.id, 0)
  ON CONFLICT (student_id, mission_id) DO NOTHING;

  SELECT progress.* INTO progress_row
  FROM public.training_mission_progress AS progress
  WHERE progress.student_id = caller_id
    AND progress.mission_id = mission_row.id;

  IF progress_row.status = 'verified'::public.training_mission_progress_status THEN
    RAISE EXCEPTION 'Training Mission is already verified' USING ERRCODE = '55000';
  END IF;

  RETURN progress_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_training_mission_step(
  p_progress_id uuid,
  p_step_index integer
)
RETURNS public.training_mission_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  progress_row public.training_mission_progress%ROWTYPE;
  step_count integer;
BEGIN
  IF caller_id IS NULL
    OR public.current_reconciled_role() IS DISTINCT FROM 'student'::public.user_role
    OR NOT public.may_access_normal_app()
  THEN
    RAISE EXCEPTION 'Reconciled student role required' USING ERRCODE = '42501';
  END IF;

  SELECT progress.*
  INTO progress_row
  FROM public.training_mission_progress AS progress
  JOIN public.training_missions AS mission ON mission.id = progress.mission_id
  WHERE progress.id = p_progress_id
    AND progress.student_id = caller_id
    AND progress.status = 'in_progress'::public.training_mission_progress_status
  FOR UPDATE OF progress;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'In-progress Training Mission not found for student'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_array_length(mission.steps)
  INTO step_count
  FROM public.training_missions AS mission
  WHERE mission.id = progress_row.mission_id;

  IF p_step_index IS NULL OR p_step_index < 0 OR p_step_index >= step_count THEN
    RAISE EXCEPTION 'Training Mission step index is out of range'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.training_mission_progress
  SET current_step = p_step_index
  WHERE id = progress_row.id
  RETURNING * INTO progress_row;

  RETURN progress_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_training_mission_for_verification(
  p_progress_id uuid,
  p_session_id uuid
)
RETURNS public.training_mission_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  progress_row public.training_mission_progress%ROWTYPE;
  step_count integer;
BEGIN
  IF caller_id IS NULL
    OR public.current_reconciled_role() IS DISTINCT FROM 'student'::public.user_role
    OR NOT public.may_access_normal_app()
  THEN
    RAISE EXCEPTION 'Reconciled student role required' USING ERRCODE = '42501';
  END IF;

  SELECT progress.*
  INTO progress_row
  FROM public.training_mission_progress AS progress
  JOIN public.training_missions AS mission ON mission.id = progress.mission_id
  WHERE progress.id = p_progress_id
    AND progress.student_id = caller_id
    AND progress.status = 'in_progress'::public.training_mission_progress_status
    AND mission.status = 'published'::public.training_mission_status
    AND NOT EXISTS (
      SELECT 1
      FROM public.training_mission_prerequisites AS prerequisite
      WHERE prerequisite.mission_id = mission.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.student_skill_verifications AS verification
          WHERE verification.student_id = caller_id
            AND verification.skill_id = prerequisite.required_skill_id
        )
    )
  FOR UPDATE OF progress;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Eligible in-progress Training Mission not found for student'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_array_length(mission.steps)
  INTO step_count
  FROM public.training_missions AS mission
  WHERE mission.id = progress_row.mission_id;

  IF progress_row.current_step < 0 OR progress_row.current_step >= step_count THEN
    RAISE EXCEPTION 'Stored Training Mission step index is out of range'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions AS workshop
    JOIN public.session_participants AS participant
      ON participant.session_id = workshop.id
    WHERE workshop.id = p_session_id
      AND workshop.status IN (
        'open'::public.session_status,
        'active'::public.session_status
      )
      AND participant.student_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Student is not joined to the supplied live session'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.training_mission_progress
  SET status = 'awaiting_verification'::public.training_mission_progress_status,
      submitted_at = now(),
      verification_session_id = p_session_id,
      verified_by = NULL,
      verified_at = NULL
  WHERE id = progress_row.id
  RETURNING * INTO progress_row;

  RETURN progress_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_training_mission(
  p_progress_id uuid,
  p_feedback text DEFAULT NULL
)
RETURNS public.training_mission_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role public.user_role := public.current_reconciled_role();
  progress_row public.training_mission_progress%ROWTYPE;
  mission_row public.training_missions%ROWTYPE;
BEGIN
  IF caller_id IS NULL
    OR caller_role IS NULL
    OR caller_role NOT IN (
      'volunteer'::public.user_role,
      'instructor'::public.user_role
    )
    OR NOT public.may_access_normal_app()
  THEN
    RAISE EXCEPTION 'Reconciled facilitator role required' USING ERRCODE = '42501';
  END IF;

  SELECT progress.*
  INTO progress_row
  FROM public.training_mission_progress AS progress
  WHERE progress.id = p_progress_id
    AND progress.status = 'awaiting_verification'::public.training_mission_progress_status
  FOR UPDATE OF progress;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Awaiting Training Mission verification not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT mission.* INTO mission_row
  FROM public.training_missions AS mission
  WHERE mission.id = progress_row.mission_id;

  IF btrim(mission_row.independent_check_prompt) = '' THEN
    RAISE EXCEPTION 'Training Mission independent check is required'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions AS workshop
    JOIN public.session_participants AS student_participant
      ON student_participant.session_id = workshop.id
     AND student_participant.student_id = progress_row.student_id
    WHERE workshop.id = progress_row.verification_session_id
      AND workshop.status IN (
        'open'::public.session_status,
        'active'::public.session_status
      )
      AND (
        (
          caller_role = 'instructor'::public.user_role
          AND workshop.instructor_id = caller_id
        )
        OR (
          caller_role = 'volunteer'::public.user_role
          AND EXISTS (
            SELECT 1
            FROM public.session_participants AS volunteer_participant
            WHERE volunteer_participant.session_id = workshop.id
              AND volunteer_participant.student_id = caller_id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Facilitator is not authorized for the verification session'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.training_mission_progress
  SET status = 'verified'::public.training_mission_progress_status,
      verified_by = caller_id,
      verified_at = now(),
      feedback = p_feedback
  WHERE id = progress_row.id
  RETURNING * INTO progress_row;

  INSERT INTO public.student_skill_verifications (
    student_id,
    skill_id,
    source,
    source_mission_progress_id,
    verified_by,
    verified_in_session_id,
    notes
  ) VALUES (
    progress_row.student_id,
    mission_row.skill_id,
    'mission_verification'::public.skill_verification_source,
    progress_row.id,
    caller_id,
    progress_row.verification_session_id,
    p_feedback
  )
  ON CONFLICT (student_id, skill_id) DO NOTHING;

  RETURN progress_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_training_mission(
  p_progress_id uuid,
  p_feedback text
)
RETURNS public.training_mission_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role public.user_role := public.current_reconciled_role();
  progress_row public.training_mission_progress%ROWTYPE;
BEGIN
  IF caller_id IS NULL
    OR caller_role IS NULL
    OR caller_role NOT IN (
      'volunteer'::public.user_role,
      'instructor'::public.user_role
    )
    OR NOT public.may_access_normal_app()
  THEN
    RAISE EXCEPTION 'Reconciled facilitator role required' USING ERRCODE = '42501';
  END IF;

  IF p_feedback IS NULL OR btrim(p_feedback) = '' THEN
    RAISE EXCEPTION 'Retry feedback is required' USING ERRCODE = '22023';
  END IF;

  SELECT progress.* INTO progress_row
  FROM public.training_mission_progress AS progress
  WHERE progress.id = p_progress_id
    AND progress.status = 'awaiting_verification'::public.training_mission_progress_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Awaiting Training Mission verification not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions AS workshop
    JOIN public.session_participants AS student_participant
      ON student_participant.session_id = workshop.id
     AND student_participant.student_id = progress_row.student_id
    WHERE workshop.id = progress_row.verification_session_id
      AND workshop.status IN (
        'open'::public.session_status,
        'active'::public.session_status
      )
      AND (
        (
          caller_role = 'instructor'::public.user_role
          AND workshop.instructor_id = caller_id
        )
        OR (
          caller_role = 'volunteer'::public.user_role
          AND EXISTS (
            SELECT 1
            FROM public.session_participants AS volunteer_participant
            WHERE volunteer_participant.session_id = workshop.id
              AND volunteer_participant.student_id = caller_id
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Facilitator is not authorized for the verification session'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.training_mission_progress
  SET status = 'in_progress'::public.training_mission_progress_status,
      submitted_at = NULL,
      verification_session_id = NULL,
      verified_by = NULL,
      verified_at = NULL,
      feedback = p_feedback
  WHERE id = progress_row.id
  RETURNING * INTO progress_row;

  RETURN progress_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.instructor_verify_skill(
  p_student_id uuid,
  p_skill_id uuid,
  p_session_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.student_skill_verifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  verification_row public.student_skill_verifications%ROWTYPE;
BEGIN
  IF caller_id IS NULL
    OR public.current_reconciled_role() IS DISTINCT FROM 'instructor'::public.user_role
    OR NOT public.may_access_normal_app()
  THEN
    RAISE EXCEPTION 'Reconciled instructor role required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions AS workshop
    JOIN public.session_participants AS participant
      ON participant.session_id = workshop.id
    JOIN public.users AS student ON student.id = participant.student_id
    WHERE workshop.id = p_session_id
      AND workshop.instructor_id = caller_id
      AND workshop.status IN (
        'open'::public.session_status,
        'active'::public.session_status
      )
      AND participant.student_id = p_student_id
      AND student.role = 'student'::public.user_role
  ) THEN
    RAISE EXCEPTION 'Student is not in the instructor-owned live session'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.skills AS skill
    WHERE skill.id = p_skill_id AND skill.is_active
  ) THEN
    RAISE EXCEPTION 'Active skill not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.student_skill_verifications (
    student_id,
    skill_id,
    source,
    source_mission_progress_id,
    verified_by,
    verified_in_session_id,
    notes
  ) VALUES (
    p_student_id,
    p_skill_id,
    'instructor_test_out'::public.skill_verification_source,
    NULL,
    caller_id,
    p_session_id,
    p_notes
  )
  ON CONFLICT (student_id, skill_id) DO NOTHING;

  SELECT verification.* INTO verification_row
  FROM public.student_skill_verifications AS verification
  WHERE verification.student_id = p_student_id
    AND verification.skill_id = p_skill_id;

  RETURN verification_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_qualification(
  p_qualification_id uuid,
  p_session_id uuid
)
RETURNS public.student_qualification_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  next_attempt_number integer;
  attempt_row public.student_qualification_attempts%ROWTYPE;
BEGIN
  IF caller_id IS NULL
    OR public.current_reconciled_role() IS DISTINCT FROM 'student'::public.user_role
    OR NOT public.may_access_normal_app()
  THEN
    RAISE EXCEPTION 'Reconciled student role required' USING ERRCODE = '42501';
  END IF;

  -- Serialize attempt-number allocation and open-attempt checks per student.
  PERFORM 1 FROM public.users WHERE id = caller_id FOR UPDATE;

  PERFORM 1
  FROM public.qualification_definitions AS qualification
  WHERE qualification.id = p_qualification_id
    AND qualification.status = 'published'::public.qualification_definition_status
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published qualification not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.qualification_required_skills AS required_skill
    WHERE required_skill.qualification_id = p_qualification_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.student_skill_verifications AS verification
        WHERE verification.student_id = caller_id
          AND verification.skill_id = required_skill.skill_id
      )
  ) THEN
    RAISE EXCEPTION 'Qualification required skills are not demonstrated'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions AS workshop
    JOIN public.session_participants AS participant
      ON participant.session_id = workshop.id
    WHERE workshop.id = p_session_id
      AND workshop.status IN (
        'open'::public.session_status,
        'active'::public.session_status
      )
      AND participant.student_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Student is not joined to the supplied live session'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_qualification_attempts AS attempt
    WHERE attempt.student_id = caller_id
      AND attempt.qualification_id = p_qualification_id
      AND attempt.status IN (
        'in_progress'::public.qualification_attempt_status,
        'awaiting_review'::public.qualification_attempt_status
      )
  ) THEN
    RAISE EXCEPTION 'An open qualification attempt already exists'
      USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(max(attempt.attempt_number), 0) + 1
  INTO next_attempt_number
  FROM public.student_qualification_attempts AS attempt
  WHERE attempt.student_id = caller_id
    AND attempt.qualification_id = p_qualification_id;

  INSERT INTO public.student_qualification_attempts (
    student_id,
    qualification_id,
    session_id,
    attempt_number
  ) VALUES (
    caller_id,
    p_qualification_id,
    p_session_id,
    next_attempt_number
  )
  RETURNING * INTO attempt_row;

  RETURN attempt_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_qualification(p_attempt_id uuid)
RETURNS public.student_qualification_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  attempt_row public.student_qualification_attempts%ROWTYPE;
BEGIN
  IF caller_id IS NULL
    OR public.current_reconciled_role() IS DISTINCT FROM 'student'::public.user_role
    OR NOT public.may_access_normal_app()
  THEN
    RAISE EXCEPTION 'Reconciled student role required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.student_qualification_attempts AS attempt
  SET status = 'awaiting_review'::public.qualification_attempt_status,
      submitted_at = now()
  WHERE attempt.id = p_attempt_id
    AND attempt.student_id = caller_id
    AND attempt.status = 'in_progress'::public.qualification_attempt_status
  RETURNING attempt.* INTO attempt_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'In-progress qualification attempt not found for student'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN attempt_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_qualification(
  p_attempt_id uuid,
  p_criterion_results jsonb,
  p_outcome text,
  p_feedback text DEFAULT NULL
)
RETURNS public.student_qualification_attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  attempt_row public.student_qualification_attempts%ROWTYPE;
  qualification_row public.qualification_definitions%ROWTYPE;
  criterion_codes text[];
  result_keys text[];
BEGIN
  IF caller_id IS NULL
    OR public.current_reconciled_role() IS DISTINCT FROM 'instructor'::public.user_role
    OR NOT public.may_access_normal_app()
  THEN
    RAISE EXCEPTION 'Reconciled instructor role required' USING ERRCODE = '42501';
  END IF;

  IF p_outcome NOT IN ('needs_retry', 'passed') THEN
    RAISE EXCEPTION 'Qualification outcome must be needs_retry or passed'
      USING ERRCODE = '22023';
  END IF;

  IF p_criterion_results IS NULL
    OR jsonb_typeof(p_criterion_results) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'Criterion results must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  SELECT attempt.*
  INTO attempt_row
  FROM public.student_qualification_attempts AS attempt
  WHERE attempt.id = p_attempt_id
    AND attempt.status = 'awaiting_review'::public.qualification_attempt_status
  FOR UPDATE OF attempt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Qualification attempt awaiting review not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT qualification.* INTO qualification_row
  FROM public.qualification_definitions AS qualification
  WHERE qualification.id = attempt_row.qualification_id;

  IF NOT public.instructor_owns_session(attempt_row.session_id) THEN
    RAISE EXCEPTION 'Instructor does not own the qualification attempt session'
      USING ERRCODE = '42501';
  END IF;

  criterion_codes := public.qualification_rubric_codes(qualification_row.rubric);
  SELECT COALESCE(array_agg(result.key ORDER BY result.key), ARRAY[]::text[])
  INTO result_keys
  FROM jsonb_each(p_criterion_results) AS result(key, value);

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_criterion_results) AS result(key, value)
    WHERE NOT (result.key = ANY(criterion_codes))
       OR jsonb_typeof(result.value) IS DISTINCT FROM 'boolean'
  ) THEN
    RAISE EXCEPTION 'Criterion results contain unknown or non-boolean values'
      USING ERRCODE = '22023';
  END IF;

  IF p_outcome = 'passed' AND (
    cardinality(result_keys) <> cardinality(criterion_codes)
    OR EXISTS (
      SELECT 1
      FROM unnest(criterion_codes) AS required(code)
      WHERE p_criterion_results -> required.code IS NULL
         OR jsonb_typeof(p_criterion_results -> required.code) IS DISTINCT FROM 'boolean'
         OR (p_criterion_results ->> required.code)::boolean IS DISTINCT FROM true
    )
  ) THEN
    RAISE EXCEPTION 'Every qualification criterion must be present and passed'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.student_qualification_attempts
  SET status = p_outcome::public.qualification_attempt_status,
      criterion_results = p_criterion_results,
      reviewed_by = caller_id,
      reviewed_at = now(),
      feedback = p_feedback
  WHERE id = attempt_row.id
  RETURNING * INTO attempt_row;

  IF p_outcome = 'passed' THEN
    UPDATE public.student_profiles
    SET clearance_level = GREATEST(
      clearance_level,
      qualification_row.target_clearance
    )
    WHERE user_id = attempt_row.student_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Student profile not found for clearance promotion'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN attempt_row;
END;
$$;

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_mission_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_skill_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualification_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualification_required_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_qualification_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skills_read_authorized" ON public.skills;
CREATE POLICY "skills_read_authorized" ON public.skills
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND (is_active OR public.is_instructor())
  );

DROP POLICY IF EXISTS "training_missions_read_authorized"
  ON public.training_missions;
CREATE POLICY "training_missions_read_authorized" ON public.training_missions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND (
      status = 'published'::public.training_mission_status
      OR public.is_instructor()
    )
  );

DROP POLICY IF EXISTS "training_prerequisites_read_authorized"
  ON public.training_mission_prerequisites;
CREATE POLICY "training_prerequisites_read_authorized"
  ON public.training_mission_prerequisites
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.training_missions AS visible_mission
      WHERE visible_mission.id = training_mission_prerequisites.mission_id
    )
  );

DROP POLICY IF EXISTS "training_progress_read_authorized"
  ON public.training_mission_progress;
CREATE POLICY "training_progress_read_authorized"
  ON public.training_mission_progress
  FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND public.current_reconciled_role() = 'student'::public.user_role
      AND (SELECT auth.uid()) = student_id
    )
    OR public.instructor_can_access_student(student_id)
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1
        FROM public.session_participants AS participant
        WHERE participant.student_id = training_mission_progress.student_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "skill_verifications_read_authorized"
  ON public.student_skill_verifications;
CREATE POLICY "skill_verifications_read_authorized"
  ON public.student_skill_verifications
  FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND public.current_reconciled_role() = 'student'::public.user_role
      AND (SELECT auth.uid()) = student_id
    )
    OR public.instructor_can_access_student(student_id)
    OR (
      public.is_volunteer()
      AND EXISTS (
        SELECT 1
        FROM public.session_participants AS participant
        WHERE participant.student_id = student_skill_verifications.student_id
          AND public.has_joined_session(participant.session_id)
      )
    )
  );

DROP POLICY IF EXISTS "qualification_definitions_read_authorized"
  ON public.qualification_definitions;
CREATE POLICY "qualification_definitions_read_authorized"
  ON public.qualification_definitions
  FOR SELECT TO authenticated
  USING (
    (SELECT public.may_access_normal_app())
    AND (
      status = 'published'::public.qualification_definition_status
      OR public.is_instructor()
    )
  );

DROP POLICY IF EXISTS "qualification_required_skills_read_authorized"
  ON public.qualification_required_skills;
CREATE POLICY "qualification_required_skills_read_authorized"
  ON public.qualification_required_skills
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.qualification_definitions AS visible_qualification
      WHERE visible_qualification.id = qualification_required_skills.qualification_id
    )
  );

DROP POLICY IF EXISTS "qualification_attempts_read_authorized"
  ON public.student_qualification_attempts;
CREATE POLICY "qualification_attempts_read_authorized"
  ON public.student_qualification_attempts
  FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.may_access_normal_app())
      AND public.current_reconciled_role() = 'student'::public.user_role
      AND (SELECT auth.uid()) = student_id
    )
    OR public.instructor_owns_session(session_id)
  );

-- Browser access is deliberately SELECT-only. All state changes flow through
-- the narrow SECURITY DEFINER RPCs above. service_role retains controlled
-- administrative access for future migrations and server tooling.
REVOKE ALL ON TABLE public.skills FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.training_missions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.training_mission_prerequisites
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.training_mission_progress
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.student_skill_verifications
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.qualification_definitions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.qualification_required_skills
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.student_qualification_attempts
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.skills TO authenticated;
GRANT SELECT ON TABLE public.training_missions TO authenticated;
GRANT SELECT ON TABLE public.training_mission_prerequisites TO authenticated;
GRANT SELECT ON TABLE public.training_mission_progress TO authenticated;
GRANT SELECT ON TABLE public.student_skill_verifications TO authenticated;
GRANT SELECT ON TABLE public.qualification_definitions TO authenticated;
GRANT SELECT ON TABLE public.qualification_required_skills TO authenticated;
GRANT SELECT ON TABLE public.student_qualification_attempts TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.skills TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.training_missions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.training_mission_prerequisites TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.training_mission_progress TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.student_skill_verifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.qualification_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.qualification_required_skills TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.student_qualification_attempts TO service_role;

-- Browser clients may edit only ordinary self-service fields. Profile creation
-- belongs to Auth provisioning, and protected progression fields are writable
-- only through trusted server-side workflows.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.student_profiles
  FROM authenticated;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.student_profiles;
GRANT UPDATE (grade, age, interests, guardian_contact)
  ON TABLE public.student_profiles TO authenticated;

REVOKE ALL ON FUNCTION public.training_steps_are_valid(jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.training_step_ids(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qualification_rubric_is_valid(jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qualification_rubric_codes(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_training_mission_structure()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_training_prerequisite_set()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_qualification_structure()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_qualification_required_skill_set()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_skill_verification_provenance()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_reconciled_role()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.training_steps_are_valid(jsonb, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.training_step_ids(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.qualification_rubric_is_valid(jsonb, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.qualification_rubric_codes(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.current_reconciled_role()
  TO authenticated;

REVOKE ALL ON FUNCTION public.start_training_mission(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_training_mission_step(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_training_mission_for_verification(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_training_mission(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.return_training_mission(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.instructor_verify_skill(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_qualification(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_qualification(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_qualification(uuid, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_training_mission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_training_mission_step(uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_training_mission_for_verification(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_training_mission(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_training_mission(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.instructor_verify_skill(uuid, uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_qualification(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_qualification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_qualification(uuid, jsonb, text, text)
  TO authenticated;

DO $$
DECLARE
  expected_type record;
  expected_table text;
BEGIN
  FOR expected_type IN
    SELECT * FROM (VALUES
      ('training_mission_status', ARRAY['draft', 'published', 'archived']::text[]),
      ('training_mission_progress_status', ARRAY['in_progress', 'awaiting_verification', 'verified']::text[]),
      ('skill_verification_source', ARRAY['mission_verification', 'instructor_test_out']::text[]),
      ('qualification_definition_status', ARRAY['draft', 'published', 'archived']::text[]),
      ('qualification_attempt_status', ARRAY['in_progress', 'awaiting_review', 'needs_retry', 'passed']::text[])
    ) AS expected(type_name, labels)
  LOOP
    IF (
      SELECT array_agg(enum_value.enumlabel::text ORDER BY enum_value.enumsortorder)
      FROM pg_type AS enum_type
      JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
      JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
      WHERE namespace.nspname = 'public'
        AND enum_type.typname = expected_type.type_name
    ) IS DISTINCT FROM expected_type.labels THEN
      RAISE EXCEPTION 'Unexpected enum definition for %', expected_type.type_name;
    END IF;
  END LOOP;

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
      RAISE EXCEPTION 'Required Training table % was not created', expected_table;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
