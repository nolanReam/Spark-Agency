import { useState } from "react";
import { LayoutDashboard, FileText, GraduationCap, Hand, Users } from "lucide-react";
import { Sidebar } from "../../components/layout";
import { Card, Btn } from "../../components/ui";
import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../hooks/useAuth";
import { useStudentProfile, useActiveSession, useRaiseHand, useStudentProgress } from "../../api/hooks";
import { StudentHome } from "./StudentHome";
import { StudentCases } from "../cases/StudentCases";
import { StudentProgress } from "../cases/StudentProgress";
import { CaseWorkflow } from "../cases/CaseWorkflow";
import type { StageKey } from "../../lib/constants";
import { CLEARANCE_LEVELS } from "../../lib/constants";

export function StudentShell({ role, theme, setTheme, onSignOut }: {
  role: UserRole; theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void; onSignOut?: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [view, setView] = useState("home");
  const [caseStage, setCaseStage] = useState<StageKey>("impl_review_requested");
  const [handRaised, setHandRaised] = useState(false);

  // Live data for sidebar
  const { data: profile } = useStudentProfile(userId);
  const { data: activeSession } = useActiveSession();
  const { data: progress } = useStudentProgress(userId, activeSession?.id);
  const raiseHand = useRaiseHand();

  const clearanceLevel = profile?.clearance_level ?? 1;
  const clearanceTitle = CLEARANCE_LEVELS.find(l => l.level === clearanceLevel)?.title ?? "Developer";
  const sessionTitle = activeSession?.session_code ?? "No active session";
  const sessionStatus = activeSession?.status ?? "unknown";

  // Derive active case from progress for Raise Hand
  const activeProgress = (progress ?? []).find(p => p.state !== "completed" && p.state !== "not_started");
  const activeCaseId = activeProgress?.case_id ?? "";

  const handleRaiseHand = () => {
    if (handRaised) {
      setHandRaised(false);
      return;
    }
    if (!activeCaseId) return; // can't raise hand without an active case
    setHandRaised(true);
    raiseHand.mutate({ studentId: userId, caseId: activeCaseId }, {
      onError: () => setHandRaised(false), // revert on failure
    });
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
      <Btn
        variant={handRaised ? "subtle" : "accent"}
        icon={Hand}
        size="md"
        onClick={handleRaiseHand}
        style={{ width: "100%" }}
      >
        {handRaised ? "Hand raised — waiting" : "Raise hand for help"}
      </Btn>
    </>
  );

  return (
    <>
      <Sidebar items={navItems} view={view} setView={setView} role={role} theme={theme} setTheme={setTheme} bottomContent={bottomContent} onSignOut={onSignOut} />
      <main style={{ flex: 1, padding: "1.75rem 2.25rem", overflow: "auto" }}>
        {view === "home" && <StudentHome caseStage={caseStage} onOpenCase={() => setView("case-detail")} onGoToCases={() => setView("cases")} />}
        {view === "cases" && <StudentCases onOpenCase={() => setView("case-detail")} />}
        {view === "case-detail" && <CaseWorkflow stage={caseStage} setStage={setCaseStage} onBack={() => setView("home")} />}
        {view === "progress" && <StudentProgress />}
      </main>
    </>
  );
}
