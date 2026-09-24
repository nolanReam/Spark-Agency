import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CASE_CLEARANCE_LEVELS,
  canAccessCase,
  getClearanceTitle,
} from "../../src/lib/constants.ts";

test("student clearance labels distinguish Orientation from earned CL-1", () => {
  assert.equal(getClearanceTitle(0), "Orientation");
  assert.equal(getClearanceTitle(1), "Junior Developer");
  assert.equal(getClearanceTitle(6), null);
});

test("Case minimum choices include earned clearance only", () => {
  assert.deepEqual(CASE_CLEARANCE_LEVELS.map(level => level.level), [1, 2, 3, 4, 5]);
  assert.equal(CASE_CLEARANCE_LEVELS.some(level => Number(level.level) === 0), false);
});

test("Case access fails closed until student clearance is loaded", () => {
  assert.equal(canAccessCase(undefined, 1), false);
  assert.equal(canAccessCase(null, 1), false);
  assert.equal(canAccessCase(0, 1), false);
  assert.equal(canAccessCase(1, 1), true);
});
