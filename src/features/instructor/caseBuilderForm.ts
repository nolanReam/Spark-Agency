import type { CaseBuilderSavePayload, DbCase, DbCaseConceptWeight, DbCaseLane } from "../../api/client";
import { CONCEPTS } from "../../lib/constants";

type CaseLaneName = "Required" | "Extension" | "Challenge";

export interface CaseFormData {
  id?: string; case_code: string; title: string; client_brief: string;
  min_clearance: number; reputation_reward: number; estimated_minutes: number;
  mission: string; tools_allowed: string;
  predict_prove_prompt: string; reflection_prompt: string; transfer_hint: string;
  concept_tags: string[];
  concept_weights: Record<string, number>;
  lanes: { name: CaseLaneName; detail: string; available: boolean }[];
  init_rules: string[];
}

export function emptyCaseForm(): CaseFormData {
  return {
    case_code: "", title: "", client_brief: "", min_clearance: 1,
    reputation_reward: 25, estimated_minutes: 20, mission: "",
    tools_allowed: "", predict_prove_prompt: "", reflection_prompt: "",
    transfer_hint: "", concept_tags: [],
    concept_weights: Object.fromEntries(CONCEPTS.map(c => [c, 0])),
    lanes: [{ name: "Required", detail: "", available: true }, { name: "Extension", detail: "", available: false }, { name: "Challenge", detail: "", available: false }],
    init_rules: [""],
  };
}

export function dbToForm(c: DbCase, savedLanes: DbCaseLane[] = [], savedWeights: DbCaseConceptWeight[] = []): CaseFormData {
  const lanesByName = new Map(savedLanes.map(lane => [lane.lane, lane]));
  const lanes = (["Required", "Extension", "Challenge"] as const).map(name => {
    const saved = lanesByName.get(name);
    return {
      name,
      detail: saved?.description ?? "",
      available: saved?.available ?? name === "Required",
    };
  });
  const weightsByConcept = new Map(savedWeights.map(weight => [weight.concept, weight.points]));
  const initRules = (c.constraints ?? "")
    .split(/\r?\n/)
    .map(rule => rule.trim())
    .filter(Boolean);

  return {
    id: c.id, case_code: c.case_code ?? "", title: c.title,
    client_brief: c.client_brief, min_clearance: c.min_clearance,
    reputation_reward: c.reputation_reward, estimated_minutes: c.estimated_minutes ?? 20,
    mission: c.mission, tools_allowed: (c.tools_allowed ?? []).join(", "),
    predict_prove_prompt: c.predict_prove_prompt ?? "",
    reflection_prompt: c.reflection_prompt ?? "",
    transfer_hint: c.transfer_hint ?? "",
    concept_tags: c.concept_tags ?? [],
    concept_weights: Object.fromEntries(CONCEPTS.map(concept => [concept, weightsByConcept.get(concept) ?? 0])),
    lanes,
    init_rules: initRules.length > 0 ? initRules : [""],
  };
}

export function formToDbPartial(f: CaseFormData): Partial<DbCase> {
  return {
    ...(f.id ? { id: f.id } : {}),
    case_code: f.case_code || null, title: f.title,
    client_brief: f.client_brief, min_clearance: f.min_clearance,
    reputation_reward: f.reputation_reward, estimated_minutes: f.estimated_minutes,
    mission: f.mission, difficulty_lane: "core",
    tools_allowed: f.tools_allowed ? f.tools_allowed.split(",").map(s => s.trim()).filter(Boolean) : [],
    predict_prove_prompt: f.predict_prove_prompt || null,
    reflection_prompt: f.reflection_prompt || null,
    transfer_hint: f.transfer_hint || null,
    concept_tags: f.concept_tags,
    constraints: f.init_rules.map(r => r.trim()).filter(Boolean).join("\n") || null,
    status: "draft",
  };
}

export function formToCaseBuilderPayload(f: CaseFormData, status: "draft" | "published"): CaseBuilderSavePayload {
  return {
    caseId: f.id,
    caseData: { ...formToDbPartial(f), status },
    lanes: f.lanes.map(lane => ({
      lane: lane.name,
      description: lane.detail,
      available: lane.name === "Required" ? true : lane.available,
    })),
    conceptWeights: CONCEPTS.map(concept => ({
      concept,
      points: f.concept_weights[concept] ?? 0,
    })),
  };
}
