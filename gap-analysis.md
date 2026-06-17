# Spark Agency — Gap Analysis & Implementation Roadmap

**Source of truth:** `merged.md` (comprising specs 01 through 07)
**Analyzed artifact:** `SparkCodeApp.jsx` (1,577-line single-file React prototype)
**Date:** June 15, 2026

---

## PHASE 1 — IMPLEMENTATION AUDIT

### Summary

The prototype is a well-structured **UI mockup** that faithfully implements the visual design, navigation hierarchy, workflow stages, and component tree from v3/v4/v4.5 specs. It is **not an operational application**: it has no backend, no real data persistence, no authentication, and no API layer. Every workflow is simulated via local React state. This is appropriate as a design prototype but cannot support a real workshop.

Below, findings are organized by severity, then by the 10 focus areas from instructions.md. Each finding references the relevant spec sections and prototype locations.

---

### CRITICAL — Prevents Workshop Deployment

These are gaps that would block even a single real workshop session.

---

#### C-1: Product name is "SparkCode" everywhere instead of "Spark Agency"

- **Screen:** All screens (sidebar brand component)
- **Component:** `Brand()` at SparkCodeApp.jsx:300-306
- **Workflow:** N/A
- **Reason it matters:** Instructions.md explicitly states "Spark Agency is the canonical name." The Brand component renders "SparkCode," contradicting the product identity. Every student, volunteer, and instructor sees this.
- **Recommended fix:** Change the Brand component text from "SparkCode" to "Spark Agency" and update all references throughout the codebase.

---

#### C-2: No backend / API layer exists

- **Screen:** All screens
- **Component:** Entire application
- **Workflow:** Every workflow (Predict→Prove→Execute, review queue, session lifecycle, mastery calculation)
- **Reason it matters:** The architecture specifies a full REST API (`POST /auth/login`, `GET /dashboard/student`, `POST /cases/:id/predictions`, `POST /submissions/:id/execute`, etc.) with JWT auth in httpOnly cookies. The prototype is 100% client-side mock data. Without a backend: no student data persists, no session codes work across devices, no review queue is shared between volunteers, no predictions are stored, no mastery is calculated. **This is the single largest gap.**
- **Recommended fix:** Implement the backend per merged.md §5 API Architecture. Minimum viable: PostgreSQL schema (merged.md §2 + §4.5 §7 + §6 §6), REST endpoints, JWT auth. Start with the submission/review endpoints since they power the core loop.

---

#### C-3: No authentication or authorization whatsoever

- **Screen:** All screens
- **Component:** `SparkCodeApp` root, `RoleSwitcher`
- **Workflow:** Login, role-based access control
- **Reason it matters:** The prototype uses a demo `RoleSwitcher` component that freely switches between student/volunteer/instructor. Spec calls for JWT auth with role embedded in claims, route guards on both API and frontend. Students authenticate with username+password (no email), appropriate for minors. Without auth: no user identity, no data isolation, no permission enforcement.
- **Recommended fix:** Implement login screen (`/login`), JWT auth flow, and role-based route guards. Remove or guard the RoleSwitcher (spec says it's "prototype only").

---

#### C-4: No student session join flow

- **Screen:** Missing `/student/session/join` or equivalent
- **Component:** N/A (does not exist)
- **Workflow:** Session join — student enters session code to unlock cases and queues
- **Reason it matters:** Spec v4 §5 defines full session lifecycle where students enter a code (e.g. "AGENCY-271") to join a workshop. The prototype has `SESSION_ACTIVE` hardcoded and displayed in the student sidebar, but no screen or component exists for a student to type a session code and join. Sessions are the mechanism that gates case access during workshops.
- **Recommended fix:** Create a `/student/session/join` screen with a code input field. On valid code: add student to `session_participants`, restrict available cases to session cases, activate workflow.

---

#### C-5: Review queue has no persistence or shared state

- **Screen:** Volunteer Queue, Help Requests, Claimed
- **Component:** `VolunteerShell`, `QueueCard`, `ClaimedCard`
- **Workflow:** Volunteer Review Queue (Implementation + Prediction + Help)
- **Reason it matters:** Queue items are hardcoded `REVIEW_QUEUE_SEED` array. Claiming moves items between local `useState` arrays only — no other volunteer sees the claim. The single-claim guarantee (`claimed_by` + `claimed_at` columns, first-write-wins) specified in v4 §4 cannot work without a backend. In a real workshop, duplicate claims would cause chaos.
- **Recommended fix:** Back the review queue with the `reviews` table. Implement claim as a transactional update (`UPDATE reviews SET claimed_by = $1, claimed_at = now() WHERE id = $2 AND claimed_by IS NULL`). Poll queue every 15-30s per spec recommendation.

---

#### C-6: Case state machine has no enforcement

- **Screen:** Case Workflow (student)
- **Component:** `StageActionPanel`, `CaseWorkflow`
- **Workflow:** 11-stage progression (Building → Impl Review Requested → Impl Review Claimed → Impl Approved → Prediction Submitted → Prediction Review Requested → Prediction Review Claimed → Prediction Approved → Testing → Reflection → Complete)
- **Reason it matters:** Stage transitions are free-form `setStage()` calls. Any student can jump to any stage by clicking demo buttons. The spec defines strict transition rules (e.g., only a volunteer can approve, only the claiming volunteer can resolve, rejection returns to specific prior stages). Without enforcement, the Predict→Prove→Execute loop is meaningless.
- **Recommended fix:** Move stage transitions to the backend API. Each transition endpoint validates: (a) the actor's role/permission, (b) the current stage allows this transition, (c) the actor owns the claim (for approve/reject). Return 403 on illegal transitions.

---

#### C-7: No backend prediction immutability enforcement

- **Screen:** Prediction form in Case Workflow
- **Component:** `StageActionPanel` (prediction_submitted case)
- **Workflow:** Predict → Prove stage
- **Reason it matters:** Spec v2 §2 and v4 §3 state: "prediction text becomes read-only/locked immediately" and "no PATCH route once status != 'predicted'." UI disables editing after submission ✅ but there is no backend lock. A student could refresh the page and re-submit, or a malicious client could bypass the UI entirely.
- **Recommended fix:** Enforce at API layer: the `POST /cases/:id/predictions` endpoint creates a `predictions` row and marks the case_progress state. The API rejects any subsequent prediction mutations for the same case_progress if a prediction already exists with status='pending'/'approved'.

---

#### C-8: No student identity or data isolation

- **Screen:** All student screens
- **Component:** `StudentShell`, `StudentHome`, `StudentCases`, `StudentProgress`, `CaseWorkflow`
- **Workflow:** All student workflows
- **Reason it matters:** Every student screen shows hardcoded data for "Maya R." The `STUDENT`, `STUDENT_MASTERY`, `STUDENT_STATS`, `ACTIVE_CASE`, `AVAILABLE_CASES`, `COMPLETED_CASES` constants are global singletons. In a real workshop, 20+ students each need their own case progress, predictions, mastery, and feedback — completely isolated.
- **Recommended fix:** Wire all student data through API calls keyed to the authenticated user. Replace hardcoded constants with TanStack Query hooks (`useStudentDashboard`, `useStudentCases`, etc.) per the architecture spec §4.

---

#### C-9: No real session lifecycle enforcement

- **Screen:** Instructor Sessions, Session Monitor
- **Component:** `SessionList`, `SessionBuilder`, `SessionMonitor`
- **Workflow:** Session lifecycle (draft → open → active → closing → closed)
- **Reason it matters:** The spec v4 §5 defines five session states with specific permissions per state (e.g., students can only submit reviews when session is `active`; new review requests are blocked during `closing`). The prototype shows these states as UI but doesn't enforce them. Creating a session, opening it, activating it, closing it — all are no-op buttons or local state changes.
- **Recommended fix:** Back sessions with the `sessions` table and `session_status` enum. Each state transition is an API call validated server-side. The close flow must generate a `session_summaries` row.

---

#### C-10: Raise hand / help request system is non-functional

- **Screen:** Student Home (sidebar), Case Workflow (missing)
- **Component:** `RaiseHandButton` (sidebar only), missing from CaseWorkflow
- **Workflow:** Student raises hand → intervention_flag created → visible to volunteers → volunteer claims → marks helped
- **Reason it matters:** The raise hand button toggles `handRaised` local state — it doesn't create an `intervention_flags` row, doesn't appear in any volunteer queue, and can't be resolved. Multiple students raising hands simultaneously would overwrite each other's state. Spec v4.5 §6 explicitly adds `student_raise_hand` to `flag_reason` enum for this workflow.
- **Recommended fix:** Create `intervention_flags` rows on raise hand. Display in volunteer Help Requests queue (already separated in UI ✅). Implement Claim → Mark Helped cycle. Add RaiseHandButton to CaseWorkflow screen per spec.

---

### IMPORTANT — Incomplete Operational Systems

These gaps don't block a single-user demo but prevent real multi-user workshop operation.

---

#### I-1: Case Builder "New Case" shows "Edit Case" title (logic bug)

- **Screen:** Instructor Case Builder
- **Component:** `CaseBuilderForm` at SparkCodeApp.jsx:1084-1085
- **Workflow:** Case authoring
- **Reason it matters:** `EMPTY_CASE` is a non-null object, so `!!existing` evaluates to `true`, making `isEdit = true`. Every new case shows "Edit Case — undefined — undefined" instead of "New Case." This is a straightforward logic error that confuses instructors during case creation.
- **Recommended fix:** Pass `null` for new cases instead of `EMPTY_CASE`. Check `isEdit = existing !== null`. Alternatively, add an explicit `isNew` prop or use a sentinel value.

---

#### I-2: Case Builder action buttons have no handlers (Save/Publish/Archive/Duplicate)

- **Screen:** Instructor Case Builder, Case List
- **Component:** `CaseBuilderForm` (Save as Draft, Publish Case — lines 1195-1196), `CaseList` (Publish, Archive, Duplicate — lines 1071-1073)
- **Workflow:** Case authoring lifecycle (draft → published → archived)
- **Reason it matters:** The Case Builder form is fully specified with all fields (metadata, brief, lanes, tools, init rules, concept weights, prompts) ✅, but none of the action buttons actually persist anything. An instructor can fill out the entire form and click "Publish" — nothing happens. This is the primary instructor workflow for curriculum management.
- **Recommended fix:** Wire Save/Publish/Archive to API calls (`POST/PUT /instructor/cases`). Implement the `case_status` transitions: draft → published (sets `published_at`), published → archived (sets `archived_at`). Duplicate copies all fields to a new draft.

---

#### I-3: Missing Student Snapshot panel (inline drawer)

- **Screen:** Volunteer Queue, Claimed Reviews
- **Component:** `StudentSnapshotPanel` (spec v3 §4.4) — does not exist
- **Workflow:** Volunteer clicks a queue item → sees student details before claiming
- **Reason it matters:** Spec v3 §4.4 and v4 §3 specify that clicking any queue item opens an inline Student Snapshot panel showing: student name, case, current stage, prediction/reasoning text (for prediction reviews), initialization rules checklist (for implementation reviews). Currently, volunteers see a card with student name and case title but no detailed context to decide whether to claim.
- **Recommended fix:** Implement `StudentSnapshotPanel` as an expandable inline panel or drawer within the VolunteerDashboard. For prediction reviews, show the full "I think / Because" text. For implementation reviews, show the initialization rules as a checklist.

---

#### I-4: Missing NoActiveSessionPrompt

- **Screen:** Instructor Operations
- **Component:** `NoActiveSessionPrompt` (spec v4 §9) — does not exist
- **Workflow:** Instructor opens Operations when no session is active
- **Reason it matters:** Spec v4 §7: `/instructor/operations` "when no session is active, shows a prompt to create/open one." Currently, visiting Operations always shows `SessionMonitor` with the hardcoded `SESSION_ACTIVE`. There's no path for "no active session" — confusing when no workshop is running.
- **Recommended fix:** Check if any session has status `active`. If none, render `NoActiveSessionPrompt` with a CTA to create a new session.

---

#### I-5: Queue health doesn't visually distinguish claimed sub-states

- **Screen:** Instructor Operations → Session Monitor
- **Component:** `QueueHealthBoard`
- **Workflow:** Instructor monitors queue health during active session
- **Reason it matters:** Spec v4 §4: "Queue Health — extended to show the new Claimed sub-states distinctly (so '2 in Implementation Review Requested, 1 of which is claimed' is visible)." Currently, `QUEUE_HEALTH` shows separate rows for `impl_review_requested` (count:1) and `impl_review_claimed` (count:1), but there's no visual grouping showing they're the same pipeline. An instructor can't see "2 waiting, 1 claimed" at a glance.
- **Recommended fix:** Group related stages visually (e.g., Implementation Review: Waiting / In Progress side-by-side or stacked with a shared label). Show the total requested plus the claimed subset.

---

#### I-6: No rejection notes displayed to students on send-back

- **Screen:** Student Case Workflow
- **Component:** `StageActionPanel` (impl_review_claimed, prediction_review_claimed)
- **Workflow:** Volunteer rejects → student returns to prior stage with feedback note
- **Reason it matters:** When a volunteer rejects (sends back) a review, the spec requires a "required short note" explaining why. The student should see this note when re-entering the prior stage. The prototype transitions stages on rejection (impl_approved → building via "Request changes" button, prediction → prediction_submitted via "Send back") but shows no feedback note.
- **Recommended fix:** Store rejection note from volunteer. Display it in a card at the top of the stage the student returns to (e.g., "J. Park sent this back: The init-rule variable name should be 'total', not 'sum'.").

---

#### I-7: RaiseHandButton missing from CaseWorkflow screen

- **Screen:** Student Case Workflow (`/student/cases/:caseId`)
- **Component:** `RaiseHandButton` — only in `StudentSidebar`, not in `CaseWorkflow`
- **Workflow:** Student working on case → needs help → raises hand
- **Reason it matters:** Spec v4.5 §5: "RaiseHandButton (shown on StudentHome and CaseWorkflow)." A student deep in their case workflow shouldn't have to navigate back to home to raise their hand.
- **Recommended fix:** Add the RaiseHandButton to the CaseWorkflow header area (near the back button or case title).

---

#### I-8: Missing transfer hint reveal at Reflection stage

- **Screen:** Student Case Workflow
- **Component:** `CaseDossier` — `showTransferHint` is gated on `stage==="reflection"||stage==="complete"` ✅
- **Workflow:** Transfer hint revealed post-reflection
- **Reason it matters:** Actually this IS implemented correctly at line 837. However, the transfer hint only appears in the dossier. The spec says it should be "read after completion to reinforce transfer of learning" — it should also appear on the completion screen for re-reading.
- **Recommended fix:** Show Transfer Hint on both the Reflection stage panel and the Complete summary card.

---

#### I-9: Session Builder "Save as draft" and "Open session" have no real effects

- **Screen:** Instructor Session Builder
- **Component:** `SessionBuilder` at lines 1299-1301
- **Workflow:** Create session → save draft → generate code → open → activate
- **Reason it matters:** The Session Builder UI is complete: session name input, case multi-select from published cases, code generation display ✅. But "Save as draft" and "Open session" buttons have no persistent effect. Without this, instructors can't configure workshops.
- **Recommended fix:** Wire to API: `POST /instructor/sessions` creates a session (status=draft), `PUT /instructor/sessions/:id` transitions to open (generates code) then active.

---

#### I-10: Missing prediction attempt tracking and superseded predictions

- **Screen:** Student Case Workflow, Volunteer Review
- **Component:** `StageActionPanel`, `ClaimedCard`
- **Workflow:** Prediction rejection → retry (new attempt_number, old prediction marked superseded)
- **Reason it matters:** Spec v4 §3: "The original prediction text remains visible (for the student's reference and for analytics) but is marked `superseded`; a new prediction attempt is created. This preserves 'prediction is timestamped and cannot be silently edited' while allowing iteration — every attempt is logged." The prototype simply resets the prediction form on send-back — no attempt history is preserved.
- **Recommended fix:** On prediction rejection, mark current `predictions` row as `status=rejected` (not superseded — rejected is the correct status when volunteer sends back). On re-submit, create a new row with `attempt_number + 1`. Display attempt history to both student and volunteer.

---

#### I-11: No analytics data pipeline

- **Screen:** Instructor Analytics
- **Component:** `InstructorAnalytics`, `LearningEvidenceChart`
- **Workflow:** Analytics — learning evidence graph, cohort trends
- **Reason it matters:** The analytics screen renders a beautiful SVG chart ✅ but uses hardcoded `MASTERY_HISTORY` data. Spec v4.5 §1 defines mastery as accumulation from `student_concept_mastery` table, and analytics should query `concept_mastery_snapshots` (append-only) or aggregate from completed cases. Without a data pipeline, analytics show fake data forever.
- **Recommended fix:** Implement the mastery accumulation background job (runs on case completion). Populate `student_concept_mastery` and `concept_mastery_snapshots` tables. Build aggregation queries for cohort-level analytics.

---

#### I-12: No instructor promotion workflow (button has no handler)

- **Screen:** Instructor Roster
- **Component:** `InstructorRoster` — "Promote" button at line 1505
- **Workflow:** Student meets promotion thresholds → instructor confirms promotion
- **Reason it matters:** Spec v4.5 §2: "Promotion is NOT automatic in V1 — it is confirmed by an instructor using the Roster screen." The Roster shows "Ready to promote" badges ✅ and a "Promote" button, but clicking it does nothing. Clearance progression is core to the gamification model.
- **Recommended fix:** Wire Promote button to API that increments `student_profiles.clearance_level`. Optionally show a confirmation dialog summarizing the student's achievements.

---

### NICE TO HAVE — Quality & Polish

These don't block operation but affect user experience, reliability, and spec completeness.

---

#### N-1: No React Router — views managed via useState strings

- **Screen:** All screens
- **Component:** All shells (`StudentShell`, `VolunteerShell`, `InstructorShell`)
- **Workflow:** Navigation
- **Reason it matters:** Spec v3 §1: "React Router, route-level code splitting per role area." Currently, views are managed by `useState("home")` with string matching. No URL bar updates, no deep linking, no browser back/forward support, no code splitting. Makes the app feel like a demo rather than a real application.
- **Recommended fix:** Integrate React Router per the route structure in spec v4.5 §3. Route-level lazy loading for each role area.

---

#### N-2: No TanStack Query — all data is hardcoded constants

- **Screen:** All screens
- **Component:** Entire data layer
- **Workflow:** All data fetching
- **Reason it matters:** Spec v3 §4: "TanStack Query (per-resource hooks: `useCase`, `useSubmission`, `useStudentDashboard`, etc.)." The prototype uses static `const` declarations. Even with a backend, the frontend needs data fetching, caching, and loading/error state management. TanStack Query provides this out of the box.
- **Recommended fix:** Create API client (`src/api/client.ts`), implement resource modules per spec, wrap in TanStack Query hooks.

---

#### N-3: No real form validation (React Hook Form + Zod)

- **Screen:** Prediction Gate, Case Builder
- **Component:** `StageActionPanel` (prediction form), `CaseBuilderForm`
- **Workflow:** Form submission
- **Reason it matters:** Spec v3 §4: "React Hook Form + Zod for the Prediction Gate and Case Editor." Current forms use plain `<input>` and `<textarea>` with basic `disabled` checks. No Zod schema validation for concept weights (0-15 range), required fields, or prediction text length.
- **Recommended fix:** Integrate React Hook Form + Zod schemas for Prediction Gate (both fields non-empty, max length) and Case Builder (all required fields, concept weight ranges, valid case code format).

---

#### N-4: No empty/loading/error states (incomplete)

- **Screen:** Most screens
- **Component:** Various — only a handful of empty states exist
- **Workflow:** All async operations
- **Reason it matters:** Spec Phase 6: "Empty/loading/error states everywhere." The prototype has basic empty states for queues ✅ but no loading skeletons, no error toasts/banners, no retry mechanisms. In a real workshop with network latency, students and volunteers would see flashes of empty content.
- **Recommended fix:** Add loading skeletons to every data-dependent view, error boundaries at the shell level, and toast notifications for transient errors.

---

#### N-5: No dark mode persistence

- **Screen:** All screens
- **Component:** `ThemeToggle`, `SparkCodeApp`
- **Workflow:** Theme preference
- **Reason it matters:** Theme resets to "light" on every page load since it's component state. Spec says "Dark mode is first-class, not an afterthought." Should persist to localStorage or user preferences.
- **Recommended fix:** Persist theme choice to localStorage. Initialize from stored preference or system `prefers-color-scheme`.

---

#### N-6: No accessibility work (a11y)

- **Screen:** All screens
- **Component:** All interactive components
- **Workflow:** All interactions
- **Reason it matters:** Spec Phase 6: "a11y pass." The prototype has no `aria-*` attributes, no focus management, no keyboard navigation for queue cards or stage rail, no screen reader labels. For a nonprofit serving grades 3-6, accessibility is important but not release-blocking for an initial workshop pilot.
- **Recommended fix:** Add aria-labels to interactive elements, ensure keyboard navigability (Tab through queue items, Enter to claim), focus trapping in modals/panels, proper heading hierarchy.

---

#### N-7: Missing admin experience

- **Screen:** Missing `/admin/users`, `/admin/orgs`
- **Component:** N/A (does not exist)
- **Workflow:** Admin user management, org management
- **Reason it matters:** Spec defines Admin role with user/org management routes. Not required for workshop pilot (instructors handle roster), but needed for multi-org deployment.
- **Recommended fix:** Deferred per spec simplification recommendation ("Defer multi-org support in the UI" — hardcode single org for v1).

---

#### N-8: Incomplete Session Summary in closed sessions list

- **Screen:** Instructor Sessions
- **Component:** `SessionList` — "Summary" button at line 1229
- **Workflow:** Post-session review
- **Reason it matters:** Closed sessions show a "Summary" button but clicking it does nothing. The `SessionMonitor` generates a summary only for the currently-viewed session. Instructors need to review past session summaries.
- **Recommended fix:** Wire "Summary" button to `SessionSummary` component populated from `session_summaries` table.

---

#### N-9: No confirmation dialogs for destructive actions

- **Screen:** Session Monitor (close session), Case Builder (archive), Review (reject)
- **Component:** Various action buttons
- **Workflow:** Destructive actions
- **Reason it matters:** Closing a session is a two-step flow ✅, but archiving a case, rejecting a review, and promoting a student have no confirmation step. Accidental clicks could have real consequences in a workshop.
- **Recommended fix:** Add confirmation dialogs (or inline confirm steps) for: archiving cases, rejecting reviews (confirm the note is correct), promoting students.

---

#### N-10: Tools field uses plain text input instead of multi-tag

- **Screen:** Instructor Case Builder
- **Component:** `CaseBuilderForm` — Tools Allowed field at line 1143
- **Workflow:** Case authoring
- **Reason it matters:** Spec schema stores `tools_allowed` as `TEXT[]` (PostgreSQL array). The prototype uses a comma-separated text input. This works for simple cases but doesn't provide the tag-input UX shown elsewhere (e.g., concept tags are Badges). Inconsistent with the rest of the UI.
- **Recommended fix:** Implement a proper multi-tag input component that stores and displays individual tool names as removable badges.

---

#### N-11: No responsive/mobile layout

- **Screen:** All screens
- **Component:** Layout (sidebar + main)
- **Workflow:** All
- **Reason it matters:** Spec doesn't explicitly require mobile, but workshops may use tablets. The current fixed 240px sidebar + flex main content works on desktop but would break on smaller screens.
- **Recommended fix:** Collapsible sidebar with hamburger menu for tablet. Stack layout for mobile. Spec Phase 6: "mobile QA."

---

#### N-12: No real-time or polling for queue updates

- **Screen:** Volunteer Queue, Instructor Operations
- **Component:** `VolunteerShell`, `SessionMonitor`
- **Workflow:** Queue monitoring
- **Reason it matters:** Spec v3 §7: "Review Queue and Instructor Dashboard can poll every 15–30s; 'live' workshops don't need sub-second sync for grades 3–6." Currently, queue data never updates. With a backend, polling would keep the queue fresh.
- **Recommended fix:** Implement polling (TanStack Query `refetchInterval: 20_000`) for review queue, operations dashboard, and help requests.

---

#### N-13: Brand component logo/accent colors are inconsistent with brand tokens

- **Screen:** All screens (sidebar)
- **Component:** `Brand()` at line 303
- **Workflow:** N/A
- **Reason it matters:** The Brand logo uses `color="var(--accent)"` for the Sparkles icon on `var(--brand)` background. In dark mode, accent is `#FB923C` (orange) and brand is `#5E9BD6` (blue) — this combination has low contrast. The overall look is fine but not polished.
- **Recommended fix:** Use a white/light icon on the brand background for consistent contrast in both themes.

---

## PHASE 2 — IMPLEMENTATION ROADMAP

All tasks assume a single developer or very small team. Complexity estimates are relative to each other, not absolute hours.

---

### Sprint 1 — Workshop Critical

**Goal:** One instructor can run one workshop session with real students, volunteers, and a working core loop.

| # | Task | Impact | Complexity | Dependencies | Links to Gaps |
|---|---|---|---|---|---|
| 1.1 | **Rename product to Spark Agency** — update Brand component, all UI text, docs references | Low effort, high consistency value | Trivial | None | C-1 |
| 1.2 | **Set up project scaffold** — Vite + React + TypeScript + Tailwind + React Router. Port the prototype into the proper folder structure from spec v3 §4.1 | Foundation for all subsequent work | Medium | None | N-1 |
| 1.3 | **Implement PostgreSQL schema** — Execute the DDL from merged.md §2 + §4 §6 + §4.5 §7. This includes all tables: users, student_profiles, cases, case_progress, predictions, reviews, reflections, sessions, session_participants, concept_mastery, intervention_flags, case_lanes, lane_attempts, review_attachments, case_concept_weights, session_summaries | All data depends on this | Medium | 1.2 | C-2 |
| 1.4 | **Implement auth system** — Login screen, JWT issuance, httpOnly cookie, role extraction, route guards on frontend. Username+password (no email). Bulk account creation endpoint for instructor-managed rosters | Cannot test any role-gated feature without this | Medium | 1.2, 1.3 | C-3, C-8 |
| 1.5 | **Build core API endpoints** — Minimum viable REST API: `POST /auth/login`, `GET /me`, `GET /cases`, `GET /cases/:id`, `GET /dashboard/student`, `POST /cases/:id/predictions`, `GET /review/queue`, `POST /review/:submissionId/feedback`, `POST /sessions/join` | Powers the entire core loop | High | 1.3, 1.4 | C-2, C-4, C-5, C-6, C-7, C-10 |
| 1.6 | **Wire Student Home + Cases to live data** — Replace hardcoded STUDENT/ACTIVE_CASE/etc. with TanStack Query hooks. Student sees their real active case, real mastery, real progress | Student experience becomes real | Medium | 1.4, 1.5 | C-8 |
| 1.7 | **Implement session join flow** — `/student/session/join` screen. Student enters session code, is added to session_participants, available cases restrict to session cases | Required for any workshop | Low | 1.4, 1.5 | C-4 |
| 1.8 | **Enforce case state machine on backend** — Each stage transition is a validated API call. Prediction immutability enforced. Rejection paths return to correct prior stages with notes | Core loop integrity | High | 1.5, 1.6 | C-6, C-7, I-6, I-10 |
| 1.9 | **Back review queue with real data** — Poll `reviews` table where `reviewed_at IS NULL`. Implement transactional claim (`UPDATE ... WHERE claimed_by IS NULL` first-write-wins). Display real queue items per volunteer | Volunteers can actually work | Medium | 1.5, 1.8 | C-5 |
| 1.10 | **Implement raise hand / help request** — Create intervention_flags row on raise hand. Display in volunteer Help Requests queue. Implement Claim → Mark Helped flow | Students can get unstuck | Low | 1.5 | C-10, I-7 |
| 1.11 | **Wire Case Builder create/publish/archive** — API for case CRUD + status transitions. Fix the EMPTY_CASE new/edit bug. Wire all action buttons | Instructors can manage curriculum | Medium | 1.5 | I-1, I-2 |

**Sprint 1 exit criteria:** An instructor can create a session, students can join via code, students can progress through the full 11-stage case workflow with real volunteer reviews, and help requests work end-to-end.

---

### Sprint 2 — Operational Completeness

**Goal:** All instructor and volunteer workflows are complete. Mastery and clearance systems are live. Analytics are data-driven.

| # | Task | Impact | Complexity | Dependencies | Links to Gaps |
|---|---|---|---|---|---|
| 2.1 | **Implement session lifecycle** — Wire all session state transitions (draft→open→active→closing→closed). Session close generates `session_summaries`. NoActiveSessionPrompt when no active session | Instructors control workshops | Medium | 1.5, 1.11 | C-9, I-4, I-9 |
| 2.2 | **Implement mastery accumulation engine** — Background job (or on-completion trigger) that computes `SUM(concept_weights * lane_multiplier)` per concept, capped at 100. Updates `student_concept_mastery`. Applies Extension ×1.25 / Challenge ×1.5 bonus | Core progression mechanic | Medium | 1.8 | I-11 |
| 2.3 | **Wire Student Progress screen to live mastery data** — Show real per-concept mastery from `student_concept_mastery`. Show active case contribution inline. | Students see real progress | Low | 2.2, 1.6 | C-8 |
| 2.4 | **Implement clearance promotion workflow** — Instructor Roster shows students meeting thresholds. "Promote" button increments clearance_level. Student sees updated clearance in sidebar and progress screen | Gamification loop closes | Low | 2.2, 1.5 | I-12 |
| 2.5 | **Implement Student Snapshot panel** — Inline drawer in volunteer queue showing student details, prediction text, init rules checklist. Opens on queue item click | Volunteers make informed decisions | Medium | 1.9 | I-3 |
| 2.6 | **Add rejection notes display** — When volunteer sends back a review, store and display the feedback note to the student on re-entry to the prior stage | Students learn from feedback | Low | 1.8 | I-6 |
| 2.7 | **Wire Analytics to real data** — Query `concept_mastery_snapshots` for Learning Evidence Chart. Compute cohort accuracy from predictions/reviews. Cohort difficulty table from aggregated submission accuracy | Instructors see real insights | Medium | 2.2, 1.5 | I-11 |
| 2.8 | **Session list → summary navigation** — Wire "Summary" button on closed sessions to show `SessionSummary` from `session_summaries` table | Instructors review past workshops | Low | 2.1 | N-8 |
| 2.9 | **Add RaiseHandButton to CaseWorkflow** — Per spec, raise hand should be available from both StudentHome and CaseWorkflow | Students don't need to navigate away | Trivial | 1.10 | I-7 |
| 2.10 | **Transfer hint on completion screen** — Show transfer hint on the Complete stage panel in addition to the dossier | Reinforces learning transfer | Trivial | None | I-8 |

**Sprint 2 exit criteria:** All three roles have complete workflows. Mastery accurately reflects case completions. Clearance promotions work. Analytics show real cohort data. Sessions have full lifecycle.

---

### Sprint 3 — Quality & Polish

**Goal:** Production-ready UX, accessibility, responsive design, and hardening.

| # | Task | Impact | Complexity | Dependencies | Links to Gaps |
|---|---|---|---|---|---|
| 3.1 | **React Router integration** — Replace useState-based view switching with proper routes. Deep linking, browser navigation, code splitting per role area | App feels real | Medium | 1.2 | N-1 |
| 3.2 | **Form validation with React Hook Form + Zod** — Prediction Gate (non-empty both fields), Case Builder (all required fields, concept weight 0-15, valid case code format) | Prevents bad data | Medium | 1.6, 1.11 | N-3 |
| 3.3 | **Loading/empty/error states** — Skeleton loaders for all data views, error boundaries per shell, empty state illustrations, retry buttons | No broken-looking screens | Medium | 2.x (all data wiring) | N-4 |
| 3.4 | **Dark mode persistence** — localStorage or user preference persistence for theme choice | Remembered between visits | Trivial | None | N-5 |
| 3.5 | **Accessibility pass** — aria-labels on interactive elements, keyboard navigation (Tab through queue, Enter to claim), focus management, heading hierarchy | Usable by all students | Medium | All UI work | N-6 |
| 3.6 | **Confirmation dialogs** — Archive case, reject review, promote student, close session (already two-step ✅) | Prevents accidents | Low | 2.1, 2.4, 2.6 | N-9 |
| 3.7 | **Multi-tag input for Tools Allowed** — Replace comma-separated text input with proper tag component in Case Builder | Consistent UX | Low | 1.11 | N-10 |
| 3.8 | **Responsive layout** — Collapsible sidebar for tablet, stacked layout for mobile. Test on common workshop devices | Workshop flexibility | Medium | 1.2 | N-11 |
| 3.9 | **Polling for live data** — TanStack Query refetchInterval for review queue (20s), operations dashboard (20s), help requests (15s) | Near-real-time workshop awareness | Low | 1.9, 2.5 | N-12 |
| 3.10 | **Toast notification system** — For actions: "Review claimed", "Prediction submitted", "Hand raised", "Session closed" | Feedback for every action | Low | All | N-4 |
| 3.11 | **Fix brand logo contrast** — White/light sparkle icon on brand background for both themes | Visual polish | Trivial | None | N-13 |
| 3.12 | **Remove prototype RoleSwitcher** — Guard behind dev mode or remove entirely once auth is in place. Replace with login screen as the entry point | Security | Trivial | 1.4 | C-3 |

**Sprint 3 exit criteria:** App is ready for real workshop deployment. All screens have proper loading/error/empty states. Navigation works with browser controls. Accessible to screen readers. Responsive on tablets.

---

### Deferred (post-v1)

These are explicitly out of scope per the spec's own non-goals and simplification recommendations:

| Item | Reason Deferred |
|---|---|
| Admin experience (`/admin/users`, `/admin/orgs`) | Spec §3 §7: "Defer multi-org support in the UI — hardcode a single org for v1" |
| Multi-org support | Schema supports it, UI defers it |
| Real-time WebSocket sync | Spec §3 §7: "poll every 15–30s" sufficient for grades 3-6 |
| Custom code sandbox | Spec §3 §7: "Drop a custom code sandbox" — use Judge0/Piston |
| Public/parent-facing accounts | Spec §1 §6: "out of scope for v1" |
| Badge/achievement marketplace | Spec §1 §6: "clearance levels are the only progression currency" |
| In-app messaging/chat | Spec §1 §6: "feedback is asynchronous, attached to submissions" |
| Real-time collaborative editing | Spec §1 §6: "single-student execution only" |

---

## Appendix: What the Prototype Gets Right

These are areas where the prototype faithfully matches the spec and should be preserved:

1. **11-stage workflow** — All stages including the explicit "Claimed" sub-states ✅
2. **StageRail component** — Visual progress indicator with completed/active/future state, compact variant for StudentHome ✅
3. **Difficulty lanes as Required/Extension/Challenge** — Correct naming per v4 resolution, progressive not parallel ✅
4. **Lane attempt toggles** — Checkboxes in Building stage for Extension/Challenge self-selection ✅
5. **Screenshot flow** — Optional camera/file input on student side, thumbnail display on volunteer side, never required ✅
6. **Concept weight grid** — 8-concept × number input (0-15) in Case Builder per v4.5 spec ✅
7. **ClearanceCard** — Shows current level, next level, all three requirement types with checkmarks and counts ✅
8. **MasterySummary with growth + active case contribution** — Thick bars, "▲ +X% growth", "+N from this case" inline ✅
9. **Queue escalation coloring** — 10+ min warning, 20+ min danger, visual legend ✅
10. **Two-step session close** — Closing confirmation with in-flight review protection ✅
11. **Session summary generation** — Post-close stats grid with all specified fields ✅
12. **Predict & Prove form** — "I think... / Because..." scaffolded two-field form ✅
13. **Prediction lock on submit** — Read-only display with lock icon after submission ✅
14. **Role-specific sidebars** — Different nav items per role, identity card at bottom ✅
15. **Design tokens** — CSS custom properties for brand colors, correct light/dark palette per v3 §7 ✅
16. **Transfer hint in dossier** — Gated to Reflection/Complete stages ✅
17. **Mastery contribution display** — Per-concept "+N mastery" in case dossier ✅
18. **Clearance-gated available cases** — Locked cases show CL-N+ required badge ✅
19. **Bottleneck detection in Queue Health** — count ≥ 3 flagged as bottleneck per v4 spec ✅
20. **Session monitor wrapping operations** — Session-scoped KPI strip + queue health ✅
