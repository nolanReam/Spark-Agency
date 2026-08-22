-- Phase 3.1: Reconcile public roles after trusted Auth app metadata changes.
-- Supabase Admin user creation inserts auth.users before applying custom
-- raw_app_meta_data, so elevated roles require a narrowly scoped UPDATE trigger.

BEGIN;

-- Diagnostics before reconciliation: Auth/public role mismatches.
SELECT
  'before_role_reconciliation' AS diagnostic_phase,
  au.id,
  au.email,
  au.raw_app_meta_data->>'role' AS trusted_app_role,
  pu.role AS public_role,
  CASE
    WHEN au.raw_app_meta_data->>'role'
      IN ('student', 'volunteer', 'instructor')
      THEN au.raw_app_meta_data->>'role'
    ELSE 'student'
  END AS resolved_role
FROM auth.users AS au
LEFT JOIN public.users AS pu ON pu.id = au.id
WHERE pu.id IS NULL
   OR pu.role::text IS DISTINCT FROM CASE
     WHEN au.raw_app_meta_data->>'role'
       IN ('student', 'volunteer', 'instructor')
       THEN au.raw_app_meta_data->>'role'
     ELSE 'student'
   END
ORDER BY au.email;

-- Diagnostics before reconciliation: staff accounts with student profiles.
SELECT
  'before_staff_profile_reconciliation' AS diagnostic_phase,
  au.id,
  au.email,
  au.raw_app_meta_data->>'role' AS trusted_app_role,
  pu.role AS public_role
FROM auth.users AS au
JOIN public.users AS pu ON pu.id = au.id
JOIN public.student_profiles AS sp ON sp.user_id = au.id
WHERE au.raw_app_meta_data->>'role' IN ('volunteer', 'instructor')
ORDER BY au.email;

-- Diagnostics before reconciliation: resolved students missing profiles.
SELECT
  'before_missing_student_profile_reconciliation' AS diagnostic_phase,
  au.id,
  au.email,
  au.raw_app_meta_data->>'role' AS trusted_app_role,
  pu.role AS public_role
FROM auth.users AS au
JOIN public.users AS pu ON pu.id = au.id
LEFT JOIN public.student_profiles AS sp ON sp.user_id = au.id
WHERE CASE
    WHEN au.raw_app_meta_data->>'role'
      IN ('student', 'volunteer', 'instructor')
      THEN au.raw_app_meta_data->>'role'
    ELSE 'student'
  END = 'student'
  AND sp.user_id IS NULL
ORDER BY au.email;

-- Reconciliation deliberately does not invent missing public usernames or
-- display names. Fail before changing data if Auth provisioning is incomplete.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users AS au
    LEFT JOIN public.users AS pu ON pu.id = au.id
    WHERE pu.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Trusted role reconciliation requires every Auth user to have a public.users row';
  END IF;
END;
$$;

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

-- Preserve exactly one INSERT-only provisioning trigger.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Reconcile only when the trusted role value itself changes.
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

-- Reconcile every existing public role from trusted Auth app metadata only.
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

-- Preserve existing student profile data and create only missing rows.
INSERT INTO public.student_profiles (user_id, clearance_level)
SELECT pu.id, 1
FROM public.users AS pu
JOIN auth.users AS au ON au.id = pu.id
LEFT JOIN public.student_profiles AS sp ON sp.user_id = pu.id
WHERE CASE
    WHEN au.raw_app_meta_data->>'role'
      IN ('student', 'volunteer', 'instructor')
      THEN au.raw_app_meta_data->>'role'
    ELSE 'student'
  END = 'student'
  AND sp.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Staff accounts must never retain student-only profiles.
DELETE FROM public.student_profiles AS sp
USING auth.users AS au
WHERE au.id = sp.user_id
  AND au.raw_app_meta_data->>'role' IN ('volunteer', 'instructor');

-- Fail and roll back if any role/profile invariant remains unsatisfied.
DO $$
DECLARE
  v_insert_trigger_count INTEGER;
  v_update_trigger_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users AS au
    JOIN public.users AS pu ON pu.id = au.id
    WHERE pu.role::text IS DISTINCT FROM CASE
      WHEN au.raw_app_meta_data->>'role'
        IN ('student', 'volunteer', 'instructor')
        THEN au.raw_app_meta_data->>'role'
      ELSE 'student'
    END
  ) THEN
    RAISE EXCEPTION 'Trusted role reconciliation left Auth/public role mismatches';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS au
    JOIN public.student_profiles AS sp ON sp.user_id = au.id
    WHERE au.raw_app_meta_data->>'role' IN ('volunteer', 'instructor')
  ) THEN
    RAISE EXCEPTION 'Trusted role reconciliation left student profiles on staff accounts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM auth.users AS au
    JOIN public.users AS pu ON pu.id = au.id
    LEFT JOIN public.student_profiles AS sp ON sp.user_id = au.id
    WHERE CASE
        WHEN au.raw_app_meta_data->>'role'
          IN ('student', 'volunteer', 'instructor')
          THEN au.raw_app_meta_data->>'role'
        ELSE 'student'
      END = 'student'
      AND sp.user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Trusted role reconciliation left students without profiles';
  END IF;

  SELECT count(*)
  INTO v_insert_trigger_count
  FROM pg_trigger AS t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND NOT t.tgisinternal
    AND t.tgfoid = 'public.handle_new_auth_user()'::regprocedure;

  SELECT count(*)
  INTO v_update_trigger_count
  FROM pg_trigger AS t
  WHERE t.tgrelid = 'auth.users'::regclass
    AND NOT t.tgisinternal
    AND t.tgfoid = 'public.sync_auth_user_trusted_role()'::regprocedure;

  IF v_insert_trigger_count <> 1 OR v_update_trigger_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one INSERT provisioning trigger and one trusted-role reconciliation trigger';
  END IF;
END;
$$;

-- Expected after reconciliation: each diagnostic returns zero rows.
SELECT
  'after_role_reconciliation' AS diagnostic_phase,
  au.id,
  au.email,
  au.raw_app_meta_data->>'role' AS trusted_app_role,
  pu.role AS public_role
FROM auth.users AS au
JOIN public.users AS pu ON pu.id = au.id
WHERE pu.role::text IS DISTINCT FROM CASE
  WHEN au.raw_app_meta_data->>'role'
    IN ('student', 'volunteer', 'instructor')
    THEN au.raw_app_meta_data->>'role'
  ELSE 'student'
END
ORDER BY au.email;

SELECT
  'after_staff_profile_reconciliation' AS diagnostic_phase,
  au.id,
  au.email,
  au.raw_app_meta_data->>'role' AS trusted_app_role,
  pu.role AS public_role
FROM auth.users AS au
JOIN public.users AS pu ON pu.id = au.id
JOIN public.student_profiles AS sp ON sp.user_id = au.id
WHERE au.raw_app_meta_data->>'role' IN ('volunteer', 'instructor')
ORDER BY au.email;

SELECT
  'after_missing_student_profile_reconciliation' AS diagnostic_phase,
  au.id,
  au.email,
  au.raw_app_meta_data->>'role' AS trusted_app_role,
  pu.role AS public_role
FROM auth.users AS au
JOIN public.users AS pu ON pu.id = au.id
LEFT JOIN public.student_profiles AS sp ON sp.user_id = au.id
WHERE CASE
    WHEN au.raw_app_meta_data->>'role'
      IN ('student', 'volunteer', 'instructor')
      THEN au.raw_app_meta_data->>'role'
    ELSE 'student'
  END = 'student'
  AND sp.user_id IS NULL
ORDER BY au.email;

COMMIT;
