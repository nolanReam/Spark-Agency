import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

let server;
let CaseDossier;
let StageActionPanel;
let dbToForm;
let formToCaseBuilderPayload;

before(async () => {
  server = await createServer({
    appType: "custom",
    logLevel: "silent",
    plugins: [react()],
    server: { middlewareMode: true },
  });
  ({ CaseDossier } = await server.ssrLoadModule("/src/features/cases/CaseDossier.tsx"));
  ({ StageActionPanel } = await server.ssrLoadModule("/src/features/cases/StageActionPanel.tsx"));
  ({ dbToForm, formToCaseBuilderPayload } = await server.ssrLoadModule("/src/features/instructor/caseBuilderForm.ts"));
});

after(async () => {
  await server?.close();
});

const requiredText = [
  "1. First requirement.",
  "2. Second requirement.",
  "3. Third requirement.",
].join("\n");
const paragraphText = "First paragraph.\n\nSecond paragraph.";
const htmlLikeText = "<script>alert('x')</script>";

function dossierMarkup(overrides = {}) {
  return renderToStaticMarkup(createElement(CaseDossier, {
    showTransferHint: true,
    caseData: {
      brief: paragraphText,
      mission: "Mission line one\nMission line two",
      lanes: [
        { name: "Required", detail: requiredText, available: true },
        { name: "Extension", detail: "Extension line one\nExtension line two", available: true },
        { name: "Challenge", detail: "UNAVAILABLE_CHALLENGE", available: false },
      ],
      tools: ["variables"],
      initRules: ["Set score to zero"],
      conceptWeights: { Variables: 5 },
      transferHint: htmlLikeText,
      ...overrides,
    },
  }));
}

test("student Case text preserves newlines, blank lines, and long-line wrapping", () => {
  const markup = dossierMarkup();
  assert.ok(markup.includes(requiredText));
  assert.ok(markup.includes(paragraphText));
  assert.ok(markup.includes("Mission line one\nMission line two"));
  assert.match(markup, /white-space:pre-wrap/);
  assert.match(markup, /overflow-wrap:break-word/);
});

test("instructor-authored HTML-looking text is escaped and never parsed as markup", () => {
  const markup = dossierMarkup();
  assert.ok(markup.includes("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;"));
  assert.doesNotMatch(markup, /<script>/);
});

test("available lanes render and unavailable optional lanes stay hidden", () => {
  const markup = dossierMarkup();
  assert.ok(markup.includes("Required"));
  assert.ok(markup.includes("Extension"));
  assert.ok(markup.includes("Extension line one\nExtension line two"));
  assert.ok(!markup.includes("UNAVAILABLE_CHALLENGE"));
});

test("Predict and Reflection prompts use the preserved plain-text renderer", () => {
  const baseProps = {
    setStage() {},
    caseData: {
      predictPrompt: "Predict line one\n\nPredict line two",
      reflectionPrompt: "Reflect line one\nReflect line two",
      lanes: [],
      reputationReward: 25,
      conceptWeights: {},
    },
    prediction: { think: "", because: "" },
    setPrediction() {},
    reflectionText: "",
    setReflectionText() {},
    laneAttempts: [],
    setLaneAttempts() {},
  };

  const predictMarkup = renderToStaticMarkup(createElement(StageActionPanel, {
    ...baseProps,
    stage: "prediction_submitted",
  }));
  const reflectionMarkup = renderToStaticMarkup(createElement(StageActionPanel, {
    ...baseProps,
    stage: "reflection",
  }));

  assert.ok(predictMarkup.includes("Predict line one\n\nPredict line two"));
  assert.match(predictMarkup, /white-space:pre-wrap/);
  assert.ok(reflectionMarkup.includes("Reflect line one\nReflect line two"));
  assert.match(reflectionMarkup, /white-space:pre-wrap/);
});

test("Case Builder save and reopen round-trips multiline text exactly", () => {
  const multiline = "Line one\nLine two\nLine three";
  const form = dbToForm({
    id: "case-1",
    case_code: "CASE-1",
    title: "Formatting Case",
    client_brief: multiline,
    mission: multiline,
    constraints: null,
    tools_allowed: ["variables"],
    difficulty_lane: "core",
    concept_tags: ["Variables"],
    min_clearance: 1,
    status: "draft",
    predict_prove_prompt: multiline,
    reflection_prompt: multiline,
    transfer_hint: multiline,
    reputation_reward: 25,
    estimated_minutes: 20,
    created_by: "instructor-1",
    published_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }, [
    { id: "lane-1", case_id: "case-1", lane: "Required", description: multiline, available: true },
    { id: "lane-2", case_id: "case-1", lane: "Extension", description: multiline, available: true },
    { id: "lane-3", case_id: "case-1", lane: "Challenge", description: multiline, available: true },
  ]);
  const payload = formToCaseBuilderPayload(form, "draft");

  assert.equal(payload.caseData.client_brief, multiline);
  assert.equal(payload.caseData.mission, multiline);
  assert.equal(payload.caseData.predict_prove_prompt, multiline);
  assert.equal(payload.caseData.reflection_prompt, multiline);
  assert.equal(payload.caseData.transfer_hint, multiline);
  assert.deepEqual(payload.lanes.map(lane => lane.description), [multiline, multiline, multiline]);

  const reopened = dbToForm(
    { ...form, ...payload.caseData },
    payload.lanes.map((lane, index) => ({ id: `lane-${index}`, case_id: "case-1", ...lane })),
  );
  assert.equal(reopened.client_brief, multiline);
  assert.equal(reopened.mission, multiline);
  assert.equal(reopened.predict_prove_prompt, multiline);
  assert.equal(reopened.reflection_prompt, multiline);
  assert.equal(reopened.transfer_hint, multiline);
  assert.deepEqual(reopened.lanes.map(lane => lane.detail), [multiline, multiline, multiline]);
});
