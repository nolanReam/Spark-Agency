import { useState } from "react";
import { LayoutDashboard, FileText, GraduationCap, Users } from "lucide-react";
import { Sidebar } from "../../components/layout";
import { Card, Btn } from "../../components/ui";
import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../hooks/useAuth";
import { useStudentProfile, useActiveSession, useRaiseHand, useStudentProgress, useCreateCaseProgress } from "../../api/hooks";
import { StudentHome } from "./StudentHome";
import { StudentCases } from "../cases/StudentCases";
import { StudentProgress } from "../cases/StudentProgress";
import { CaseWorkflow } from "../cases/CaseWorkflow";
import type { StageKey } from "../../lib/constants";
import { CLEARANCE_LEVELS } from "../../lib/constants";

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

export function StudentShell({ role, theme, setTheme, onSignOut }: {
  role: UserRole; theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void; onSignOut?: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [view, setView] = useState("home");
  const [caseStage, setCaseStage] = useState<StageKey>("impl_review_requested");
  const [handRaised, setHandRaised] = useState(false);
  const [handError, setHandError] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // For viewing a specific case (read-only or starting new)
  const [workflowCaseId, setWorkflowCaseId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  // Live data for sidebar
  const { data: profile } = useStudentProfile(userId);
  const { data: activeSession } = useActiveSession();
  const { data: progress } = useStudentProgress(userId, activeSession?.id);
  const raiseHand = useRaiseHand();
  const createCaseProgress = useCreateCaseProgress();

  const clearanceLevel = profile?.clearance_level ?? 1;
  const clearanceTitle = CLEARANCE_LEVELS.find(l => l.level === clearanceLevel)?.title ?? "Developer";
  const sessionTitle = activeSession?.session_code ?? "No active session";
  const sessionStatus = activeSession?.status ?? "unknown";

  // Derive active case from progress for Raise Hand
  const activeProgress = (progress ?? []).find(p => ACTIVE_PROGRESS_STATES.has(p.state));
  const activeCaseId = activeProgress?.case_id ?? "";

  const handleRaiseHand = () => {
    setHandError(false);
    if (handRaised) {
      setHandRaised(false);
      return;
    }
    if (!activeCaseId) {
      setHandError(true);
      setTimeout(() => setHandError(false), 2000);
      return;
    }
    setHandRaised(true);
    raiseHand.mutate({ studentId: userId, caseId: activeCaseId }, {
      onError: (err: Error) => {
        console.error("Raise hand failed:", err.message);
        setTimeout(() => setHandRaised(false), 1200);
      },
    });
  };

  const handleStartCase = (caseId: string) => {
    setStartError(null);
    if (!activeSession?.id) {
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
      { studentId: userId, caseId, sessionId: activeSession.id },
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
          <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.6rem", fontWeight: 700 }}>{clearanceLevel}</span>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>— {clearanceTitle}</span>
        </div>
      </Card>
      {handError ? (
        <Btn variant="danger" size="md" disabled style={{ width: "100%" }}>Could not raise hand</Btn>
      ) : !activeCaseId ? (
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center", padding: "0.6rem", background: "var(--surface-2)", borderRadius: "9px" }}>Open a case to raise hand</div>
      ) : (
        <Btn
          variant={handRaised ? "success" : "accent"}
          size="md"
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
        {view === "home" && <StudentHome caseStage={caseStage} onOpenCase={() => { setReadOnly(false); setWorkflowCaseId(null); setView("case-detail"); }} onGoToCases={() => setView("cases")} />}
        {view === "cases" && (
          <>
            {startError && (
              <Card style={{ padding: "0.75rem 1rem", marginBottom: "1rem", border: "1px solid var(--danger)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{startError}</span>
                <Btn variant="ghost" size="sm" onClick={() => setStartError(null)}>Dismiss</Btn>
              </Card>
            )}
            <StudentCases onOpenCase={() => { setReadOnly(false); setWorkflowCaseId(null); setView("case-detail"); }} onStartCase={handleStartCase} onViewCase={handleViewCase} />
          </>
        )}
        {view === "case-detail" && <CaseWorkflow stage={caseStage} setStage={setCaseStage} caseId={workflowCaseId ?? undefined} readOnly={readOnly} onBack={() => { setView("home"); setWorkflowCaseId(null); setReadOnly(false); setStartError(null); }} />}
        {view === "progress" && <StudentProgress />}
      </main>
    </>
  );
}
