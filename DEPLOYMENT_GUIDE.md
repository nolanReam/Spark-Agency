# Spark Agency — Deployment Guide

**Target project**: `oxiximaftgrpipqbrwej` (`https://oxiximaftgrpipqbrwej.supabase.co`)
**Source**: `SPARK_AGENCY_SCHEMA.sql` (extracted from Codize `tadkbymxkdncqahzshml`, 10 migrations)
**Status**: Pre-deployment — do not apply until Phase 1 (env verification) verifies target readiness

---

## Pre-Flight Checklist

Run these in the Supabase SQL Editor for `oxiximaftgrpipqbrwej` **before** any deployment:

```sql
-- 1. Confirm project is running Postgres 15+
SELECT version();

-- 2. Confirm auth schema exists (it always does on Supabase projects)
SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'auth';

-- 3. Confirm no tables exist yet in public
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
-- Expected: 0 (blank project)

-- 4. Confirm the anon user exists
SELECT count(*) FROM pg_roles WHERE rolname = 'anon';
-- Expected: 1

-- 5. Confirm the authenticated user exists
SELECT count(*) FROM pg_roles WHERE rolname = 'authenticated';
-- Expected: 1

-- 6. Confirm Supabase Auth is running
-- Run in Bash: curl -s https://oxiximaftgrpipqbrwej.supabase.co/auth/v1/health
-- Expected: {"version":"v2...","name":"GoTrue",...}
```

### Auth Settings (Supabase Dashboard)
Before Phase 10: go to **Authentication → Settings** and verify:
- **Allow new users to sign up**: ENABLED (not required for SQL-inserted users, but safe)
- **Email confirmations**: DISABLED (users are created with `email_confirmed_at = now()`)
- No email domain restrictions blocking `@sparkagency.internal`

---

## Execution Plan

The script must be run in **3 separate SQL Editor executions**. Running everything together will fail because Phase 11 inserts reference `public.users` rows that don't exist until the auth trigger fires.

```
                    SPARK_AGENCY_SCHEMA.sql
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                 ▼
    EXECUTION 1       EXECUTION 2      EXECUTION 3
    Lines 10-581     Lines 590-600     Lines 605-746
    Phases 1-9       Phase 10          Phase 11
    (schema+grants)  (auth users)      (seed data)
          │                │                 │
          ▼                ▼                 ▼
    Tables exist     Auth users exist   Live demo data
    RLS enabled      Trigger fires      All FK refs valid
    Policies set     public.users       Cases, sessions,
    Grants applied   populated          reviews, progress
```

---

### EXECUTION 1 — Schema Foundation (lines 10–581)

**Copy**: Everything from line 10 (`-- PHASE 1: ENUMS`) through line 581 end.

This includes:
- **Phase 1**: 8 enum types
- **Phase 2**: 21 tables (all `CREATE TABLE IF NOT EXISTS`)
- **Phase 3**: 8 indexes
- **Phase 4**: 2 trigger functions + 4 triggers (including `handle_new_auth_user` which syncs auth → public)
- **Phase 5**: 2 RLS helper functions (`is_instructor`, `is_volunteer_or_instructor`)
- **Phase 6**: RLS enabled on all tables (dynamic loop)
- **Phase 7**: 30 RLS policies (DROP IF EXISTS + CREATE)
- **Phase 8**: Table grants + function grants
- **Phase 9**: 1 org seed row

**Expected output**: `DO` (successful execution of DO blocks for enums), then `CREATE TABLE`, `CREATE INDEX`, etc. No errors.

**Verification after Execution 1**:
```sql
-- Table count: should be exactly 21
SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';
-- Expected: 21

-- RLS enabled count: should be exactly 21
SELECT count(*) AS rls_enabled FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;
-- Expected: 21

-- Policy count: should be exactly 30
SELECT count(*) AS policy_count FROM pg_policies WHERE schemaname = 'public';
-- Expected: 30

-- Functions exist
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;
-- Expected: handle_new_auth_user, is_instructor, is_volunteer_or_instructor, update_updated_at_column

-- Org exists
SELECT id, name FROM public.organizations;
-- Expected: 1 row — "Spark Agency — Riverside Chapter"

-- Public.users is empty (no auth users created yet)
SELECT count(*) FROM public.users;
-- Expected: 0
```

---

### EXECUTION 2 — Auth Users (lines 590–600, commented-out Phase 10)

**WARNING**: Phase 10 is commented out in `SPARK_AGENCY_SCHEMA.sql`. You must uncomment and run the following:

```sql
-- Phase 10: Create 8 auth users
-- Run this in a SEPARATE SQL Editor execution after Execution 1 succeeds

SELECT set_config('search_path', 'auth, public, extensions', false);

-- student1 — Maya R.
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000000', 'student1@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Maya R.","role":"student","username":"student1"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- student2 — Devon T.
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000000', 'student2@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Devon T.","role":"student","username":"student2"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- student3 — Priya S.
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000000', 'student3@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Priya S.","role":"student","username":"student3"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- student4 — Jordan K.
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001004', '00000000-0000-0000-0000-000000000000', 'student4@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Jordan K.","role":"student","username":"student4"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- student5 — Sam W.
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001005', '00000000-0000-0000-0000-000000000000', 'student5@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Sam W.","role":"student","username":"student5"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- student6 — Ava L.
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000001006', '00000000-0000-0000-0000-000000000000', 'student6@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"student","provider":"email","providers":["email"]}', '{"display_name":"Ava L.","role":"student","username":"student6"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- volunteer1 — J. Park
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000000000', 'volunteer1@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"volunteer","provider":"email","providers":["email"]}', '{"display_name":"J. Park","role":"volunteer","username":"volunteer1"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- instructor1 — Ms. Chen
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000000000', 'instructor1@sparkagency.internal', crypt('demo1234', gen_salt('bf')), now(), '{"role":"instructor","provider":"email","providers":["email"]}', '{"display_name":"Ms. Chen","role":"instructor","username":"instructor1"}', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Create auth identities (required for auth to function)
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
```

**What this does**: Inserts directly into `auth.users`. The `handle_new_auth_user` trigger (created in Execution 1) fires `AFTER INSERT` and auto-populates `public.users` and `public.student_profiles`.

**Expected output**: `INSERT 0 1` (or `INSERT 0 0` on re-run due to `ON CONFLICT DO NOTHING`)

**Verification after Execution 2**:
```sql
-- Auth user count
SELECT count(*) FROM auth.users WHERE email LIKE '%@sparkagency.internal';
-- Expected: 8

-- Public user count (trigger should have populated these)
SELECT count(*) FROM public.users;
-- Expected: 8

-- Public users detail (verify trigger populated correctly)
SELECT id, username, role, display_name FROM public.users ORDER BY role, username;
-- Expected: 6 students, 1 volunteer, 1 instructor

-- Student profiles (trigger should have created for students)
SELECT count(*) FROM public.student_profiles;
-- Expected: 6

-- Auth identities exist
SELECT count(*) FROM auth.identities WHERE provider = 'email';
-- Expected: 8
```

### Login Verification (after Execution 2)

Run from Bash or any HTTP client:
```bash
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94aXhpbWFmdGdycGlwcWJyd2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Mzc5ODUsImV4cCI6MjA5NzIxMzk4NX0.agyl0Ge416zGP3ZDV74rm9AazlON8s3T74tHrZJMWGQ"

# Test student1 login
curl -X POST -H "apikey: $KEY" -H "Content-Type: application/json" \
  "https://oxiximaftgrpipqbrwej.supabase.co/auth/v1/token?grant_type=password" \
  -d '{"email":"student1@sparkagency.internal","password":"demo1234"}'
# Expected: 200 with access_token, refresh_token, user object

# Test instructor1 login
curl -X POST -H "apikey: $KEY" -H "Content-Type: application/json" \
  "https://oxiximaftgrpipqbrwej.supabase.co/auth/v1/token?grant_type=password" \
  -d '{"email":"instructor1@sparkagency.internal","password":"demo1234"}'
# Expected: 200
```

If logins return `invalid_credentials`, check:
1. Were `auth.identities` rows inserted?
2. Is the email domain allowed in Auth settings?
3. Run: `SELECT email, email_confirmed_at, raw_app_meta_data FROM auth.users WHERE email = 'student1@sparkagency.internal';`

---

### EXECUTION 3 — Seed Data (lines 605–746, Phase 11 only)

**Copy**: Everything from line 605 through the end of the file.

This inserts:
- 6 student profile updates (overwrites trigger defaults with real clearance/reputation/age data)
- 3 cases (L1-03, L1-04, L2-01)
- 9 case lanes
- 9 concept weights
- 3 prediction gates
- 1 active session (AGENCY-271)
- 6 session participants
- 6 case progress rows (various states)
- 5 reviews
- 2 predictions
- 2 intervention flags
- 5 student concept mastery entries

**Expected output**: Multiple `INSERT 0 1` lines. No errors.

If you get FK violations:
- The most common cause is `public.users` not populated. Verify Execution 2 completed.
- Run: `SELECT count(*) FROM public.users;` — must be 8 before proceeding.

---

## Verification Queries

Run these after ALL 3 executions:

### Table count
```sql
SELECT count(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';
-- Expected: 21
```

### User count
```sql
SELECT role, count(*) FROM public.users GROUP BY role ORDER BY role;
-- Expected: student=6, volunteer=1, instructor=1
```

### Session count
```sql
SELECT status, count(*) FROM public.sessions GROUP BY status;
-- Expected: active=1
```

### Case count
```sql
SELECT status, count(*) FROM public.cases GROUP BY status;
-- Expected: draft=1, published=2
```

### Review count
```sql
SELECT review_type, count(*) FROM public.reviews GROUP BY review_type;
-- Expected: implementation=3, prediction=2
```

### Student profile count
```sql
SELECT count(*) FROM public.student_profiles;
-- Expected: 6
```

### Full row counts
```sql
SELECT 'auth.users' AS tbl, count(*) AS rows FROM auth.users
UNION ALL SELECT 'public.users', count(*) FROM public.users
UNION ALL SELECT 'public.student_profiles', count(*) FROM public.student_profiles
UNION ALL SELECT 'public.organizations', count(*) FROM public.organizations
UNION ALL SELECT 'public.cases', count(*) FROM public.cases
UNION ALL SELECT 'public.case_lanes', count(*) FROM public.case_lanes
UNION ALL SELECT 'public.case_concept_weights', count(*) FROM public.case_concept_weights
UNION ALL SELECT 'public.prediction_gates', count(*) FROM public.prediction_gates
UNION ALL SELECT 'public.sessions', count(*) FROM public.sessions
UNION ALL SELECT 'public.session_participants', count(*) FROM public.session_participants
UNION ALL SELECT 'public.case_progress', count(*) FROM public.case_progress
UNION ALL SELECT 'public.predictions', count(*) FROM public.predictions
UNION ALL SELECT 'public.reviews', count(*) FROM public.reviews
UNION ALL SELECT 'public.intervention_flags', count(*) FROM public.intervention_flags
UNION ALL SELECT 'public.student_concept_mastery', count(*) FROM public.student_concept_mastery
UNION ALL SELECT 'public.concept_mastery_snapshots', count(*) FROM public.concept_mastery_snapshots
ORDER BY tbl;
```

**Expected counts**:

| Table | Min Expected Rows |
|---|---|
| auth.users | 8 |
| public.users | 8 |
| public.student_profiles | 6 |
| public.organizations | 1 |
| public.cases | 3 |
| public.case_lanes | 9 |
| public.case_concept_weights | 9 |
| public.prediction_gates | 3 |
| public.sessions | 1 |
| public.session_participants | 6 |
| public.case_progress | 6 |
| public.predictions | 2 |
| public.reviews | 5 |
| public.intervention_flags | 2 |
| public.student_concept_mastery | 5 |

### RLS policy audit
```sql
SELECT tablename, count(*) AS policy_count
FROM pg_policies WHERE schemaname = 'public'
GROUP BY tablename ORDER BY tablename;
-- Every table should have ≥1 policy
```

### Functional auth test (via PostgREST)
```bash
# Get a JWT token
TOKEN=$(curl -s -X POST \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  "https://oxiximaftgrpipqbrwej.supabase.co/auth/v1/token?grant_type=password" \
  -d '{"email":"instructor1@sparkagency.internal","password":"demo1234"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Query cases as instructor (should work)
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  "https://oxiximaftgrpipqbrwej.supabase.co/rest/v1/cases" | python3 -c "import sys,json; print(len(json.load(sys.stdin)),'cases')"
# Expected: 3 cases

# Query student profile as student1 (should work — only own profile)
TOKEN=$(curl -s -X POST -H "apikey: $KEY" -H "Content-Type: application/json" \
  "https://oxiximaftgrpipqbrwej.supabase.co/auth/v1/token?grant_type=password" \
  -d '{"email":"student1@sparkagency.internal","password":"demo1234"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  "https://oxiximaftgrpipqbrwej.supabase.co/rest/v1/student_profiles" | python3 -c "import sys,json; print(len(json.load(sys.stdin)),'profile(s)')"
# Expected: 1 profile (Maya R. — RLS filters to only her own)
```

---

## Rollback Plan

### If Execution 1 fails (schema creation)

**Symptoms**: Error during table/index/policy creation, partial schema.

**Recovery**:
```sql
-- Drop everything in public schema and start over
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, authenticated, anon, service_role;
```
Then re-run Execution 1.

**Alternative — targeted rollback**: Identify the failed statement from the error message. All statements use `IF NOT EXISTS` or `IF EXISTS` — fix the specific error and re-run Execution 1 (it's idempotent).

### If Execution 2 fails (auth users)

**Symptoms**: FK errors when inserting identities, users not appearing in public.users, `crypt()` function not found.

**Recovery**:
```sql
-- Remove partially created users
DELETE FROM auth.identities WHERE provider_id LIKE '00000000-0000-0000-0000-%';
DELETE FROM auth.users WHERE email LIKE '%@sparkagency.internal';
```
Then fix the issue and re-run Execution 2.

Common issues:
- `function crypt(text, text) does not exist` → `pgcrypto` extension not enabled: run `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
- `function gen_salt(text) does not exist` → same fix as above
- FK constraint on `auth.identities.user_id` → must insert `auth.users` rows BEFORE `auth.identities`

### If Execution 3 fails (seed data)

**Symptoms**: FK violation errors (`Key is not present in table "users"`).

**Recovery**:
```sql
-- Truncate all seed data (preserves schema, users, auth)
TRUNCATE TABLE public.student_concept_mastery CASCADE;
TRUNCATE TABLE public.intervention_flags CASCADE;
TRUNCATE TABLE public.reviews CASCADE;
TRUNCATE TABLE public.predictions CASCADE;
TRUNCATE TABLE public.case_progress CASCADE;
TRUNCATE TABLE public.session_participants CASCADE;
TRUNCATE TABLE public.sessions CASCADE;
TRUNCATE TABLE public.prediction_gates CASCADE;
TRUNCATE TABLE public.case_concept_weights CASCADE;
TRUNCATE TABLE public.case_lanes CASCADE;
TRUNCATE TABLE public.cases CASCADE;
TRUNCATE TABLE public.student_profiles CASCADE;
TRUNCATE TABLE public.memberships CASCADE;
TRUNCATE TABLE public.organizations CASCADE;
```
Then rerun Execution 1 (idempotent, restores RLS and grants), reapply seed.

Note: `public.users` is NOT truncated — those came from the auth trigger and should be preserved.

### Full Nuclear Rollback

If everything must be destroyed to start over:
```sql
-- Drop all custom types, tables, functions in public
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Re-enable schema access
GRANT ALL ON SCHEMA public TO postgres, authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Remove auth users
DELETE FROM auth.identities WHERE provider_id LIKE '00000000-0000-0000-0000-%';
DELETE FROM auth.users WHERE email LIKE '%@sparkagency.internal';

-- Remove triggers from auth schema
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();
```

Then start fresh from Execution 1.

---

## Execution Checklist

| Step | Action | Status |
|---|---|---|
| Pre-1 | Run pre-flight queries | ☐ |
| Pre-2 | Check Auth settings in Dashboard | ☐ |
| E1 | Run Execution 1 (lines 10-581) | ☐ |
| E1-V | Verify: 21 tables, 30 policies, org exists | ☐ |
| E2 | Uncomment and run Phase 10 auth users | ☐ |
| E2-V | Verify: 8 auth.users, 8 public.users, 6 student_profiles | ☐ |
| E2-V2 | Test login for student1 + instructor1 | ☐ |
| E3 | Run Execution 3 (Phase 11, lines 605-746) | ☐ |
| E3-V | Run full verification queries | ☐ |
| E3-V2 | Test PostgREST queries with JWT | ☐ |
| Final | Confirm `/copy` deliverable is ready | ☐ |

---

## Post-Deployment

After all 3 executions succeed, the application is ready. The frontend (`client.ts`) already points to `oxiximaftgrpipqbrwej.supabase.co` — all hooks and API calls will work immediately against the new schema.

### Quick Smoke Test (from project root)
```bash
npm run dev
```
Then:
1. Open http://localhost:5173
2. Login as `student1` / `demo1234`
3. Verify: StudentShell loads with live data (clearance level, session info, case list)
4. Login as `volunteer1` / `demo1234`
5. Verify: Review queue shows pending reviews
6. Login as `instructor1` / `demo1234`
7. Verify: Session builder loads, can view existing sessions
