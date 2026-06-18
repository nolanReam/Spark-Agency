# Spark Agency — Development Accounts

**Status**: ✅ All 8 accounts exist and authenticate successfully (2026-06-17)

## Spark Agency Project (`oxiximaftgrpipqbrwej`)

| Username | Email | Role | User ID | Exists? |
|---|---|---|---|---|
| `student1` | student1@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001001` | ✅ |
| `student2` | student2@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001002` | ✅ |
| `student3` | student3@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001003` | ✅ |
| `student4` | student4@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001004` | ✅ |
| `student5` | student5@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001005` | ✅ |
| `student6` | student6@sparkagency.internal | Student | `00000000-0000-0000-0000-000000001006` | ✅ |
| `volunteer1` | volunteer1@sparkagency.internal | Volunteer | `00000000-0000-0000-0000-000000002001` | ✅ |
| `instructor1` | instructor1@sparkagency.internal | Instructor | `00000000-0000-0000-0000-000000003001` | ✅ |

All passwords: **`demo1234`**

## Auth Repair (2026-06-17)

**Root cause**: GoTrue v2.190.0 (Go) cannot scan SQL NULL into Go `string` fields. Six columns must be non-null for login to succeed: `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`, `phone_change_token`, `phone_change`.

**Fix applied**: `AUTH_FIX_CONFIRMATION_TOKEN.sql` — sets all six to `''` for seeded accounts.

**Prevention**: `PHASE_10_AUTH_USERS.sql` now includes these six columns in every INSERT. The corrected INSERT template is:
```sql
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, phone_change_token, phone_change,
  raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
) VALUES (
  '...uuid...', '00000000-0000-0000-0000-000000000000',
  '...email...', crypt('demo1234', gen_salt('bf')), now(),
  '', '', '', '', '', '',
  '{"role":"...","provider":"email","providers":["email"]}',
  '{"display_name":"...","role":"...","username":"..."}',
  'authenticated', 'authenticated', now(), now()
);
```

## Reference (Codize — `tadkbymxkdncqahzshml`)

Previously accessible. Now returns `Invalid API key`. Project may have been deleted or key rotated (unverified as of 2026-06-17).
