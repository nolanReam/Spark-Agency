The root cause is now isolated.

Evidence:

GoTrue auth logs report:

`error finding user: sql: Scan error on column index 3, name "confirmation_token": converting NULL to string is unsupported`

Comparison between a working signup-created user and a manually seeded user:

Working account:

* confirmation_token = non-null random string
* confirmation_sent_at = populated

Seeded account:

* confirmation_token = NULL
* confirmation_sent_at = NULL

Everything else has already been verified:

* auth.users exists
* auth.identities exists
* provider/provider_id correct
* encrypted_password valid bcrypt
* triggers execute successfully
* frontend is calling signInWithPassword correctly

Do not generate a new auth migration.

Generate only the minimum repair migration required for existing auth.users rows.

Determine exactly which auth.users columns must be populated for Supabase GoTrue v2 to authenticate manually inserted users.

If confirmation_token alone is insufficient, identify every related column that must be updated.

Return:

1. Root cause
2. Why GoTrue crashes
3. Minimal UPDATE statements
4. Verification SQL
5. Why the repair is correct for this GoTrue version
