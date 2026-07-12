import { ArrowRight, Hourglass, UserCheck, CheckCircle2, ListChecks, Loader2 } from "lucide-react";
import { Badge, Card, Btn, SectionLabel } from "../../components/ui";
import { TopBar } from "../../components/layout";
import { StageRail } from "../../components/shared";
import type { StageKey } from "../../lib/constants";
import { ClearanceCard } from "./ClearanceCard";
import { MasterySummary } from "./MasterySummary";
import { useAuth } from "../../hooks/useAuth";
import {
  useStudentProfile,
  useStudentProgress,
  useStudentMastery,
  useCaseById,
  useCaseConceptWeights,
} from "../../api/hooks";

// ─── DB state → StageKey mapping ───────────────────────────────────

const DB_STATE_TO_STAGE: Record<string, StageKey> = {
  building: "building",
  implementation_review_claimed: "impl_review_claimed",
  awaiting_implementation_review: "impl_review_requested",
  implementation_approved: "impl_approved",
  prediction_review_claimed: "prediction_review_claimed",
  awaiting_prediction_review: "prediction_review_requested",
  prediction_approved: "prediction_approved",
  prediction_revision: "prediction_submitted",
  testing_in_scratch: "testing",
  reflection_pending: "reflection",
  completed: "complete",
};

// ─── Next action helper ────────────────────────────────────────────

interface NextAction {
  title: string; body: string; cta: string | null; waiting: boolean; inProgress: boolean;
}

function nextAction(dbState: string): NextAction {
  const stage = DB_STATE_TO_STAGE[dbState];
  if (!stage) {
    return { title: "Start a case", body: "Browse the Cases tab to pick your first challenge.", cta: "Browse cases", waiting: false, inProgress: false };
  }
  const map: Record<string, NextAction> = {
    building:                  { title: "Build your project in Scratch",               body: "Follow the dossier and Initialization Rules. Raise your hand or request a review when ready.", cta: "Open case", waiting: false, inProgress: false },
    impl_review_requested:     { title: "Waiting for Implementation Review",            body: "You're in the queue. Keep Scratch open — a volunteer will come check your project.", cta: null, waiting: true, inProgress: false },
    impl_review_claimed:       { title: "A volunteer is on their way",                  body: "A volunteer has claimed your review and is heading over to check your project now.", cta: null, waiting: false, inProgress: true },
    impl_approved:             { title: "Implementation approved — write your prediction", body: "Your build is confirmed. Now predict what will happen before you test.", cta: "Open case", waiting: false, inProgress: false },
    prediction_submitted:      { title: "Write your prediction",                        body: "Use the Predict & Prove form — both fields required before submitting.", cta: "Open case", waiting: false, inProgress: false },
    prediction_review_requested: { title: "Waiting for Prediction Review",              body: "Your prediction is locked. A volunteer will read it with you before you can test.", cta: null, waiting: true, inProgress: false },
    prediction_review_claimed:  { title: "A volunteer is reviewing your prediction",    body: "A volunteer has claimed your prediction review and is on their way.", cta: null, waiting: false, inProgress: true },
    prediction_approved:       { title: "Cleared to test in Scratch",                   body: "Your reasoning was approved. Go run your Scratch project and see what happens.", cta: "Open case", waiting: false, inProgress: false },
    testing:                   { title: "Test your project",                            body: "Run your Scratch project and compare the result to your prediction.", cta: "Open case", waiting: false, inProgress: false },
    reflection:                { title: "Write your reflection",                        body: "What actually happened? How did it compare to your prediction?", cta: "Open case", waiting: false, inProgress: false },
    complete:                  { title: "Case complete!",                                body: "Great work. Pick a new case from the Cases tab to keep going.", cta: "Browse cases", waiting: false, inProgress: false },
  };
  return map[stage] ?? map.building;
}

// ─── Component ──────────────────────────────────────────────────────

export function StudentHome({ sessionId, caseStage: _caseStage, onOpenCase, onGoToCases }: {
  sessionId: string; caseStage: StageKey; onOpenCase: () => void; onGoToCases: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  // Data hooks
  const { data: profile, isLoading: profileLoading } = useStudentProfile(userId);
  const { data: progress, isLoading: progressLoading } = useStudentProgress(userId, sessionId);
  const { data: mastery, isLoading: masteryLoading } = useStudentMastery(userId);

  // Derive active case from progress
  const activeProgress = (progress ?? []).find(p => p.state !== "completed" && p.state !== "not_started");
  const activeCaseId = activeProgress?.case_id ?? "";
  const dbState = activeProgress?.state ?? "building";

  // Fetch active case details
  const { data: activeCase, isLoading: caseLoading } = useCaseById(activeCaseId);
  const { data: conceptWeights } = useCaseConceptWeights(activeCaseId);

  // Map mastery for components
  const masteryItems = (mastery ?? []).map(m => ({
    concept: m.concept,
    mastery_pct: m.mastery_pct,
  }));

  // Derived stats
  const displayName = (profile as any)?.display_name ?? user?.user_metadata?.display_name ?? "Student";
  const clearanceLevel = profile?.clearance_level ?? 1;
  const reputation = profile?.reputation_points ?? 0;
  const predictionAccuracy = Math.round(profile?.prediction_accuracy ?? 0);
  const casesCompleted = (progress ?? []).filter(p => p.state === "completed").length;
  const conceptsAt50 = masteryItems.filter(m => m.mastery_pct >= 50).length;

  // Concept weights as record
  const conceptWeightRecord: Record<string, number> = {};
  (conceptWeights ?? []).forEach(cw => { conceptWeightRecord[cw.concept] = cw.points; });

  // Stage rail current key
  const stageKey = DB_STATE_TO_STAGE[dbState] ?? "building";
  const action = nextAction(dbState);
  const tone = action.inProgress ? "var(--brand)" : action.waiting ? "var(--accent)" : "var(--brand)";
  const bg = action.inProgress ? "var(--brand-soft)" : action.waiting ? "var(--accent-soft)" : "var(--brand-soft)";

  const loading = profileLoading || progressLoading || masteryLoading || caseLoading;

  // ── No active case state ──
  if (!loading && !activeCase) {
    return (
      <div>
        <TopBar
          title={`Welcome back, ${displayName}`}
          subtitle="Pick a case to get started"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Badge tone="brand">{reputation.toLocaleString()} rep</Badge>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: "var(--brand)",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: "0.85rem",
              }}>{displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase()}</div>
            </div>
          }
        />
        <Card style={{ padding: "2rem", textAlign: "center" }}>
          <p style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text-muted)" }}>
            You don't have an active case yet. Browse available cases to get started.
          </p>
          <Btn variant="accent" onClick={onGoToCases}>Browse cases</Btn>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title={`Welcome back, ${displayName}`}
        subtitle="Here's what to do next"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Badge tone="brand">{reputation.toLocaleString()} rep</Badge>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", background: "var(--brand)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: "0.85rem",
            }}>{displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase()}</div>
          </div>
        }
      />
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)", gap: "0.5rem" }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading…
        </div>
      )}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "1.25rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Current case banner */}
            <Card style={{ padding: "1.1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
                    {(activeCase?.concept_tags ?? []).map((c: string) => <Badge key={c}>{c}</Badge>)}
                    <Badge tone="brand">L{(activeCase?.min_clearance ?? 1)}+</Badge>
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.1rem", fontWeight: 700 }}>
                    {activeCase?.title ?? "Untitled case"}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                    Client: {activeCase?.client_brief ?? "—"}
                  </div>
                </div>
                <Btn variant="ghost" size="sm" onClick={onOpenCase}>Open</Btn>
              </div>
            </Card>

            {/* Stage rail */}
            <Card style={{ padding: "1rem 1.25rem" }}>
              <SectionLabel icon={ListChecks}>Case progress</SectionLabel>
              <div style={{ marginTop: "0.85rem" }}>
                <StageRail currentKey={stageKey} compact />
              </div>
            </Card>

            {/* Next action */}
            <Card style={{ padding: "1.25rem", border: `1px solid ${tone}`, background: bg }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                {action.inProgress ? <UserCheck size={16} color={tone} />
                  : action.waiting ? <Hourglass size={16} color={tone} />
                  : <ArrowRight size={16} color={tone} />}
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: tone }}>
                  {action.inProgress ? "Volunteer on the way" : action.waiting ? "Waiting for review" : "Next action"}
                </span>
              </div>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                {action.title}
              </div>
              <p style={{ fontSize: "0.87rem", lineHeight: 1.6, margin: "0 0 0.85rem" }}>{action.body}</p>
              {action.cta && (
                <Btn variant={action.cta === "Browse cases" ? "subtle" : "accent"}
                     onClick={action.cta === "Browse cases" ? onGoToCases : onOpenCase}>
                  {action.cta}
                </Btn>
              )}
            </Card>

            {/* Recent feedback */}
            <div>
              <SectionLabel muted icon={CheckCircle2}>Recent feedback</SectionLabel>
              <Card style={{ padding: "0.9rem", marginTop: "0.5rem" }}>
                <div style={{ fontSize: "0.84rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  Feedback from completed cases will appear here.
                </div>
              </Card>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <ClearanceCard
              clearanceLevel={clearanceLevel}
              predictionAccuracy={predictionAccuracy}
              casesCompleted={casesCompleted}
              conceptsAt50Count={conceptsAt50}
            />
            <MasterySummary mastery={masteryItems} conceptWeights={conceptWeightRecord} />
          </div>
        </div>
      )}
    </div>
  );
}
