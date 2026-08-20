-- Phase 1: Authentication role-authority and profile-permission hardening.
-- This migration does not create accounts or modify Supabase Auth credentials.

BEGIN;

-- Fail before normalization if existing usernames would collide or cannot be
-- represented by the canonical 3-32 character lowercase username format.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users
    GROUP BY lower(btrim(username))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot canonicalize public.users.username: lowercase/trimmed duplicates exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(btrim(username))
      !~ '^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$'
  ) THEN
    RAISE EXCEPTION
      'Cannot canonicalize public.users.username: unsupported username format exists';
  END IF;
END;
$$;

UPDATE public.users
SET username = lower(btrim(username))
WHERE username IS DISTINCT FROM lower(btrim(username));

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_username_canonical_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_username_canonical_check
  CHECK (
    username = lower(btrim(username))
    AND username ~ '^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$'
  );

-- The check constraint makes the existing UNIQUE(username) constraint
-- effectively case-insensitive. This index additionally makes that invariant
-- explicit for existing installations with nonstandard constraint history.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_canonical_key
  ON public.users (lower(username));

-- Student signup does not collect grade or age. Keep those values unknown
-- instead of fabricating demographic data during profile provisioning.
ALTER TABLE public.student_profiles
  ALTER COLUMN grade DROP NOT NULL;

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

-- No current application feature writes public.users directly. Provisioning is
-- performed only by the Auth trigger, so browser roles do not need these rights.
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_insert_auth" ON public.users;
REVOKE INSERT, UPDATE ON TABLE public.users FROM authenticated;

-- Report every role mismatch before reconciliation. raw_user_meta_data.role is
-- shown only as a diagnostic and is never used to choose the reconciled role.
SELECT
  'before_reconciliation' AS diagnostic_phase,
  pu.id,
  pu.username,
  pu.role AS public_role,
  au.raw_app_meta_data->>'role' AS trusted_app_role,
  au.raw_user_meta_data->>'role' AS untrusted_user_role,
  CASE
    WHEN au.raw_app_meta_data->>'role'
      IN ('student', 'volunteer', 'instructor')
      THEN au.raw_app_meta_data->>'role'
    ELSE 'student'
  END AS resolved_role
FROM public.users AS pu
JOIN auth.users AS au ON au.id = pu.id
WHERE pu.role::text IS DISTINCT FROM CASE
  WHEN au.raw_app_meta_data->>'role'
    IN ('student', 'volunteer', 'instructor')
    THEN au.raw_app_meta_data->>'role'
  ELSE 'student'
END
ORDER BY pu.username;

UPDATE public.users AS pu
SET role = CASE
  WHEN au.raw_app_meta_data->>'role'
    IN ('student', 'volunteer', 'instructor')
    THEN (au.raw_app_meta_data->>'role')::public.user_role
  ELSE 'student'::public.user_role
END
FROM auth.users AS au
WHERE au.id = pu.id
  AND pu.role IS DISTINCT FROM CASE
    WHEN au.raw_app_meta_data->>'role'
      IN ('student', 'volunteer', 'instructor')
      THEN (au.raw_app_meta_data->>'role')::public.user_role
    ELSE 'student'::public.user_role
  END;

-- Expected result after a successful reconciliation: zero rows.
SELECT
  'after_reconciliation' AS diagnostic_phase,
  pu.id,
  pu.username,
  pu.role AS public_role,
  au.raw_app_meta_data->>'role' AS trusted_app_role,
  au.raw_user_meta_data->>'role' AS untrusted_user_role,
  CASE
    WHEN au.raw_app_meta_data->>'role'
      IN ('student', 'volunteer', 'instructor')
      THEN au.raw_app_meta_data->>'role'
    ELSE 'student'
  END AS resolved_role
FROM public.users AS pu
JOIN auth.users AS au ON au.id = pu.id
WHERE pu.role::text IS DISTINCT FROM CASE
  WHEN au.raw_app_meta_data->>'role'
    IN ('student', 'volunteer', 'instructor')
    THEN au.raw_app_meta_data->>'role'
  ELSE 'student'
END
ORDER BY pu.username;

COMMIT;
