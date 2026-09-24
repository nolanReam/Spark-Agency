import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LayoutDashboard, FileText, GraduationCap, Users, Loader2 } from "lucide-react";
import { Sidebar } from "../../components/layout";
import { Card, Btn, Input } from "../../components/ui";
import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../hooks/useAuth";
import { useStudentProfile, useJoinedLiveSession, useJoinSession, useRaiseHand, useActiveRaiseHand, useLowerHand, useStudentProgress, useCreateCaseProgress, useStudentReviewFeedback } from "../../api/hooks";
import { StudentHome } from "./StudentHome";
import { StudentCases } from "../cases/StudentCases";
import { StudentProgress } from "../cases/StudentProgress";
import { CaseWorkflow } from "../cases/CaseWorkflow";
import type { StageKey } from "../../lib/constants";
import { getClearanceTitle } from "../../lib/constants";

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

function joinErrorMessage(error: Error): string {
  const message = error.message.toLowerCase();
  if (message.includes("session code not found")) return "We couldn't find that session code.";
  if (message.includes("session is not open")) return "That session is no longer open.";
  if (message.includes("already joined to live session")) return "You're already joined to another live session.";
  if (message.includes("only students and volunteers")) return "This account cannot join a student session.";
  return "Could not join the session. Please check the code and try again.";
}

function StudentJoinSession() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const joinSession = useJoinSession();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setError("Enter a session code.");
      return;
    }

    setError(null);
    joinSession.mutate({ code: normalizedCode }, {
      onError: (joinError: Error) => setError(joinErrorMessage(joinError)),
    });
  };

  return (
    <main style={{ flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <Card style={{ width: "100%", maxWidth: 420, padding: "2rem" }}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Join a session</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 1.25rem" }}>Enter the session code provided by your instructor.</p>
        <form onSubmit={handleSubmit}>
          <Input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="Enter session code" aria-label="Session code" autoCapitalize="characters" autoComplete="off" disabled={joinSession.isPending} />
          {error && <div style={{ color: "var(--danger)", background: "var(--danger-soft)", border: "1px solid var(--danger)", borderRadius: "8px", padding: "0.65rem 0.75rem", fontSize: "0.82rem", marginTop: "0.75rem" }}>{error}</div>}
          <Btn type="submit" disabled={joinSession.isPending} style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}>
            {joinSession.isPending ? "Joining…" : "Join session"}
          </Btn>
        </form>
      </Card>
    </main>
  );
}

export function StudentShell({ role, theme, setTheme, onSignOut }: {
  role: UserRole; theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void; onSignOut?: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [view, setView] = useState("home");
  const [caseStage, setCaseStage] = useState<StageKey>("impl_review_requested");
  const [handError, setHandError] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // For viewing a specific case (read-only or starting new)
  const [workflowCaseId, setWorkflowCaseId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  // Live data for sidebar
  const profileQuery = useStudentProfile(userId);
  const profile = profileQuery.data;
  const joinedSessionQuery = useJoinedLiveSession(userId);
  const joinedSession = joinedSessionQuery.data;
  const { data: progress } = useStudentProgress(userId, joinedSession?.id, !!joinedSession?.id);
  const raiseHand = useRaiseHand();
  const lowerHand = useLowerHand();
  const createCaseProgress = useCreateCaseProgress();

  const clearanceLevel = profile?.clearance_level;
  const clearanceTitle = profileQuery.isLoading
    ? "Loading…"
    : profileQuery.isError || clearanceLevel === undefined
      ? "Unavailable"
      : getClearanceTitle(clearanceLevel) ?? "Unavailable";
  const sessionTitle = joinedSession?.session_code ?? "No active session";
  const sessionStatus = joinedSession?.status ?? "unknown";

  // Derive active case from progress for Raise Hand
  const activeProgress = (progress ?? []).find(p => ACTIVE_PROGRESS_STATES.has(p.state));
  const activeProgressId = activeProgress?.id ?? "";
  const { data: activeRaiseHand } = useActiveRaiseHand(activeProgressId);
  const { data: reviewFeedback = [] } = useStudentReviewFeedback(activeProgressId);
  const handRaised = !!activeRaiseHand;
  const handPending = raiseHand.isPending || lowerHand.isPending;

  useEffect(() => {
    if (!joinedSession?.id) return;
    setView("home");
    setWorkflowCaseId(null);
    setReadOnly(false);
    setStartError(null);
  }, [joinedSession?.id]);

  if (!userId || joinedSessionQuery.isLoading) {
    return <main style={{ flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", color: "var(--text-muted)" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading session…</main>;
  }

  if (joinedSessionQuery.isError) {
    return (
      <main style={{ flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <Card style={{ maxWidth: 420, padding: "2rem", textAlign: "center" }}>
          <div style={{ color: "var(--danger)", marginBottom: "1rem" }}>Could not load your joined session.</div>
          <Btn variant="ghost" onClick={() => joinedSessionQuery.refetch()}>Try again</Btn>
        </Card>
      </main>
    );
  }

  if (!joinedSession) return <StudentJoinSession />;

  const handleRaiseHand = () => {
    setHandError(false);
    if (!activeProgressId) {
      setHandError(true);
      setTimeout(() => setHandError(false), 2000);
      return;
    }

    if (handRaised) {
      lowerHand.mutate({ progressId: activeProgressId }, {
        onError: (err: Error) => {
          console.error("Lower hand failed:", err.message);
          setHandError(true);
          setTimeout(() => setHandError(false), 1200);
        },
      });
      return;
    }

    raiseHand.mutate({ progressId: activeProgressId }, {
      onError: (err: Error) => {
        console.error("Raise hand failed:", err.message);
        setHandError(true);
        setTimeout(() => setHandError(false), 1200);
      },
    });
  };

  const handleStartCase = (caseId: string) => {
    setStartError(null);
    if (!joinedSession.id) {
      setStartError("No active session — join a session first.");
      return;
    }
    if (activeProgress) {
      setStartError("Finish your active case before starting another.");
      return;
    }
    setReadOnly(false);
    setWorkflowCaseId(caseId); // pass caseId so CaseWorkflow can fetch it directly
    createCaseProgress.mutate(
      { studentId: userId, caseId, sessionId: joinedSession.id },
      {
        onSuccess: () => setView("case-detail"),
        onError: (err: Error) => {
          setStartError(`Could not start case: ${err.message}`);
          setWorkflowCaseId(null);
        },
      }
    );
  };

  const handleViewCase = (caseId: string) => {
    setReadOnly(true);
    setWorkflowCaseId(caseId);
    setView("case-detail");
  };

  const navItems = [
    { key: "home", label: "Home", icon: LayoutDashboard },
    { key: "cases", label: "Cases", icon: FileText },
    { key: "progress", label: "Progress", icon: GraduationCap },
  ];

  const bottomContent = (
    <>
      <Card style={{ padding: "0.85rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
          <Users size={13} color={sessionStatus === "active" ? "var(--success)" : "var(--text-muted)"} />
          <span style={{ fontSize: "0.7rem", fontWeight: 700, color: sessionStatus === "active" ? "var(--success)" : "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Session</span>
        </div>
        <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{sessionTitle}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>Status: {sessionStatus}</div>
      </Card>
      <Card style={{ padding: "0.85rem" }}>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Clearance Level</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.6rem", fontWeight: 700 }}>{clearanceLevel ?? "—"}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>— {clearanceTitle}</span>
        </div>
      </Card>
      {handError ? (
        <Btn variant="danger" size="md" disabled style={{ width: "100%" }}>Could not raise hand</Btn>
      ) : !activeProgressId ? (
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center", padding: "0.6rem", background: "var(--surface-2)", borderRadius: "9px" }}>Open a case to raise hand</div>
      ) : (
        <Btn
          variant={handRaised ? "success" : "accent"}
          size="md"
          disabled={handPending}
          onClick={handleRaiseHand}
          style={{ width: "100%" }}
        >
          {handRaised ? "Hand Raised" : "Raise hand for help"}
        </Btn>
      )}
    </>
  );

  return (
    <>
      <Sidebar items={navItems} view={view} setView={setView} role={role} theme={theme} setTheme={setTheme} bottomContent={bottomContent} onSignOut={onSignOut} />
      <main style={{ flex: 1, padding: "1.75rem 2.25rem", overflow: "auto" }}>
        {view === "home" && <StudentHome sessionId={joinedSession.id} caseStage={caseStage} reviewFeedback={reviewFeedback} onOpenCase={() => { setReadOnly(false); setWorkflowCaseId(null); setView("case-detail"); }} onGoToCases={() => setView("cases")} />}
        {view === "cases" && (
          <>
            {startError && (
              <Card style={{ padding: "0.75rem 1rem", marginBottom: "1rem", border: "1px solid var(--danger)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{startError}</span>
                <Btn variant="ghost" size="sm" onClick={() => setStartError(null)}>Dismiss</Btn>
              </Card>
            )}
            <StudentCases sessionId={joinedSession.id} onOpenCase={() => { setReadOnly(false); setWorkflowCaseId(null); setView("case-detail"); }} onStartCase={handleStartCase} onViewCase={handleViewCase} />
          </>
        )}
        {view === "case-detail" && <CaseWorkflow sessionId={joinedSession.id} stage={caseStage} setStage={setCaseStage} caseId={workflowCaseId ?? undefined} readOnly={readOnly} reviewFeedback={readOnly ? [] : reviewFeedback} onBack={() => { setView("home"); setWorkflowCaseId(null); setReadOnly(false); setStartError(null); }} />}
        {view === "progress" && <StudentProgress />}
      </main>
    </>
  );
}
