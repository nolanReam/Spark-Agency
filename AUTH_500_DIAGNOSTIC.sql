-- ============================================================
-- AUTH 500 DIAGNOSTIC
-- Run each diagnostic separately in Supabase SQL Editor
-- Project: oxiximaftgrpipqbrwej
-- ============================================================
SELECT set_config('search_path', 'auth, public, extensions', false);


-- ════════════════════════════════════════════════════════════
-- DIAGNOSTIC 1: Raw row dump — both users side by side
-- PURPOSE: Spot column-level differences between a working
-- (signup-created) account and a broken (seeded) account.
-- INTERPRET: Any column where the seeded value is NULL but
-- the signup value is NOT NULL could cause GoTrue to crash.
-- ════════════════════════════════════════════════════════════
SELECT 'DIAGNOSTIC 1' AS diag;
SELECT * FROM auth.users WHERE email = 'student1@sparkagency.internal';
SELECT * FROM auth.users WHERE email = 'testdirect@outlook.com';


-- ════════════════════════════════════════════════════════════
-- DIAGNOSTIC 2: Password hash format
-- PURPOSE: GoTrue calls bcrypt.CompareHashAndPassword().
-- If the hash prefix is not $2a$, $2b$, or $2y$, GoTrue's
-- bcrypt library will error → HTTP 500.
-- INTERPRET: All rows MUST show format_check = ✅ OK
-- ════════════════════════════════════════════════════════════
SELECT 'DIAGNOSTIC 2' AS diag;
SELECT email,
       length(encrypted_password) AS pw_len,
       substring(encrypted_password, 1, 4) AS prefix,
       CASE WHEN encrypted_password ~ '^\$2[aby]\$' THEN '✅ OK'
            ELSE '❌ BAD FORMAT'
       END AS format_check
FROM auth.users
WHERE email IN ('student1@sparkagency.internal', 'testdirect@outlook.com');


-- ════════════════════════════════════════════════════════════
-- DIAGNOSTIC 3: app_metadata JSON structure
-- PURPOSE: GoTrue reads app_metadata during token generation.
-- Missing provider/providers keys → GoTrue may panic.
-- INTERPRET: Both rows MUST show structure_check = ✅ OK
-- ════════════════════════════════════════════════════════════
SELECT 'DIAGNOSTIC 3' AS diag;
SELECT email,
       raw_app_meta_data,
       raw_app_meta_data->>'provider' AS provider_key,
       jsonb_typeof(raw_app_meta_data->'providers') AS providers_is_array,
       CASE WHEN raw_app_meta_data->>'provider' IS NULL THEN '❌ MISSING provider'
            WHEN raw_app_meta_data->'providers' IS NULL THEN '❌ MISSING providers'
            WHEN jsonb_typeof(raw_app_meta_data->'providers') <> 'array' THEN '❌ providers NOT array'
            ELSE '✅ OK'
       END AS structure_check
FROM auth.users
WHERE email IN ('student1@sparkagency.internal', 'testdirect@outlook.com');


-- ════════════════════════════════════════════════════════════
-- DIAGNOSTIC 4: Identity comparison
-- PURPOSE: GoTrue v2 REQUIRES auth.identities rows for login.
-- Compare seeded identity vs signup identity structure.
-- INTERPRET: Both should have provider='email', provider_id
-- should not be null, identity_data should contain sub + email.
-- ════════════════════════════════════════════════════════════
SELECT 'DIAGNOSTIC 4 — Seeded identity' AS diag;
SELECT id, user_id, provider, provider_id, identity_data
FROM auth.identities
WHERE user_id = '00000000-0000-0000-0000-000000001001';

SELECT 'DIAGNOSTIC 4 — Signup identity' AS diag;
SELECT i.id, i.user_id, i.provider, i.provider_id, i.identity_data
FROM auth.identities i
JOIN auth.users u ON i.user_id = u.id
WHERE u.email = 'testdirect@outlook.com';


-- ════════════════════════════════════════════════════════════
-- DIAGNOSTIC 5: The Trigger — PRIMARY SUSPECT
-- PURPOSE: on_auth_user_created fires on AFTER INSERT OR UPDATE.
-- When GoTrue updates last_sign_in_at during login, this trigger
-- fires handle_new_auth_user(). If that function errors, GoTrue
-- rolls back the transaction → HTTP 500.
--
-- The trigger function does:
--   1. UPSERT into public.users
--   2. INSERT into public.student_profiles (if role='student')
--
-- TEST A: Check trigger definition
-- TEST B: Manually simulate login UPDATE to see if trigger errors
-- TEST C: Test trigger function in isolation
-- ════════════════════════════════════════════════════════════

-- TEST A: Show the trigger definition
SELECT 'DIAGNOSTIC 5A — Trigger definition' AS diag;
SELECT tgname, pg_get_triggerdef(oid) AS definition, tgenabled
FROM pg_trigger
WHERE tgname = 'on_auth_user_created'
  AND tgrelid = 'auth.users'::regclass;

-- TEST B: Simulate GoTrue login UPDATE on student1
-- GoTrue does UPDATE SET last_sign_in_at = now() on login.
-- This MUST succeed. If it errors, the trigger is the cause.
SELECT 'DIAGNOSTIC 5B — Simulate login UPDATE on student1' AS diag;
BEGIN;
UPDATE auth.users
SET last_sign_in_at = now()
WHERE id = '00000000-0000-0000-0000-000000001001';
-- If you see an error here, the trigger is broken.
-- If it succeeds, COMMIT below.
ROLLBACK; -- Don't actually change data

-- TEST C: Call the trigger function directly with student1's data
SELECT 'DIAGNOSTIC 5C — Direct trigger function test' AS diag;
SELECT public.handle_new_auth_user()
FROM (SELECT * FROM auth.users WHERE id = '00000000-0000-0000-0000-000000001001') AS fake_new;


-- ════════════════════════════════════════════════════════════
-- DIAGNOSTIC 6: Check if user_role enum exists
-- PURPOSE: The trigger function casts to public.user_role.
-- If the enum was created in the wrong schema or not at all,
-- the cast will fail.
-- ════════════════════════════════════════════════════════════
SELECT 'DIAGNOSTIC 6 — user_role enum' AS diag;
SELECT typname, nspname
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE typname = 'user_role';


-- ════════════════════════════════════════════════════════════
-- DIAGNOSTIC 7: Check auth schema version columns
-- PURPOSE: Different GoTrue versions expect different columns.
-- If a column exists in the schema but our INSERT didn't set it,
-- and GoTrue tries to read it, it might crash.
-- Compare column names between seeded and signup rows.
-- ════════════════════════════════════════════════════════════
SELECT 'DIAGNOSTIC 7 — All auth.users columns for both users' AS diag;
SELECT
  'student1' AS account,
  jsonb_object_keys(to_jsonb(u)) AS column_name,
  to_jsonb(u)->>jsonb_object_keys(to_jsonb(u)) AS column_value
FROM auth.users u
WHERE email = 'student1@sparkagency.internal'
UNION ALL
SELECT
  'testdirect',
  jsonb_object_keys(to_jsonb(u)),
  to_jsonb(u)->>jsonb_object_keys(to_jsonb(u))
FROM auth.users u
WHERE email = 'testdirect@outlook.com'
ORDER BY account, column_name;


-- ════════════════════════════════════════════════════════════
-- DIAGNOSTIC 8: Auth logs from Dashboard
-- PURPOSE: See the actual GoTrue error message
-- Cannot run via SQL — use Supabase Dashboard → Logs → Auth Logs
-- Filter for path = /token and status = 500
-- ════════════════════════════════════════════════════════════
SELECT 'DIAGNOSTIC 8 — Check Supabase Dashboard → Logs → Auth Logs' AS diag;
SELECT 'Look for POST /token?grant_type=password with status 500' AS instruction;
SELECT 'The error_message column will reveal the exact cause' AS instruction;
