import { useState, useEffect } from "react";
import { ArrowLeft, ListChecks, Loader2 } from "lucide-react";
import { Badge, Card, SectionLabel } from "../../components/ui";
import { ReturnedForRevisionPanel, StageRail } from "../../components/shared";
import { CaseDossier } from "./CaseDossier";
import { StageActionPanel } from "./StageActionPanel";
import type { StageKey } from "../../lib/constants";
import type { StudentReviewFeedback } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import {
  useStudentProgress,
  useCaseById,
  useCaseLanes,
  useCaseConceptWeights,
  useAdvanceStage,
  useSubmitPrediction,
  useLatestApprovedPrediction,
  useSaveReflection,
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
  prediction_review_requested: "awaiting_prediction_review",
  prediction_review_claimed: "prediction_review_claimed",
  prediction_approved: "prediction_approved",
  testing: "testing_in_scratch",
  reflection: "reflection_pending",
  complete: "completed",
};

// ─── Component ──────────────────────────────────────────────────────

export function CaseWorkflow({ sessionId, stage: _externalStage, setStage: _externalSetStage, caseId, readOnly, reviewFeedback, onBack }: {
  sessionId: string; stage: StageKey; setStage: (s: StageKey) => void; caseId?: string; readOnly?: boolean; reviewFeedback: StudentReviewFeedback[]; onBack: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [prediction, setPrediction] = useState({ think: "", because: "" });
  const [reflectionText, setReflectionText] = useState("");
  const [laneAttempts, setLaneAttempts] = useState<string[]>([]);
  const [showPredictionForm, setShowPredictionForm] = useState(false);
  // Optimistic DB state: reflects user-initiated transitions immediately,
  // without waiting for React Query to refetch. Reset to null when the
  // real dbState catches up (or on error).
  const [optimisticDbState, setOptimisticDbState] = useState<string | null>(null);

  // Live data hooks
  const { data: progress, isLoading: progressLoading } = useStudentProgress(userId, sessionId);

  // Derive active case from progress — or use explicitly provided caseId
  // caseId + readOnly  → completed case view (read-only)
  // caseId + !readOnly → just-started case (look up progress, fall back to building)
  // no caseId          → derive from active progress as usual
  const isReadOnlyCompleted = !!(caseId && readOnly);
  const activeProgress = isReadOnlyCompleted ? undefined : (progress ?? []).find(p => p.state !== "completed" && p.state !== "not_started");
  const activeCaseId = caseId || activeProgress?.case_id || "";
  const dbState = isReadOnlyCompleted ? "completed" : (activeProgress?.state ?? "building");

  // Fetch case details
  const { data: activeCase, isLoading: caseLoading } = useCaseById(activeCaseId);
  const { data: lanes, isLoading: lanesLoading } = useCaseLanes(activeCaseId);
  const { data: conceptWeights } = useCaseConceptWeights(activeCaseId);

  // Mutations
  const advanceStage = useAdvanceStage();
  const submitPrediction = useSubmitPrediction();
  const saveReflection = useSaveReflection();

  // ── Optimistic stage: use local override if set, otherwise DB data ──
  // When optimisticDbState is set (user just clicked a button), use it.
  // When the real dbState catches up (query refetch), clear the override.
  const effectiveDbState = optimisticDbState ?? dbState;

  // Sync: clear optimistic state when the real DB data catches up
  useEffect(() => {
    if (optimisticDbState && optimisticDbState === dbState) {
      setOptimisticDbState(null);
    }
  }, [optimisticDbState, dbState]);

  useEffect(() => {
    if (effectiveDbState !== "implementation_approved" && showPredictionForm) {
      setShowPredictionForm(false);
    }
  }, [effectiveDbState, showPredictionForm]);

  // Derive stage from effective (optimistic or real) data
  const dbStage = DB_TO_STAGE[effectiveDbState] ?? "building";
  const stage = effectiveDbState === "implementation_approved" && showPredictionForm
    ? "prediction_submitted"
    : dbStage;
  const showTransferHint = stage === "reflection" || stage === "complete";
  const displayNeedsApprovedPrediction = stage === "prediction_approved" || stage === "testing";
  const { data: approvedPrediction } = useLatestApprovedPrediction(activeProgress?.id ?? "", displayNeedsApprovedPrediction);
  const predictionForDisplay = approvedPrediction
    ? { think: approvedPrediction.prediction_text, because: approvedPrediction.reasoning_text }
    : prediction;

  // setStage wrapper: also call the mutation when appropriate
  const handleSetStage = (newStage: StageKey) => {
    if (readOnly) return; // read-only: no state changes allowed

    if (effectiveDbState === "implementation_approved" && newStage === "prediction_submitted") {
      setShowPredictionForm(true);
      _externalSetStage(newStage);
      return;
    }

    const progressId = activeProgress?.id;
    if (!progressId) return;

    if (newStage === "complete") {
      const targetDbState = "completed";
      saveReflection.mutate({ progressId, reflectionText }, {
        onSuccess: () => {
          setOptimisticDbState(targetDbState);
          advanceStage.mutate({ progressId, newState: targetDbState }, {
            onError: () => setOptimisticDbState(null),
          });
          _externalSetStage(newStage);
        },
      });
      return;
    }

    // For prediction_submitted → prediction_review_requested, submit the prediction first
    if (newStage === "prediction_review_requested" && prediction.think && prediction.because) {
      const targetDbState = "awaiting_prediction_review";
      setOptimisticDbState(targetDbState); // immediate UI update
      submitPrediction.mutate({
        progressId,
        prediction: prediction.think,
        reasoning: prediction.because,
      }, {
        onSuccess: (submittedPrediction) => advanceStage.mutate({ progressId, newState: targetDbState, predictionId: submittedPrediction.id }, {
          onError: () => setOptimisticDbState(null),
        }),
        onError: () => setOptimisticDbState(null),
      });
      _externalSetStage(newStage);
      return;
    }

    // For other student-driven transitions, advance the stage
    const dbNewState = STAGE_TO_DB[newStage];
    if (dbNewState && dbNewState !== effectiveDbState) {
      setOptimisticDbState(dbNewState); // immediate UI update
      advanceStage.mutate({ progressId, newState: dbNewState }, {
        onError: () => setOptimisticDbState(null), // revert on failure
        onSuccess: () => {
          // Don't clear yet — let the query refetch sync it
        },
      });
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
    initRules: activeCase?.constraints
      ? activeCase.constraints.split(/\r?\n/).map(rule => rule.trim()).filter(Boolean)
      : [],
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
          {reviewFeedback.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
              {reviewFeedback.map(feedback => (
                <ReturnedForRevisionPanel key={feedback.id} reviewType={feedback.review_type} note={feedback.note} />
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: "1.1rem" }}>
            <CaseDossier caseData={caseData} showTransferHint={showTransferHint} />
            <StageActionPanel
              stage={stage} setStage={handleSetStage} caseData={caseData}
              prediction={prediction} setPrediction={setPrediction}
              displayPrediction={predictionForDisplay}
              reflectionText={reflectionText} setReflectionText={setReflectionText}
              laneAttempts={laneAttempts} setLaneAttempts={setLaneAttempts}
              readOnly={readOnly}
            />
          </div>
        </>
      )}
    </div>
  );
}
