-- ============================================================
-- SPARK AGENCY — Complete Database Reconstruction
-- Extracted from Codize project (tadkbymxkdncqahzshml)
-- 10 migrations consolidated into a single deployment script
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

-- ============================================================
-- PHASE 2: TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT UNIQUE NOT NULL,
  role            user_role NOT NULL,
  display_name    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade                SMALLINT NOT NULL CHECK (grade BETWEEN 3 AND 6),
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
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES users(id),
  case_id     UUID REFERENCES cases(id),
  reason      flag_reason NOT NULL,
  raised_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id)
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
CREATE INDEX IF NOT EXISTS idx_mastery_student_concept ON concept_mastery_snapshots (student_id, concept_tag, recorded_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);

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
SET search_path = 'public'
AS $$
DECLARE
  v_username TEXT;
  v_role public.user_role;
  v_display_name TEXT;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1));
  v_role := (COALESCE(NEW.raw_user_meta_data->>'role', 'student'))::public.user_role;
  v_display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', v_username);

  INSERT INTO public.users (id, username, role, display_name)
  VALUES (NEW.id, v_username, v_role, v_display_name)
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    updated_at = now();

  IF v_role = 'student' THEN
    INSERT INTO public.student_profiles (user_id, grade, age, clearance_level)
    VALUES (NEW.id, 4, 9, 1)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- PHASE 5: RLS HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_instructor() RETURNS boolean AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'role') = 'instructor';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_volunteer_or_instructor() RETURNS boolean AS $$
BEGIN
  RETURN (auth.jwt() -> 'app_metadata' ->> 'role') IN ('volunteer', 'instructor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.resolve_own_raise_hand(p_case_id UUID)
RETURNS intervention_flags AS $$
DECLARE
  resolved_flag intervention_flags;
BEGIN
  UPDATE public.intervention_flags
  SET resolved_at = now(),
      resolved_by = auth.uid()
  WHERE student_id = auth.uid()
    AND case_id = p_case_id
    AND reason = 'student_raise_hand'
    AND resolved_at IS NULL
  RETURNING * INTO resolved_flag;

  RETURN resolved_flag;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

-- users
DROP POLICY IF EXISTS "users_read_own" ON users;
CREATE POLICY "users_read_own" ON users FOR SELECT
  USING (auth.uid() = id OR is_volunteer_or_instructor());
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "users_insert_auth" ON users;
CREATE POLICY "users_insert_auth" ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- student_profiles
DROP POLICY IF EXISTS "profiles_read_own" ON student_profiles;
CREATE POLICY "profiles_read_own" ON student_profiles FOR SELECT
  USING (auth.uid() = user_id OR is_volunteer_or_instructor());
DROP POLICY IF EXISTS "profiles_update_own" ON student_profiles;
CREATE POLICY "profiles_update_own" ON student_profiles FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles_insert_own" ON student_profiles;
CREATE POLICY "profiles_insert_own" ON student_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- organizations
DROP POLICY IF EXISTS "orgs_read_auth" ON organizations;
CREATE POLICY "orgs_read_auth" ON organizations FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- memberships
DROP POLICY IF EXISTS "memberships_read_auth" ON memberships;
CREATE POLICY "memberships_read_auth" ON memberships FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- cases
DROP POLICY IF EXISTS "cases_read_auth" ON cases;
CREATE POLICY "cases_read_auth" ON cases FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "cases_insert_instructor" ON cases;
CREATE POLICY "cases_insert_instructor" ON cases FOR INSERT
  WITH CHECK (is_instructor());
DROP POLICY IF EXISTS "cases_update_instructor" ON cases;
CREATE POLICY "cases_update_instructor" ON cases FOR UPDATE
  USING (is_instructor()) WITH CHECK (is_instructor());
DROP POLICY IF EXISTS "cases_delete_instructor" ON cases;
CREATE POLICY "cases_delete_instructor" ON cases FOR DELETE
  USING (is_instructor());

-- case_lanes
DROP POLICY IF EXISTS "lanes_read_auth" ON case_lanes;
CREATE POLICY "lanes_read_auth" ON case_lanes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- case_concept_weights
DROP POLICY IF EXISTS "weights_read_auth" ON case_concept_weights;
CREATE POLICY "weights_read_auth" ON case_concept_weights FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- prediction_gates
DROP POLICY IF EXISTS "gates_read_auth" ON prediction_gates;
CREATE POLICY "gates_read_auth" ON prediction_gates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- sessions
DROP POLICY IF EXISTS "sessions_read_auth" ON sessions;
CREATE POLICY "sessions_read_auth" ON sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "sessions_insert_instructor" ON sessions;
CREATE POLICY "sessions_insert_instructor" ON sessions FOR INSERT
  WITH CHECK (is_instructor());
DROP POLICY IF EXISTS "sessions_update_instructor" ON sessions;
CREATE POLICY "sessions_update_instructor" ON sessions FOR UPDATE
  USING (is_instructor());

-- session_participants
DROP POLICY IF EXISTS "participants_read_auth" ON session_participants;
CREATE POLICY "participants_read_auth" ON session_participants FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "participants_insert_student" ON session_participants;
CREATE POLICY "participants_insert_student" ON session_participants FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- case_progress
DROP POLICY IF EXISTS "progress_read_own" ON case_progress;
CREATE POLICY "progress_read_own" ON case_progress FOR SELECT
  USING (auth.uid() = student_id OR is_volunteer_or_instructor());
DROP POLICY IF EXISTS "progress_insert_student" ON case_progress;
CREATE POLICY "progress_insert_student" ON case_progress FOR INSERT
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "progress_update_student" ON case_progress;
CREATE POLICY "progress_update_student" ON case_progress FOR UPDATE
  USING (auth.uid() = student_id OR is_volunteer_or_instructor());

-- predictions
DROP POLICY IF EXISTS "predictions_read_own" ON predictions;
CREATE POLICY "predictions_read_own" ON predictions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM case_progress cp WHERE cp.id = predictions.case_progress_id AND (cp.student_id = auth.uid() OR is_volunteer_or_instructor()))
  );
DROP POLICY IF EXISTS "predictions_insert_student" ON predictions;
CREATE POLICY "predictions_insert_student" ON predictions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM case_progress cp WHERE cp.id = predictions.case_progress_id AND cp.student_id = auth.uid())
  );

-- reviews
DROP POLICY IF EXISTS "reviews_read_auth" ON reviews;
CREATE POLICY "reviews_read_auth" ON reviews FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "reviews_insert_auth" ON reviews;
CREATE POLICY "reviews_insert_auth" ON reviews FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "reviews_claim_update" ON reviews;
CREATE POLICY "reviews_claim_update" ON reviews FOR UPDATE
  USING (is_volunteer_or_instructor());

-- review_attachments
DROP POLICY IF EXISTS "attachments_read_auth" ON review_attachments;
CREATE POLICY "attachments_read_auth" ON review_attachments FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "attachments_insert_own" ON review_attachments;
CREATE POLICY "attachments_insert_own" ON review_attachments FOR INSERT
  WITH CHECK (auth.uid() = uploaded_by);

-- reflections
DROP POLICY IF EXISTS "reflections_read_own" ON reflections;
CREATE POLICY "reflections_read_own" ON reflections FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM case_progress cp WHERE cp.id = reflections.case_progress_id AND (cp.student_id = auth.uid() OR is_volunteer_or_instructor()))
  );
DROP POLICY IF EXISTS "reflections_insert_student" ON reflections;
CREATE POLICY "reflections_insert_student" ON reflections FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM case_progress cp WHERE cp.id = reflections.case_progress_id AND cp.student_id = auth.uid())
  );

-- intervention_flags
DROP POLICY IF EXISTS "flags_read_own" ON intervention_flags;
CREATE POLICY "flags_read_own" ON intervention_flags FOR SELECT
  USING (auth.uid() = student_id OR is_volunteer_or_instructor());
DROP POLICY IF EXISTS "flags_insert_student" ON intervention_flags;
CREATE POLICY "flags_insert_student" ON intervention_flags FOR INSERT
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "flags_update_volunteer" ON intervention_flags;
CREATE POLICY "flags_update_volunteer" ON intervention_flags FOR UPDATE
  USING (is_volunteer_or_instructor());

-- lane_attempts
DROP POLICY IF EXISTS "lane_attempts_read_own" ON lane_attempts;
CREATE POLICY "lane_attempts_read_own" ON lane_attempts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM case_progress cp WHERE cp.id = lane_attempts.case_progress_id AND (cp.student_id = auth.uid() OR is_volunteer_or_instructor()))
  );
DROP POLICY IF EXISTS "lane_attempts_insert_student" ON lane_attempts;
CREATE POLICY "lane_attempts_insert_student" ON lane_attempts FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM case_progress cp WHERE cp.id = lane_attempts.case_progress_id AND cp.student_id = auth.uid())
  );

-- student_concept_mastery
DROP POLICY IF EXISTS "mastery_read_own" ON student_concept_mastery;
CREATE POLICY "mastery_read_own" ON student_concept_mastery FOR SELECT
  USING (auth.uid() = student_id OR is_volunteer_or_instructor());

-- concept_mastery_snapshots
DROP POLICY IF EXISTS "snapshots_read_own" ON concept_mastery_snapshots;
CREATE POLICY "snapshots_read_own" ON concept_mastery_snapshots FOR SELECT
  USING (auth.uid() = student_id OR is_volunteer_or_instructor());
DROP POLICY IF EXISTS "snapshots_insert_instructor" ON concept_mastery_snapshots;
CREATE POLICY "snapshots_insert_instructor" ON concept_mastery_snapshots FOR INSERT
  WITH CHECK (is_instructor());

-- session_summaries
DROP POLICY IF EXISTS "summaries_read_auth" ON session_summaries;
CREATE POLICY "summaries_read_auth" ON session_summaries FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- PHASE 8: TABLE GRANTS (CRITICAL — PostgREST prerequisite)
-- ============================================================

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT INSERT ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT UPDATE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;

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
GRANT EXECUTE ON FUNCTION public.is_instructor() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_volunteer_or_instructor() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_own_raise_hand(UUID) TO authenticated;

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
