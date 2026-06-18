-- ============================================================
-- PHASE 10: AUTH USERS — COMPLETE, EXECUTABLE
-- Run as a SEPARATE execution in Supabase SQL Editor
-- Project: oxiximaftgrpipqbrwej
-- Prerequisite: Executions 1 (schema + RLS + grants) must be complete
--
-- CRITICAL: GoTrue v2.190.0 is written in Go. Its User struct has
-- non-nullable `string` fields. If the following columns are NULL,
-- Go's database/sql.Scan() crashes with:
--   "converting NULL to string is unsupported"
-- → HTTP 500 "Database error finding user"
-- These six columns MUST be set to '' (empty string), never NULL:
--   confirmation_token, recovery_token, email_change_token_new,
--   email_change, phone_change_token, phone_change
-- ============================================================

-- Required for auth schema access
SELECT set_config('search_path', 'auth, public, extensions', false);

-- Ensure pgcrypto is available for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══ student1 — Maya R. (clearance 3) ═══
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000000', 'student1@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Maya R.","role":"student","username":"student1"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ═══ student2 — Devon T. ═══
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000000', 'student2@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Devon T.","role":"student","username":"student2"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ═══ student3 — Priya S. ═══
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000000', 'student3@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Priya S.","role":"student","username":"student3"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ═══ student4 — Jordan K. ═══
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000000', 'student4@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Jordan K.","role":"student","username":"student4"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ═══ student5 — Sam W. ═══
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000000', 'student5@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Sam W.","role":"student","username":"student5"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ═══ student6 — Ava L. ═══
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000000000', 'student6@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Ava L.","role":"student","username":"student6"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ═══ volunteer1 — J. Park ═══
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000000', 'volunteer1@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '{"role":"volunteer","provider":"email","providers":["email"]}', '{"display_name":"J. Park","role":"volunteer","username":"volunteer1"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ═══ instructor1 — Ms. Chen ═══
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change_token, phone_change, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000000', 'instructor1@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '', '', '{"role":"instructor","provider":"email","providers":["email"]}', '{"display_name":"Ms. Chen","role":"instructor","username":"instructor1"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ════════════════════════════════════════════════════════════
-- AUTH IDENTITIES (required for Supabase Auth to function)
-- ════════════════════════════════════════════════════════════

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001001', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001001', 'email', 'student1@sparkagency.internal'), now(), now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000001002', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001002', 'email', 'student2@sparkagency.internal'), now(), now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000001003', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001003', 'email', 'student3@sparkagency.internal'), now(), now(), now()),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000001004', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001004', 'email', 'student4@sparkagency.internal'), now(), now(), now()),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000001005', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001005', 'email', 'student5@sparkagency.internal'), now(), now(), now()),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000001006', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000001006', 'email', 'student6@sparkagency.internal'), now(), now(), now()),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000002001', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000002001', 'email', 'volunteer1@sparkagency.internal'), now(), now(), now()),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000003001', 'email', jsonb_build_object('sub', '00000000-0000-0000-0000-000000003001', 'email', 'instructor1@sparkagency.internal'), now(), now(), now())
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ═══ VERIFICATION (run after execution) ═══
-- SELECT count(*) AS auth_users FROM auth.users WHERE email LIKE '%@sparkagency.internal';
-- Expected: 8
-- SELECT count(*) AS public_users FROM public.users;
-- Expected: 8 (trigger populated)
-- SELECT count(*) AS identities FROM auth.identities WHERE provider = 'email';
-- Expected: 8
