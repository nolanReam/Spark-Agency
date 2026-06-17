# Spark Agency — Environment Verification Report

**Generated**: 2026-06-16
**Purpose**: Re-baseline against the CURRENT Supabase project configured in `client.ts`

---

## CRITICAL FINDING

**The project configured in `client.ts` (`oxiximaftgrpipqbrwej`) has NO database schema.** Auth is running but zero migrations have been applied. There are no tables, no RLS policies, no users, and no data.

The only operational project is **Codize** (`tadkbymxkdncqahzshml`), which contains the complete Spark Agency schema with 10 migrations, 21 tables, 30 RLS policies, 8 users, and seed data.

---

## 1. Project Identity

| Field | Value |
|---|---|
| **URL in client.ts** | `https://oxiximaftgrpipqbrwej.supabase.co` |
| **Project Reference** | `oxiximaftgrpipqbrwej` |
| **Anon Key JWT `ref`** | `oxiximaftgrpipqbrwej` ✅ (matches URL) |
| **Auth Service** | Running (GoTrue v2.190.0) |
| **Database Schema** | ❌ **EMPTY** |
| **Project Name** | Unknown (MCP tools cannot access this project) |

### JWT Claims (decoded from anon key)
```json
{
  "iss": "supabase",
  "ref": "oxiximaftgrpipqbrwej",
  "role": "anon",
  "iat": 1781637985,
  "exp": 2097213985
}
```

---

## 2. Database Schema (`oxiximaftgrpipqbrwej`)

### Tables — NONE

All queries return `PGRST205: Could not find the table 'public.<name>' in the schema cache`:

| Table | Status |
|---|---|
| `public.cases` | ❌ Not found |
| `public.users` | ❌ Not found |
| `public.sessions` | ❌ Not found |
| `public.case_progress` | ❌ Not found |
| `public.reviews` | ❌ Not found |
| `public.intervention_flags` | ❌ Not found |
| `public.student_profiles` | ❌ Not found |
| (all other tables) | ❌ Not found |

### Migrations — NONE APPLIED

PostgREST function check returns `PGRST202` — no `get_schema_tables` or any other function exists.

### RLS Policies — NONE

---

## 3. Auth Users (`oxiximaftgrpipqbrwej`)

### Login Attempt

| Field | Value |
|---|---|
| Email | `student1@sparkagency.internal` |
| Password | `demo1234` |
| Result | `{"code":400, "error_code":"invalid_credentials", "msg":"Invalid login credentials"}` |

**Zero users exist in the Spark Agency project.** Signup was also rejected (`email_address_invalid` for `test@sparkagency.internal`).

---

## 4. Comparison: Codize Project (`tadkbymxkdncqahzshml`)

The Codize project IS the reference implementation. This is the ONLY project with the Spark Agency schema.

### Project Info

| Field | Value |
|---|---|
| **URL** | `https://tadkbymxkdncqahzshml.supabase.co` |
| **Name** | Codize |
| **Region** | us-west-2 |
| **Status** | ACTIVE_HEALTHY |
| **Postgres** | 17.6.1.127 |
| **Organization** | `jbspfxwdakwsefyqzgdk` (codize) |

### Migrations Applied (10 total)

| # | Version | Name |
|---|---|---|
| 1 | 20260616070929 | 001_schema_foundation |
| 2 | 20260616071423 | 002_seed_data |
| 3 | 20260616071448 | 003_seed_workflow |
| 4 | 20260616071734 | 004_rls_policies |
| 5 | 20260616093508 | 005_auth_unification |
| 6 | 20260616194833 | 006_auth_identities |
| 7 | 20260616195104 | 007_fix_trigger_search_path |
| 8 | 20260616195258 | 008_fix_user_instance_and_nulls |
| 9 | 20260616202853 | 009_hardened_rls_policies |
| 10 | 20260616211641 | 010_fix_table_grants |

### Tables & Row Counts (21 tables)

| Table | Rows | RLS |
|---|---|---|
| `auth.users` | 8 | ✅ |
| `public.users` | 8 | ✅ |
| `public.student_profiles` | 6 | ✅ |
| `public.organizations` | 1 | ✅ |
| `public.memberships` | 8 | ✅ |
| `public.cases` | 4 | ✅ |
| `public.case_lanes` | 9 | ✅ |
| `public.case_concept_weights` | 9 | ✅ |
| `public.prediction_gates` | 3 | ✅ |
| `public.sessions` | 5 | ✅ |
| `public.session_participants` | 7 | ✅ |
| `public.case_progress` | 7 | ✅ |
| `public.predictions` | 3 | ✅ |
| `public.reviews` | 5 | ✅ |
| `public.intervention_flags` | 7 | ✅ |
| `public.reflections` | 0 | ✅ |
| `public.lane_attempts` | 0 | ✅ |
| `public.concept_mastery_snapshots` | 9 | ✅ |
| `public.student_concept_mastery` | 5 | ✅ |
| `public.session_summaries` | 0 | ✅ |
| `public.review_attachments` | 0 | ✅ |

### RLS Policies (30 total)

All 30 policies are permissive, applied to `{public}` role:

| Table | Policies | Key Rules |
|---|---|---|
| `users` | 3 | INSERT/UPDATE own, SELECT own or volunteer/instructor |
| `student_profiles` | 3 | INSERT/UPDATE own, SELECT own or volunteer/instructor |
| `cases` | 3 | SELECT authenticated, INSERT/UPDATE instructor only |
| `case_lanes` | 1 | SELECT authenticated |
| `case_concept_weights` | 1 | SELECT authenticated |
| `case_progress` | 3 | SELECT own or volunteer/instructor, INSERT/UPDATE own |
| `sessions` | 3 | SELECT authenticated, INSERT/UPDATE instructor only |
| `session_participants` | 2 | SELECT authenticated, INSERT own student_id |
| `predictions` | 2 | SELECT own or volunteer/instructor, INSERT own |
| `reviews` | 3 | SELECT authenticated, INSERT authenticated, UPDATE volunteer/instructor |
| `intervention_flags` | 3 | SELECT own or volunteer/instructor, INSERT own, UPDATE volunteer/instructor |
| `reflections` | 2 | SELECT own or volunteer/instructor, INSERT own |
| `lane_attempts` | 2 | SELECT own or volunteer/instructor, INSERT own |
| `review_attachments` | 2 | SELECT authenticated, INSERT own |
| `organizations` | 1 | SELECT authenticated |
| `memberships` | 1 | SELECT authenticated |
| `prediction_gates` | 1 | SELECT authenticated |
| `concept_mastery_snapshots` | 2 | SELECT own or volunteer/instructor, INSERT instructor |
| `student_concept_mastery` | 1 | SELECT own or volunteer/instructor |
| `session_summaries` | 1 | SELECT authenticated |

### Helper Functions (5)

| Function | Type | Purpose |
|---|---|---|
| `is_instructor()` | FUNCTION (boolean) | Checks `raw_app_meta_data->>'role' = 'instructor'` |
| `is_volunteer_or_instructor()` | FUNCTION (boolean) | Checks role is 'volunteer' or 'instructor' |
| `handle_new_auth_user()` | TRIGGER FUNCTION | Auto-creates `public.users` row on auth signup |
| `update_updated_at_column()` | TRIGGER FUNCTION | Auto-sets `updated_at` on row modification |
| `rls_auto_enable()` | EVENT TRIGGER | Auto-enables RLS on new tables |

### Triggers (3)

| Table | Trigger | Event | Timing |
|---|---|---|---|
| `cases` | `set_cases_updated_at` | UPDATE | BEFORE |
| `case_progress` | `set_case_progress_updated_at` | UPDATE | BEFORE |
| `users` | `set_users_updated_at` | UPDATE | BEFORE |

### Auth Users (8)

| # | Email | Role (meta) | Display Name | User ID |
|---|---|---|---|---|
| 1 | `student1@sparkagency.internal` | student | Maya R. | `00000000-...001001` |
| 2 | `student2@sparkagency.internal` | student | Devon T. | `00000000-...001002` |
| 3 | `student3@sparkagency.internal` | student | Priya S. | `00000000-...001003` |
| 4 | `student4@sparkagency.internal` | student | Jordan K. | `00000000-...001004` |
| 5 | `student5@sparkagency.internal` | student | Sam W. | `00000000-...001005` |
| 6 | `student6@sparkagency.internal` | student | Ava L. | `00000000-...001006` |
| 7 | `volunteer1@sparkagency.internal` | volunteer | J. Park | `00000000-...002001` |
| 8 | `instructor1@sparkagency.internal` | instructor | Ms. Chen | `00000000-...003001` |

All users have password `demo1234`, emails confirmed, identities set up.

---

## 5. Decision Required

The `client.ts` project (Spark Agency / `oxiximaftgrpipqbrwej`) is a blank slate. The Codize project (`tadkbymxkdncqahzshml`) has the complete Spark Agency application.

**Option A**: Migrate `oxiximaftgrpipqbrwej` from scratch using the migration SQL extracted from Codize. This requires applying the SQL via the Supabase dashboard (MCP tools cannot access this project).

**Option B**: Revert `client.ts` to the Codize project URL (`tadkbymxkdncqahzshml`), which is fully operational and has all data.

**Option C**: Provide MCP access to `oxiximaftgrpipqbrwej` so the migrations can be applied programmatically.

---

## 6. Next Steps

If Option A is chosen, the full migration SQL must be extracted from Codize and applied to `oxiximaftgrpipqbrwej` via the Supabase SQL Editor. This would include:
1. All 10 migrations (schema, seed data, auth, RLS, grants)
2. Production-identical schema and seed data
3. All 8 development accounts

All phases beyond Phase 1 (Authentication Revalidation, Data Audit, Sprint 1.5 Assessment, Workshop Validation) are **BLOCKED** until a database with schema exists.
