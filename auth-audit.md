# Auth Audit & Repair Plan

## 1. Why the Current Login Flow Fails

### Root Cause

The app has **two completely separate authentication systems** that don't talk to each other:

| System | Location | Storage | Status |
|--------|----------|---------|--------|
| **Supabase Auth** (`auth.users`) | `useAuth.ts` → `supabase.auth.signInWithPassword()` | Supabase-managed schema | **Empty** — 0 users |
| **Custom table auth** (`public.users`) | `client.ts` → `supabase.from("users")` | Our schema (seed migration) | **Seeded** — 8 users |

When a user clicks "Sign in with Google" on the login screen:

1. `App.tsx` calls `useAuth().signIn()` with **no arguments** (the button has no form fields)
2. `useAuth.ts:38` calls `supabase.auth.signInWithPassword({ email: 'undefined@sparkagency.internal', password: undefined })`
3. Supabase queries `auth.users` — finds nothing
4. Returns **HTTP 400** (`grant_type=password` — no matching user)

The seed users (Maya R., Devon T., etc.) exist only in `public.users` with placeholder `$demo$` password hashes. Supabase Auth (`auth.users`) has no knowledge of them.

### Additional Bugs Discovered

| # | Bug | File:Line |
|---|-----|-----------|
| 1 | **`LoginScreen` "Sign in with Google" button calls `signInWithPassword`, not Google OAuth.** No `signInWithOAuth({ provider: 'google' })` anywhere. The button label is a lie. | `App.tsx:34` |
| 2 | **`signIn()` is called with no arguments.** LoginScreen has no email/password inputs. The button's `onClick` calls `onSignIn()` with no args, but `signIn` expects `(username, password)`. | `App.tsx:50` → `useAuth.ts:37-43` |
| 3 | **Dead `signIn` in `client.ts` silently ignores passwords.** `_password` prefix suppresses the TS lint warning. Returns user data regardless of credentials — a trivial auth bypass if ever wired up. | `client.ts:71-80` |
| 4 | **`signOut` is never exposed in the UI.** No logout button exists in any shell, sidebar, or top bar. | `useAuth.ts:45-49` |
| 5 | **Role is client-side state, not server-enforced.** `localStorage.setItem("spark-agency-prototype-role", r)` in the sidebar allows any user to switch to any role. No JWT claim verification. | `useAuth.ts:32-35` |
| 6 | **RLS policies are all `USING (true)`.** Migration 004 allows anonymous read/write to all tables. Auth-based RLS (`auth.uid()`) would fail anyway since `auth.users` is empty. | migration `004_rls_policies` |
| 7 | **Name collision: `DbSession` (workshop) vs `Session` (auth).** `client.ts:38-43` defines `DbSession` for workshop sessions, while `useAuth.ts` imports `Session` from `@supabase/supabase-js` for auth sessions. Both exist in the same codebase. | `client.ts:38`, `useAuth.ts:5` |

---

## 2. Auth Architecture Recommendation: **Supabase Auth with Custom User Metadata**

### Rationale

The spec (`merged.md §1`) requires:

> Username + password authentication. No email required. JWT issuance with httpOnly cookies. Role extraction from JWT claims. Bulk account creation for instructor-managed rosters.

Supabase Auth is the correct choice because:

- **Session management is free** — token refresh, httpOnly cookies, `onAuthStateChange`, all handled by the Supabase JS client. We don't need to build it.
- **RLS works with `auth.uid()`** — Row-level security policies can reference the authenticated user ID, making security declarative rather than imperative.
- **Role in JWT `app_metadata`** — Custom claims can be injected via a database trigger on `auth.users`, consumed by both frontend (React state) and backend (RLS policies).
- **Bulk account creation via Admin API** — `supabase.auth.admin.createUser()` creates users programmatically without email confirmation.

### How It Works

```
                    ┌──────────────────────────────┐
                    │      LoginScreen             │
                    │  Username: ________          │
                    │  Password: ________          │
                    │  [Sign In]                   │
                    └──────────┬───────────────────┘
                               │ signIn(username, password)
                               ▼
                    ┌──────────────────────────────┐
                    │  useAuth.ts                  │
                    │  supabase.auth.signInWithPassword({
                    │    email: user@spark.internal,│
                    │    password: raw              │
                    │  })                          │
                    └──────────┬───────────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  Supabase Auth (auth.users)    │
                    │  - Validates password         │
                    │  - Issues JWT (access_token)  │
                    │  - Sets httpOnly cookie       │
                    │  - JWT contains:              │
                    │    { sub: uuid,               │
                    │      app_metadata: {          │
                    │        role: "student",       │
                    │        username: "student1"   │
                    │      }                       │
                    │    }                         │
                    └──────────┬───────────────────┘
                               │ session.user
                               ▼
                    ┌──────────────────────────────┐
                    │  useAuth() returns:           │
                    │  role = session.user          │
                    │    .app_metadata.role         │
                    │                              │
                    │  ← extracted from JWT,        │
                    │    NOT from localStorage      │
                    └──────────────────────────────┘
```

---

## 3. Required Database Changes

### 3.1 Drop the custom `password_hash` column from `public.users`

`public.users` becomes a **profile table** — it mirrors `auth.users` 1:1 via `id` but stores only app-level data. Auth credentials live exclusively in `auth.users`.

```sql
-- Remove password from public.users (Supabase Auth owns credentials)
ALTER TABLE public.users DROP COLUMN password_hash;
```

### 3.2 Add `username` to `auth.users` metadata trigger

When a user is created in `auth.users`, sync the `username` and `role` into `app_metadata` so the JWT carries them:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Copy username from raw_user_meta_data into app_metadata
  -- app_metadata is included in the JWT, accessible via auth.jwt()
  UPDATE auth.users
  SET raw_app_meta_data = jsonb_build_object(
    'role', COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    'username', COALESCE(NEW.raw_user_meta_data->>'username', NEW.email)
  )
  WHERE id = NEW.id;

  -- Also insert into public.users profile
  INSERT INTO public.users (id, username, role, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', NEW.email),
    (COALESCE(NEW.raw_user_meta_data->>'role', 'student'))::user_role,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  -- If role is student, create student_profiles row
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'student') = 'student' THEN
    INSERT INTO public.student_profiles (user_id, grade, age, clearance_level)
    VALUES (NEW.id, 4, 9, 1)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
```

### 3.3 Replace permissive RLS with auth-based policies

```sql
-- Users table: authenticated users can read profiles, only self can update
DROP POLICY IF EXISTS "anon_read_users" ON public.users;
CREATE POLICY "users_read_all" ON public.users FOR SELECT
  USING (auth.role() = 'authenticated');

-- Student profiles: students read own, volunteers/instructors read all
CREATE POLICY "profiles_read_own" ON public.student_profiles FOR SELECT
  USING (auth.uid() = user_id OR auth.jwt()->>'role' IN ('volunteer', 'instructor'));

-- Cases: instructors write, everyone reads
CREATE POLICY "cases_read_authenticated" ON public.cases FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "cases_write_instructor" ON public.cases FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'instructor');
CREATE POLICY "cases_update_instructor" ON public.cases FOR UPDATE
  USING (auth.jwt()->>'role' = 'instructor');

-- Reviews: volunteers/instructors can claim and resolve
CREATE POLICY "reviews_read_staff" ON public.reviews FOR SELECT
  USING (auth.jwt()->>'role' IN ('volunteer', 'instructor'));
CREATE POLICY "reviews_update_staff" ON public.reviews FOR UPDATE
  USING (auth.jwt()->>'role' IN ('volunteer', 'instructor'));

-- Case progress: students read own, staff read all for queue
CREATE POLICY "progress_read_own_or_staff" ON public.case_progress FOR SELECT
  USING (auth.uid() = student_id OR auth.jwt()->>'role' IN ('volunteer', 'instructor'));
CREATE POLICY "progress_update_student" ON public.case_progress FOR UPDATE
  USING (auth.uid() = student_id);
```

### 3.4 Migrate existing seed users to `auth.users`

Use the Supabase Admin API (`supabase.auth.admin.createUser()`) to create matching `auth.users` entries for all 8 seed users in `public.users`. This is a one-time script, not a migration.

---

## 4. Required UI Changes

### 4.1 LoginScreen — add username + password inputs

Replace the fake "Sign in with Google" button with actual form fields:

```
┌──────────────────────────────────┐
│          ✨ Spark Agency          │
│                                  │
│  Username:  [_______________]    │
│  Password:  [_______________]    │
│                                  │
│  [ Sign In ]                     │
│                                  │
│  Don't have an account?          │
│  Ask your instructor for a code. │
└──────────────────────────────────┘
```

### 4.2 Add sign-out button

Add a logout button somewhere accessible — either in the sidebar bottom section or the TopBar. The `signOut` function already exists in `useAuth.ts`, it's just never called from UI.

### 4.3 Remove prototype role switcher

Remove (or gate behind dev mode) the Student/Volunteer/Instructor toggle buttons in `Sidebar.tsx`. Role should come from the JWT, not localStorage.

### 4.4 Handle auth errors

Add error state display to LoginScreen (incorrect password, user not found, etc.).

---

## 5. Required API Changes

### 5.1 Delete legacy `signIn` from `client.ts`

Remove `client.ts:71-80`. Dead code with a security smell.

### 5.2 `useAuth.ts` — rewrite to use JWT claims

```ts
// BEFORE (broken)
const signIn = useCallback(async (username: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${username}@sparkagency.internal`,
    password,
  });
  return { data, error };
}, []);

// AFTER (fixed)
const signIn = useCallback(async (username: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${username}@sparkagency.internal`,
    password,
  });
  return { data, error };
}, []);

// Role extraction changes:
// BEFORE:
const role = (localStorage.getItem(PROTOTYPE_ROLE_KEY) as UserRole) || "student";

// AFTER:
const role = (session?.user?.app_metadata?.role as UserRole) || "student";
```

### 5.3 Add Admin API helper for bulk user creation

```ts
// New file: src/api/admin.ts (imports service_role key, NOT anon key)
import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only
);

export async function createStudentAccount(username: string, password: string, displayName: string) {
  return adminClient.auth.admin.createUser({
    email: `${username}@sparkagency.internal`,
    password,
    email_confirm: true, // skip email verification
    user_metadata: { username, display_name: displayName, role: "student" },
  });
}
```

---

## 6. Migration Plan (ordered by dependency)

### Phase A — Database (zero-downtime, backwards-compatible)

| Step | Action | Migration |
|------|--------|-----------|
| A1 | Add trigger `on_auth_user_created` to sync `auth.users` → `public.users` | 005 |
| A2 | Drop `public.users.password_hash` column | 005 |
| A3 | Create seed users in `auth.users` via Admin API | Script |
| A4 | Replace RLS policies with role-based ones | 006 |

### Phase B — Frontend (after Phase A is deployed)

| Step | Action | Files |
|------|--------|-------|
| B1 | Add username + password inputs to LoginScreen | `App.tsx` |
| B2 | Extract role from JWT `app_metadata`, remove localStorage | `useAuth.ts` |
| B3 | Remove prototype role switcher from sidebar | `Sidebar.tsx` |
| B4 | Add sign-out button | `Sidebar.tsx` or `TopBar.tsx` |
| B5 | Delete legacy `signIn` from `client.ts` | `client.ts` |
| B6 | Add auth error handling to LoginScreen | `App.tsx` |

### Phase C — Optional enhancements

| Step | Action |
|------|--------|
| C1 | Bulk student account creation UI in Instructor Roster |
| C2 | Password reset flow via Supabase Auth |
| C3 | Session expiry and refresh UX |

---

## 7. Summary

**The login fails because `auth.users` is empty.** The frontend calls Supabase Auth (`signInWithPassword`) but no users have been created in the Supabase-managed `auth.users` table. All 8 seed users exist only in `public.users`, which Supabase Auth doesn't query.

The fix is to populate `auth.users` with real credentials, sync them to `public.users` via a database trigger, extract the role from the JWT's `app_metadata`, and enforce RLS using `auth.uid()`. This eliminates the dual-auth-system mess, the dead-code security hole, and the client-side role switching — all in one coherent architecture.
