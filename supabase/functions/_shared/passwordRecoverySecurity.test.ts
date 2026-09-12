import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  claimResultError,
  configuredOrigins,
  generateTemporaryPassword,
  isAllowedOrigin,
  jsonResponse,
  parsePasswordChangeRequest,
  parseResetRequest,
  passwordUpdateError,
  rolesAreReconciled,
} from "./passwordRecoverySecurity.ts";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

test("reset requests accept only a request ID", () => {
  assert.deepEqual(parseResetRequest({ requestId: REQUEST_ID }), {
    ok: true,
    requestId: REQUEST_ID,
  });
  assert.deepEqual(parseResetRequest({ requestId: REQUEST_ID, studentId: REQUEST_ID }), {
    ok: false,
  });
  assert.deepEqual(parseResetRequest({ requestId: REQUEST_ID, role: "instructor" }), {
    ok: false,
  });
});

test("password changes accept no student ID or authority fields", () => {
  assert.deepEqual(parsePasswordChangeRequest({ newPassword: "Different!234" }), {
    ok: true,
    newPassword: "Different!234",
  });
  assert.deepEqual(
    parsePasswordChangeRequest({ newPassword: "Different!234", studentId: REQUEST_ID }),
    { ok: false, code: "INVALID_REQUEST" },
  );
  assert.deepEqual(parsePasswordChangeRequest({ newPassword: "short" }), {
    ok: false,
    code: "PASSWORD_TOO_SHORT",
  });
});

test("trusted and public roles must both match", () => {
  assert.equal(rolesAreReconciled("instructor", "instructor", "instructor"), true);
  assert.equal(rolesAreReconciled("student", "instructor", "instructor"), false);
  assert.equal(rolesAreReconciled("instructor", "student", "instructor"), false);
  assert.equal(rolesAreReconciled("instructor", "instructor", "student"), false);
});

test("temporary passwords use the required length and character categories", () => {
  const passwords = new Set<string>();
  for (let index = 0; index < 256; index += 1) {
    const password = generateTemporaryPassword();
    assert.equal(password.length, 16);
    assert.match(password, /[abcdefghijkmnopqrstuvwxyz]/);
    assert.match(password, /[ABCDEFGHJKLMNPQRSTUVWXYZ]/);
    assert.match(password, /[23456789]/);
    assert.match(password, /[!@#$%?]/);
    assert.doesNotMatch(password, /[IlO01]/);
    passwords.add(password);
  }
  assert.equal(passwords.size, 256);
});

test("CORS requires an exact configured origin and responses are not cached", () => {
  const origins = configuredOrigins("https://spark.example, http://localhost:5173");
  assert.equal(isAllowedOrigin("https://spark.example", origins), true);
  assert.equal(isAllowedOrigin("https://evil.example", origins), false);
  assert.equal(isAllowedOrigin(null, origins), false);

  const response = jsonResponse({ ok: true }, 200, "https://spark.example");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://spark.example");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("database and Auth outcomes map to allowlisted client errors", () => {
  assert.equal(claimResultError("RESET_ALREADY_PROCESSING")?.code, "RESET_ALREADY_PROCESSING");
  assert.equal(claimResultError("unrecognized internal detail")?.code, "RESET_FAILED");
  assert.equal(passwordUpdateError("same_password").code, "PASSWORD_MUST_DIFFER");
  assert.equal(passwordUpdateError("weak_password").code, "PASSWORD_REJECTED");
  assert.equal(passwordUpdateError("provider detail").code, "PASSWORD_CHANGE_FAILED");
});

test("Edge Function logs cannot interpolate secrets or request bodies", async () => {
  const resetSource = await readFile(
    new URL("../reset-student-password/index.ts", import.meta.url),
    "utf8",
  );
  const changeSource = await readFile(
    new URL("../change-student-password/index.ts", import.meta.url),
    "utf8",
  );
  const configSource = await readFile(new URL("../../config.toml", import.meta.url), "utf8");
  for (const source of [resetSource, changeSource]) {
    const consoleStatements = source.split("\n").filter(line => line.includes("console."));
    assert.equal(
      consoleStatements.some(line => /temporaryPassword|newPassword|\btoken\b|authorization|requestBody/i.test(line)),
      false,
    );
    assert.equal(source.includes('Access-Control-Allow-Origin": "*"'), false);
  }
  assert.match(resetSource, /const studentId = claim\.student_id;/);
  assert.doesNotMatch(resetSource, /payload\.studentId|requestBody\.studentId/);
  assert.match(changeSource, /const studentId = callerData\.user\.id;/);
  assert.doesNotMatch(changeSource, /payload\.studentId|requestBody\.studentId/);
  assert.match(configSource, /\[functions\.reset-student-password\]\s+verify_jwt = true/);
  assert.match(configSource, /\[functions\.change-student-password\]\s+verify_jwt = true/);
});
