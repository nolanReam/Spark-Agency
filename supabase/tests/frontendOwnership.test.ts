import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { instructorQueryKeys } from "../../src/api/queryKeys.ts";
import { normalizeSessionParticipants } from "../../src/api/sessionParticipants.ts";

const INSTRUCTOR_A = "11111111-1111-4111-8111-111111111111";
const INSTRUCTOR_B = "22222222-2222-4222-8222-222222222222";
const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("instructor query keys isolate users and selected sessions", () => {
  assert.notDeepEqual(
    instructorQueryKeys.cases(INSTRUCTOR_A),
    instructorQueryKeys.cases(INSTRUCTOR_B),
  );
  assert.deepEqual(instructorQueryKeys.activeSession(INSTRUCTOR_A), [
    "instructor", INSTRUCTOR_A, "active-session",
  ]);
  assert.deepEqual(instructorQueryKeys.helpRequests(INSTRUCTOR_A, SESSION_A), [
    "instructor", INSTRUCTOR_A, "session", SESSION_A, "help-requests",
  ]);
  assert.notDeepEqual(
    instructorQueryKeys.participants(INSTRUCTOR_A, SESSION_A),
    instructorQueryKeys.participants(INSTRUCTOR_A, SESSION_B),
  );
});

test("participant mapping preserves exact sessions, IDs, names, and roles", () => {
  const participants = normalizeSessionParticipants([
    {
      session_id: SESSION_A,
      student_id: "11111111-aaaa-4aaa-8aaa-111111111111",
      users: { id: "11111111-aaaa-4aaa-8aaa-111111111111", display_name: "Student One", role: "student" },
    },
    {
      session_id: SESSION_A,
      student_id: "22222222-aaaa-4aaa-8aaa-222222222222",
      users: [{ id: "22222222-aaaa-4aaa-8aaa-222222222222", display_name: "Student Two", role: "student" }],
    },
    {
      session_id: SESSION_A,
      student_id: "33333333-aaaa-4aaa-8aaa-333333333333",
      users: { id: "33333333-aaaa-4aaa-8aaa-333333333333", display_name: "Volunteer One", role: "volunteer" },
    },
  ], SESSION_A);

  assert.equal(participants.filter(({ role }) => role === "student").length, 2);
  assert.equal(participants.filter(({ role }) => role === "volunteer").length, 1);
  assert.ok(participants.every(({ session_id }) => session_id === SESSION_A));
  assert.equal(participants[2].display_name, "Volunteer One");
});

test("participant mapping distinguishes an empty session from incomplete profile data", () => {
  assert.deepEqual(normalizeSessionParticipants([], SESSION_A), []);
  assert.throws(
    () => normalizeSessionParticipants([{
      session_id: SESSION_A,
      student_id: "11111111-aaaa-4aaa-8aaa-111111111111",
      users: null,
    }], SESSION_A),
    /incomplete or unavailable/,
  );
  assert.throws(
    () => normalizeSessionParticipants([{
      session_id: SESSION_B,
      student_id: "11111111-aaaa-4aaa-8aaa-111111111111",
      users: { id: "11111111-aaaa-4aaa-8aaa-111111111111", display_name: "Student One", role: "student" },
    }], SESSION_A),
    /incomplete or unavailable/,
  );
});

test("instructor API queries and mutation owners are explicitly scoped", async () => {
  const source = await readFile(new URL("../../src/api/client.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("created_by", instructorId\)/);
  assert.match(source, /\.eq\("instructor_id", instructorId\)/);
  assert.match(source, /instructor_id: authData\.user\.id/);
  assert.match(source, /created_by: authData\.user\.id/);
  assert.doesNotMatch(source, /getGlobalEnrichedHelpRequests/);
});

test("account changes clear cache and monitoring uses the selected session", async () => {
  const appSource = await readFile(new URL("../../src/App.tsx", import.meta.url), "utf8");
  const instructorSource = await readFile(
    new URL("../../src/features/instructor/InstructorShell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(appSource, /queryClient\.clear\(\)/);
  assert.match(appSource, /previousUserId\.current !== currentUserId/);
  assert.match(instructorSource, /displayedSessionId/);
  assert.match(instructorSource, /useSessionParticipants\(displayedSessionId, instructorId\)/);
  assert.match(instructorSource, /isError: participantsUnavailable/);
  assert.match(instructorSource, /Participant counts are unavailable/);
  assert.match(instructorSource, /useHelpRequests\(displayedSessionId, instructorId\)/);
  assert.match(instructorSource, /No active session/);
  assert.match(instructorSource, />Create Session</);
});
