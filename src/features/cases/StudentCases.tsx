import { useState } from "react";
import { ChevronDown, Lock, Loader2 } from "lucide-react";
import { Badge, Card, Btn } from "../../components/ui";
import { TopBar } from "../../components/layout";
import { useAuth } from "../../hooks/useAuth";
import {
  useStudentProfile,
  useStudentProgress,
  useCaseById,
  useCases,
  useActiveSession,
} from "../../api/hooks";
// DbCase import removed

const ACTIVE_PROGRESS_STATES = new Set([
  "building",
  "awaiting_implementation_review",
  "implementation_review_claimed",
  "implementation_approved",
  "awaiting_prediction_review",
  "prediction_review_claimed",
  "prediction_approved",
  "testing_in_scratch",
  "reflection_pending",
]);

// ─── Component ──────────────────────────────────────────────────────

export function StudentCases({ onOpenCase, onStartCase, onViewCase }: {
  onOpenCase: () => void;
  onStartCase: (caseId: string) => void;
  onViewCase: (caseId: string) => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [completedOpen, setCompletedOpen] = useState<string | null>(null);

  // Data hooks
  const { data: profile } = useStudentProfile(userId);
  const { data: activeSession } = useActiveSession();
  const sessionId = activeSession?.id ?? "";
  const { data: progress, isLoading: progressLoading } = useStudentProgress(userId, sessionId || undefined);
  const { data: publishedCases, isLoading: casesLoading } = useCases("published");

  const clearanceLevel = profile?.clearance_level ?? 1;

  // Derive active case from progress
  const activeProgress = (progress ?? []).find(p => ACTIVE_PROGRESS_STATES.has(p.state));
  const activeCaseId = activeProgress?.case_id ?? "";
  const { data: activeCase } = useCaseById(activeCaseId);

  // Completed case IDs with metadata
  const completedProgress = (progress ?? []).filter(p => p.state === "completed");
  const completedCaseIds = new Set(completedProgress.map(p => p.case_id));
  const activeCaseIds = new Set((progress ?? []).filter(p => ACTIVE_PROGRESS_STATES.has(p.state)).map(p => p.case_id));

  // Available = published minus anything in progress
  const availableCases = (publishedCases ?? []).filter(c => !activeCaseIds.has(c.id) && !completedCaseIds.has(c.id));
  // Completed cases = published that are in the completed set
  const completedCases = (publishedCases ?? []).filter(c => completedCaseIds.has(c.id));

  const loading = progressLoading || casesLoading;

  return (
    <div>
      <TopBar title="Cases" subtitle="Active · Available · Completed" />

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)", gap: "0.5rem" }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading cases…
        </div>
      )}

      {!loading && (
        <>
          {activeCase && (
            <>
              <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1rem", margin: "0 0 0.75rem", color: "var(--brand)" }}>
                Active case
              </h2>
              <Card style={{ padding: "1.1rem", marginBottom: "1.5rem", border: "1px solid var(--brand)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <div>
                    <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
                      {(activeCase.concept_tags ?? []).map((c: string) => <Badge key={c}>{c}</Badge>)}
                      <Badge tone="accent">+{activeCase.reputation_reward} rep</Badge>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "0.98rem" }}>{activeCase.title}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Client: {activeCase.client_brief} · ~{activeCase.estimated_minutes} min
                    </div>
                  </div>
                  <Btn variant="primary" onClick={onOpenCase}>Open</Btn>
                </div>
              </Card>
            </>
          )}

          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1rem", margin: "0 0 0.4rem" }}>
            Available cases
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.75rem" }}>
            {activeCase ? "Finish your active case before starting another." : "Pick a case to get started."}
          </p>
          {availableCases.length === 0 ? (
            <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
              No available cases right now. Check back later.
            </Card>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem", marginBottom: "1.5rem" }}>
              {availableCases.map(c => {
                const locked = clearanceLevel < (c.min_clearance ?? 1);
                const blockedByActiveCase = !!activeCase && !locked;
                return (
                  <Card key={c.id} style={{ padding: "1.1rem", opacity: locked || blockedByActiveCase ? 0.55 : 1, position: "relative", cursor: locked || blockedByActiveCase ? "default" : "pointer" }}
                    onClick={() => { if (!locked && !blockedByActiveCase) onStartCase(c.id); }}>
                    {locked && <div style={{ position: "absolute", top: "0.75rem", right: "0.75rem" }}><Lock size={14} color="var(--text-muted)" /></div>}
                    <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                      {(c.concept_tags ?? []).map((concept: string) => <Badge key={concept}>{concept}</Badge>)}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "0.92rem", marginBottom: "0.2rem" }}>{c.title}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.55rem" }}>Client: {c.client_brief}</div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                      <Badge tone={locked ? "neutral" : "brand"}>CL-{c.min_clearance}+ required</Badge>
                      <Badge tone="accent">+{c.reputation_reward} rep</Badge>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>~{c.estimated_minutes} min</span>
                    </div>
                    {blockedByActiveCase && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.55rem" }}>Finish your active case before starting another.</div>}
                  </Card>
                );
              })}
            </div>
          )}

          <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1rem", margin: "0 0 0.75rem" }}>
            Completed cases
          </h2>
          {completedCases.length === 0 ? (
            <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
              No completed cases yet. Finish your first case to see it here.
            </Card>
          ) : (
            <Card style={{ padding: "0.5rem" }}>
              {completedCases.map((c, i) => (
                <div key={c.id}>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 0.85rem", cursor: "pointer" }}
                    onClick={() => setCompletedOpen(completedOpen === c.id ? null : c.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{c.title}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                        Client: {c.client_brief}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      {(c.concept_tags ?? []).map((concept: string) => <Badge key={concept} tone="success">{concept}</Badge>)}
                      <Badge tone="success">+{c.reputation_reward} rep</Badge>
                      <ChevronDown size={14} color="var(--text-muted)" style={{
                        transform: completedOpen === c.id ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s",
                      }} />
                    </div>
                  </div>
                  {completedOpen === c.id && (
                    <div style={{ padding: "0 0.85rem 0.85rem", fontSize: "0.82rem", color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
                      <p style={{ margin: "0.6rem 0 0" }}>This case has been completed. You can review your dossier but cannot resubmit predictions or reflections.</p>
                      <div style={{ marginTop: "0.6rem" }}><Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onViewCase(c.id); }}>View dossier (read-only)</Btn></div>
                    </div>
                  )}
                  {i < completedCases.length - 1 && <div style={{ height: 1, background: "var(--border)", margin: "0 0.85rem" }} />}
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
