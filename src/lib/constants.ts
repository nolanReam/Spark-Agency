export const CONCEPTS = [
  "Variables", "Loops", "Conditionals", "Events",
  "Operators", "Lists", "Functions", "Custom Blocks",
] as const;
export type Concept = typeof CONCEPTS[number];

export const STUDENT_CLEARANCE_LABELS = {
  0: "Orientation",
  1: "Junior Developer",
  2: "Developer",
  3: "Senior Developer",
  4: "Lead Developer",
  5: "Architect",
} as const;

export type ClearanceLevel = keyof typeof STUDENT_CLEARANCE_LABELS;

export function getClearanceTitle(level: number): string | null {
  return STUDENT_CLEARANCE_LABELS[level as ClearanceLevel] ?? null;
}

// Case Files require earned clearance. Orientation is deliberately excluded.
export const CASE_CLEARANCE_LEVELS = [
  { level: 1, title: STUDENT_CLEARANCE_LABELS[1], casesRequired: 0,  accuracy: 0,  conceptsAt50: 0 },
  { level: 2, title: STUDENT_CLEARANCE_LABELS[2], casesRequired: 3,  accuracy: 50, conceptsAt50: 1 },
  { level: 3, title: STUDENT_CLEARANCE_LABELS[3], casesRequired: 7,  accuracy: 60, conceptsAt50: 3 },
  { level: 4, title: STUDENT_CLEARANCE_LABELS[4], casesRequired: 14, accuracy: 70, conceptsAt50: 5 },
  { level: 5, title: STUDENT_CLEARANCE_LABELS[5], casesRequired: 25, accuracy: 80, conceptsAt50: 7 },
] as const;

export function canAccessCase(
  clearanceLevel: number | null | undefined,
  minimumClearance: number,
): boolean {
  return typeof clearanceLevel === "number"
    && Number.isInteger(clearanceLevel)
    && clearanceLevel >= minimumClearance;
}

export const STAGES = [
  { key: "building",                    label: "Building" },
  { key: "impl_review_requested",       label: "Implementation Review Requested" },
  { key: "impl_review_claimed",         label: "Implementation Review In Progress" },
  { key: "impl_approved",               label: "Implementation Approved" },
  { key: "prediction_submitted",        label: "Prediction Submitted" },
  { key: "prediction_review_requested", label: "Prediction Review Requested" },
  { key: "prediction_review_claimed",   label: "Prediction Review In Progress" },
  { key: "prediction_approved",         label: "Prediction Approved" },
  { key: "testing",                     label: "Testing" },
  { key: "reflection",                  label: "Reflection" },
  { key: "complete",                    label: "Complete" },
] as const;

export type StageKey = typeof STAGES[number]["key"];

export function stageIndex(key: StageKey): number {
  return STAGES.findIndex(s => s.key === key) ?? 0;
}

export const SESSION_STATES = ["draft", "open", "active", "closing", "closed"] as const;
export type SessionStatus = typeof SESSION_STATES[number];

export const CASE_STATUSES = ["draft", "published", "archived"] as const;
export type CaseStatus = typeof CASE_STATUSES[number];
