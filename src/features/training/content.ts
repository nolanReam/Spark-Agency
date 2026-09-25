export const ORIENTATION_SECTION_CODES = [
  "how-spark-works",
  "scratch-basics",
  "build-test-explain",
] as const;

export type OrientationSectionCode = typeof ORIENTATION_SECTION_CODES[number];

export interface OrientationSection {
  code: OrientationSectionCode;
  title: string;
  intro: string;
  bullets: string[];
}

export const ORIENTATION_SECTIONS: OrientationSection[] = [
  {
    code: "how-spark-works",
    title: "How Spark Agency Works",
    intro: "At Spark Agency, you solve Cases like a real developer—one careful step at a time.",
    bullets: [
      "Plan and build your idea.",
      "Ask for a review before you test.",
      "Predict what your code will do.",
      "Test it in Scratch, then reflect on what happened.",
      "A Case is a small client challenge. Instructors and volunteers review your work and help you improve it.",
      "Need help? Use Raise hand while a Case is open, or ask your instructor.",
    ],
  },
  {
    code: "scratch-basics",
    title: "Scratch Basics",
    intro: "You only need a few Scratch moves to begin your first Case.",
    bullets: [
      "Sprites are the characters. The Stage is where your project runs.",
      "Drag blocks into the code area and snap them together.",
      "Use the green flag to start. Use the red stop button before restarting.",
      "Click a number or word inside a block to change its value.",
      "Save your project, then use Share when your classroom workflow asks for a link.",
    ],
  },
  {
    code: "build-test-explain",
    title: "Build → Test → Explain",
    intro: "Good developers make small changes and check their work.",
    bullets: [
      "Make one change.",
      "Run the project.",
      "Check: did it do what you expected?",
      "Fix it if needed, then test again.",
      "Be ready to explain what your blocks do in your own words.",
    ],
  },
];

export const QUALIFICATION_CHECKS = [
  { code: "green_flag_starts", label: "The green flag starts the project correctly." },
  { code: "sprite_moves_across_stage", label: "The sprite moves across the Stage." },
  { code: "message_after_moving", label: "The sprite says a message after moving." },
  { code: "personal_change_tested", label: "I added and tested one change of my own." },
] as const;

export const SCRATCH_PROJECT_URL_PATTERN =
  /^https:\/\/scratch\.mit\.edu\/projects\/[0-9]+\/?(?:[?#].*)?$/;

export function isOrientationComplete(completed: readonly string[] | null | undefined): boolean {
  return ORIENTATION_SECTION_CODES.every(code => completed?.includes(code));
}

export function isQualificationEvidenceComplete(input: {
  projectUrl: string;
  changeSummary: string;
  testingSummary: string;
  checkResults: Record<string, boolean>;
}): boolean {
  return SCRATCH_PROJECT_URL_PATTERN.test(input.projectUrl.trim())
    && input.changeSummary.trim().length > 0
    && input.testingSummary.trim().length > 0
    && QUALIFICATION_CHECKS.every(check => input.checkResults[check.code] === true);
}
