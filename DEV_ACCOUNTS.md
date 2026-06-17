# Spark Agency — Development Accounts

**Status**: ⚠️ Accounts do NOT exist on the currently configured project. Must be created after schema migration.

## Spark Agency Project (`oxiximaftgrpipqbrwej`)

| Username | Email | Role | User ID | Exists? |
|---|---|---|---|---|
| `student1` | student1@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001001` | ❌ |
| `student2` | student2@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001002` | ❌ |
| `student3` | student3@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001003` | ❌ |
| `student4` | student4@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001004` | ❌ |
| `student5` | student5@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001005` | ❌ |
| `student6` | student6@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001006` | ❌ |
| `volunteer1` | volunteer1@sparkagency.internal | Volunteer | `00000000-0000-0000-0000-000000002001` | ❌ |
| `instructor1` | instructor1@sparkagency.internal | Instructor | `00000000-0000-0000-0000-000000003001` | ❌ |

All passwords: **`demo1234`**

## Reference (Codize — `tadkbymxkdncqahzshml`)

All 8 accounts exist and authenticate successfully on Codize. See REBASELINE_REPORT.md for details.

## Creating Accounts on Spark Agency

Run `SPARK_AGENCY_SCHEMA.sql` in the Supabase SQL Editor, then use the auth user INSERT block (Phase 10):

```sql
SELECT set_config('search_path', 'auth, public, extensions', false);

INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000001001',
  '00000000-0000-0000-0000-000000000000',
  'student1@sparkagency.internal',
  crypt('demo1234', gen_salt('bf')),
  now(),
  '{"role":"student","provider":"email","providers":["email"]}',
  '{"display_name":"Maya R.","role":"student","username":"student1"}',
  'authenticated',
  'authenticated',
  now(), now()
);

-- Repeat for each user, then insert auth.identities rows
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000001001',
  '00000000-0000-0000-0000-000000001001',
  'email',
  jsonb_build_object('sub', '00000000-0000-0000-0000-000000001001', 'email', 'student1@sparkagency.internal'),
  now(), now(), now()
);
```

## Supabase Projects

| Project | URL | Status |
|---|---|---|
| **Spark Agency** (current client.ts) | `https://oxiximaftgrpipqbrwej.supabase.co` | ❌ No schema, no users |
| **Codize** (reference) | `https://tadkbymxkdncqahzshml.supabase.co` | ✅ Complete schema + data |
