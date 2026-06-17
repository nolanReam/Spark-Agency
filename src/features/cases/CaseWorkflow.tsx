import { useState } from "react";
import { ArrowLeft, ListChecks, Loader2 } from "lucide-react";
import { Badge, Card, SectionLabel } from "../../components/ui";
import { StageRail } from "../../components/shared";
import { CaseDossier } from "./CaseDossier";
import { StageActionPanel } from "./StageActionPanel";
import type { StageKey } from "../../lib/constants";
import { useAuth } from "../../hooks/useAuth";
import {
  useStudentProgress,
  useCaseById,
  useCaseLanes,
  useCaseConceptWeights,
  useActiveSession,
  useAdvanceStage,
  useSubmitPrediction,
} from "../../api/hooks";

// ─── DB state ↔ StageKey mappings ─────────────────────────────────

const DB_TO_STAGE: Record<string, StageKey> = {
  building: "building",
  implementation_review_claimed: "impl_review_claimed",
  awaiting_implementation_review: "impl_review_requested",
  implementation_approved: "impl_approved",
  prediction_review_claimed: "prediction_review_claimed",
  awaiting_prediction_review: "prediction_review_requested",
  prediction_approved: "prediction_approved",
  testing_in_scratch: "testing",
  reflection_pending: "reflection",
  completed: "complete",
};

const STAGE_TO_DB: Record<string, string> = {
  building: "building",
  impl_review_requested: "awaiting_implementation_review",
  impl_review_claimed: "implementation_review_claimed",
  impl_approved: "implementation_approved",
  prediction_submitted: "awaiting_prediction_review",
  prediction_review_requested: "awaiting_prediction_review",
  prediction_review_claimed: "prediction_review_claimed",
  prediction_approved: "prediction_approved",
  testing: "testing_in_scratch",
  reflection: "reflection_pending",
  complete: "completed",
};

// ─── Component ──────────────────────────────────────────────────────

export function CaseWorkflow({ stage: _externalStage, setStage: _externalSetStage, onBack }: {
  stage: StageKey; setStage: (s: StageKey) => void; onBack: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [prediction, setPrediction] = useState({ think: "", because: "" });
  const [laneAttempts, setLaneAttempts] = useState<string[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  // Live data hooks
  const { data: activeSession } = useActiveSession();
  const sessionId = activeSession?.id ?? "";
  const { data: progress, isLoading: progressLoading } = useStudentProgress(userId, sessionId || undefined);

  // Derive active case from progress
  const activeProgress = (progress ?? []).find(p => p.state !== "completed" && p.state !== "not_started");
  const activeCaseId = activeProgress?.case_id ?? "";
  const dbState = activeProgress?.state ?? "building";

  // Fetch case details
  const { data: activeCase, isLoading: caseLoading } = useCaseById(activeCaseId);
  const { data: lanes, isLoading: lanesLoading } = useCaseLanes(activeCaseId);
  const { data: conceptWeights } = useCaseConceptWeights(activeCaseId);

  // Mutations
  const advanceStage = useAdvanceStage();
  const submitPrediction = useSubmitPrediction();

  // Derive stage from real data
  const stage = DB_TO_STAGE[dbState] ?? "building";
  const showTransferHint = stage === "reflection" || stage === "complete";

  // setStage wrapper: also call the mutation when appropriate
  const handleSetStage = (newStage: StageKey) => {
    const progressId = activeProgress?.id;
    if (!progressId) return;

    // For prediction_submitted → prediction_review_requested, submit the prediction first
    if (newStage === "prediction_review_requested" && prediction.think && prediction.because) {
      submitPrediction.mutate({
        progressId,
        prediction: prediction.think,
        reasoning: prediction.because,
      }, {
        onSuccess: () => advanceStage.mutate({ progressId, newState: "awaiting_prediction_review" }),
      });
      _externalSetStage(newStage);
      return;
    }

    // For other student-driven transitions, advance the stage
    const dbNewState = STAGE_TO_DB[newStage];
    if (dbNewState && dbNewState !== dbState) {
      advanceStage.mutate({ progressId, newState: dbNewState });
    }
    _externalSetStage(newStage);
  };

  // Build case data for sub-components
  const conceptWeightRecord: Record<string, number> = {};
  (conceptWeights ?? []).forEach(cw => { conceptWeightRecord[cw.concept] = cw.points; });

  const laneDefs = (lanes ?? []).map(l => ({
    name: l.lane,
    detail: l.description,
    available: l.available,
  }));
  // Ensure at least Required lane if DB has none
  if (laneDefs.length === 0 && activeCase) {
    laneDefs.push({ name: "Required", detail: activeCase.mission || "", available: true });
  }

  const caseData = {
    brief: activeCase?.client_brief ?? "",
    lanes: laneDefs,
    tools: activeCase?.tools_allowed ?? [],
    initRules: activeCase?.constraints ? [activeCase.constraints] : [],
    conceptWeights: conceptWeightRecord,
    transferHint: activeCase?.transfer_hint ?? "",
    predictPrompt: activeCase?.predict_prove_prompt ?? "What do you think will happen when you run your project?",
    reflectionPrompt: activeCase?.reflection_prompt ?? "What actually happened? How did it compare to your prediction?",
    reputationReward: activeCase?.reputation_reward ?? 25,
  };

  const loading = progressLoading || caseLoading || lanesLoading;

  return (
    <div>
      <button onClick={onBack} style={{
        display: "flex", alignItems: "center", gap: "0.4rem", background: "none",
        border: "none", color: "var(--text-muted)", fontSize: "0.85rem",
        cursor: "pointer", marginBottom: "1rem", padding: 0,
        fontFamily: "'IBM Plex Sans',sans-serif",
      }}>
        <ArrowLeft size={15} /> Back to Home
      </button>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)", gap: "0.5rem" }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading case…
        </div>
      )}

      {!loading && !activeCase && (
        <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
          No active case found. Go back and start a case.
        </Card>
      )}

      {!loading && activeCase && (
        <>
          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
              {(activeCase.concept_tags ?? []).map((c: string) => <Badge key={c}>{c}</Badge>)}
              {stage === "complete" && <Badge tone="success">Complete</Badge>}
            </div>
            <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>
              {activeCase.title}
            </h1>
            <p style={{ margin: "0.2rem 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Client: {activeCase.client_brief}
            </p>
          </div>
          <Card style={{ padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
            <SectionLabel icon={ListChecks}>Case progress</SectionLabel>
            <div style={{ marginTop: "0.85rem" }}><StageRail currentKey={stage} /></div>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: "1.1rem" }}>
            <CaseDossier caseData={caseData} showTransferHint={showTransferHint} />
            <StageActionPanel
              stage={stage} setStage={handleSetStage} caseData={caseData}
              prediction={prediction} setPrediction={setPrediction}
              laneAttempts={laneAttempts} setLaneAttempts={setLaneAttempts}
              screenshot={screenshot} setScreenshot={setScreenshot}
            />
          </div>
        </>
      )}
    </div>
  );
}
