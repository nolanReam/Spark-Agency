import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { instructorQueryKeys, studentQueryKeys } from "../../src/api/queryKeys.ts";
import {
  isOrientationComplete,
  isQualificationEvidenceComplete,
  ORIENTATION_SECTIONS,
  QUALIFICATION_CHECKS,
} from "../../src/features/training/content.ts";

const CANONICAL_STARTER_URL = "https://scratch.mit.edu/projects/1384855314/";

const STUDENT_A = "11111111-1111-4111-8111-111111111111";
const STUDENT_B = "22222222-2222-4222-8222-222222222222";
const INSTRUCTOR_A = "33333333-3333-4333-8333-333333333333";

test("Orientation has the three concise persisted sections", () => {
  assert.deepEqual(ORIENTATION_SECTIONS.map(section => section.code), [
    "how-spark-works",
    "scratch-basics",
    "build-test-explain",
  ]);
  assert.equal(isOrientationComplete([]), false);
  assert.equal(isOrientationComplete(ORIENTATION_SECTIONS.map(section => section.code)), true);
  assert.match(ORIENTATION_SECTIONS[0].bullets.join(" "), /Plan and build/);
  assert.match(ORIENTATION_SECTIONS[1].bullets.join(" "), /green flag/);
  assert.match(ORIENTATION_SECTIONS[2].bullets.join(" "), /Make one change/);
});

test("qualification evidence requires a Scratch project, two short answers, and every check", () => {
  const checks = Object.fromEntries(QUALIFICATION_CHECKS.map(check => [check.code, true]));
  assert.equal(isQualificationEvidenceComplete({
    projectUrl: "https://scratch.mit.edu/projects/123456789/",
    changeSummary: "I added a sound.",
    testingSummary: "I restarted it and heard the sound.",
    checkResults: checks,
  }), true);
  assert.equal(isQualificationEvidenceComplete({
    projectUrl: "https://example.com/not-scratch",
    changeSummary: "I added a sound.",
    testingSummary: "I tested it.",
    checkResults: checks,
  }), false);
  assert.equal(isQualificationEvidenceComplete({
    projectUrl: "https://scratch.mit.edu/projects/123456789/",
    changeSummary: "I added a sound.",
    testingSummary: "I tested it.",
    checkResults: { ...checks, personal_change_tested: false },
  }), false);
});

test("qualification presents the canonical starter separately from remix evidence", async () => {
  const [migration, trainingSource] = await Promise.all([
    readFile(new URL("../../013_training_foundation.sql", import.meta.url), "utf8"),
    readFile(new URL("../../src/features/training/StudentTraining.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal(migration.includes(CANONICAL_STARTER_URL), true);
  assert.match(migration, /'starter_project_url'/);
  assert.match(migration, /Click Remix to save a copy in your Scratch account/);
  assert.match(trainingSource, /definition\.requirements\.starter_project_url/);
  assert.match(trainingSource, /Remix it into your own Scratch account/);
  assert.match(trainingSource, /value=\{projectUrl\}/);
  assert.doesNotMatch(trainingSource, /value=\{definition\.requirements\.starter_project_url\}/);
});

test("qualification checks match the CL1 starter task", () => {
  assert.deepEqual(QUALIFICATION_CHECKS.map(check => check.label), [
    "The green flag starts the project correctly.",
    "The sprite moves across the Stage.",
    "The sprite says a message after moving.",
    "I added and tested one change of my own.",
  ]);
});

test("training query keys isolate student and instructor accounts", () => {
  assert.notDeepEqual(studentQueryKeys.profile(STUDENT_A), studentQueryKeys.profile(STUDENT_B));
  assert.notDeepEqual(
    studentQueryKeys.juniorQualification(STUDENT_A),
    studentQueryKeys.juniorQualification(STUDENT_B),
  );
  assert.deepEqual(instructorQueryKeys.qualificationQueue(INSTRUCTOR_A), [
    "instructor", INSTRUCTOR_A, "qualification-queue",
  ]);
});

test("student training renders submitted, retry, pass, and retry feedback states", async () => {
  const source = await readFile(
    new URL("../../src/features/training/StudentTraining.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Submitted/);
  assert.match(source, /Retry needed/);
  assert.match(source, /Qualification passed — CL1 earned/);
  assert.match(source, /Instructor note/);
  assert.match(source, /refetchProfile\(\)/);
});

test("CL0 receives Orientation first and locked Cases explain the qualification requirement", async () => {
  const [shell, cases] = await Promise.all([
    readFile(new URL("../../src/features/dashboard/StudentShell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/features/cases/StudentCases.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /clearanceLevel === 0/);
  assert.match(shell, /selectedView \?\? \(clearanceLevel === 0 \? "training" : "home"\)/);
  assert.match(cases, /pass the Junior Developer Qualification to unlock CL1 Cases/);
  assert.match(cases, /Clearance unavailable\. This Case stays locked/);
});

test("instructor review requires the full rubric for Pass and a note for Retry", async () => {
  const source = await readFile(
    new URL("../../src/features/training/QualificationReviewQueue.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /allPassed/);
  assert.match(source, /Write a short, actionable note/);
  assert.match(source, /Pass and grant CL1/);
  assert.match(source, /disabled=\{review\.isPending \|\| !allPassed\}/);
});
