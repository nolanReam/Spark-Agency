-- ============================================================
-- ROOT CAUSE: GoTrue v2 scans confirmation_token as a Go
-- `string` type. NULL cannot convert to Go string — this
-- panics the sql.Scan and GoTrue returns HTTP 500.
--
-- The error message from GoTrue auth logs confirms it:
-- "sql: Scan error on column index 3, name 'confirmation_token':
--  converting NULL to string is unsupported"
--
-- Our manually inserted users have confirmation_token = NULL.
-- GoTrue signup-created users have a random hex token string.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- PART 1: Root Cause Explanation
-- ════════════════════════════════════════════════════════════

/*
Supabase GoTrue v2.190.0 is written in Go. Its User model scans
database rows into Go struct fields. The struct field for
confirmation_token is:

    ConfirmationToken string `json:"confirmation_token"`

Go's `string` type CANNOT hold NULL. When GoTrue does:

    row.Scan(&user.ConfirmationToken, ...)

and the column value is SQL NULL, the database/sql package
returns: "converting NULL to string is unsupported"

This error propagates up to the `POST /token?grant_type=password`
endpoint, which returns HTTP 500 "Database error finding user."

Why signup-created users work:
    GoTrue's own signup handler generates a random confirmation
    token string and INSERTs it — never NULL.

Why our seeded users fail:
    Our Phase 10 INSERT set only the minimum columns.
    confirmation_token was not included → defaulted to NULL.
    GoTrue then fails to scan it.

Why this fails even when email_confirmed_at IS set:
    GoTrue scans ALL columns when selecting a user row.
    It doesn't skip the scan of confirmation_token just because
    the email is already confirmed. The scan crashes before
    GoTrue even checks email_confirmed_at.

Additionally, there are OTHER string columns in GoTrue's model
that will cause the same crash on the NEXT login attempt if
we only fix confirmation_token. These are the GoTrue User
model's non-nullable string fields:

    ConfirmationToken       string   ← CURRENT CRASH
    RecoveryToken           string   ← WILL CRASH NEXT
    EmailChangeTokenNew     string   ← WILL CRASH NEXT
    EmailChangeTokenCurrent string   ← varies by GoTrue version
    EmailChange             string   ← WILL CRASH NEXT
    PhoneChangeToken        string   ← WILL CRASH NEXT
    PhoneChange             string   ← WILL CRASH NEXT
    ReauthenticationToken   string   ← varies by GoTrue version

All time fields (confirmed_at, recovery_sent_at, etc.) use Go
*time.Time or sql.NullTime — they handle NULL natively.
*/


-- ════════════════════════════════════════════════════════════
-- PART 2: Minimal Repair
-- ════════════════════════════════════════════════════════════

SELECT set_config('search_path', 'auth', false);

-- Set ALL potentially-NULL string columns to empty string
-- This matches what GoTrue v2 expects when it scans the row.
-- Empty strings are safe because:
--   - email_confirmed_at is already set → confirmation_token unused
--   - No recovery was requested → recovery_token unused
--   - No email/phone changes → change tokens unused

UPDATE auth.users
SET
  confirmation_token    = COALESCE(confirmation_token, ''),
  recovery_token        = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change          = COALESCE(email_change, ''),
  phone_change_token    = COALESCE(phone_change_token, ''),
  phone_change          = COALESCE(phone_change, '')
WHERE email LIKE '%@sparkagency.internal';

-- Verify row count: should be 8
SELECT COUNT(*) AS rows_updated FROM auth.users WHERE email LIKE '%@sparkagency.internal';


-- ════════════════════════════════════════════════════════════
-- PART 3: Verification
-- ════════════════════════════════════════════════════════════

-- Verify no NULLs remain in the critical string columns
SELECT 'VERIFICATION: String columns must not be NULL' AS check_name;

SELECT
  email,
  confirmation_token IS NOT NULL AS conf_tok_ok,
  recovery_token IS NOT NULL AS recov_tok_ok,
  email_change_token_new IS NOT NULL AS emchg_tok_ok,
  email_change IS NOT NULL AS emchg_ok,
  phone_change_token IS NOT NULL AS phchg_tok_ok,
  phone_change IS NOT NULL AS phchg_ok
FROM auth.users
WHERE email LIKE '%@sparkagency.internal';

-- Expected: all 8 rows, all 6 boolean columns TRUE

-- Then test login:
-- curl -X POST https://oxiximaftgrpipqbrwej.supabase.co/auth/v1/token?grant_type=password
--   -d '{"email":"student1@sparkagency.internal","password":"demo1234"}'
-- Expected: HTTP 200 with access_token + refresh_token


-- ════════════════════════════════════════════════════════════
-- Why This Is Correct for GoTrue v2.190.0
-- ════════════════════════════════════════════════════════════

/*
1. confirmation_token: string
   Scanned on every user lookup. Must be non-null Go string.
   Setting to '' is safe — email is already confirmed, so
   GoTrue will never compare against an empty token.

2. recovery_token: string
   Scanned on every user lookup. Must be non-null Go string.
   Setting to '' is safe — no recovery flow active.

3. email_change_token_new: string
   Scanned on every user lookup. Must be non-null Go string.
   Setting to '' is safe — no email change in progress.

4. email_change: string
   Set when user requests email change. Must be non-null Go string.
   Setting to '' is safe — no email change pending.

5. phone_change_token: string
   Same pattern. Setting to '' is safe.

6. phone_change: string
   Same pattern. Setting to '' is safe.

COALESCE(name, '') is used rather than hardcoding '' so that:
- Existing non-null values (if any) are preserved
- Only NULL columns are patched
- The UPDATE is idempotent — safe to re-run
*/
