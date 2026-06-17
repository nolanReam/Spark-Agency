export const CONCEPTS = [
  "Variables", "Loops", "Conditionals", "Events",
  "Operators", "Lists", "Functions", "Custom Blocks",
] as const;
export type Concept = typeof CONCEPTS[number];

export const CLEARANCE_LEVELS = [
  { level: 1, title: "Junior Developer", casesRequired: 0,  accuracy: 0,  conceptsAt50: 0 },
  { level: 2, title: "Developer",        casesRequired: 3,  accuracy: 50, conceptsAt50: 1 },
  { level: 3, title: "Senior Developer", casesRequired: 7,  accuracy: 60, conceptsAt50: 3 },
  { level: 4, title: "Lead Developer",   casesRequired: 14, accuracy: 70, conceptsAt50: 5 },
  { level: 5, title: "Architect",        casesRequired: 25, accuracy: 80, conceptsAt50: 7 },
] as const;

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
