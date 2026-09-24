import { GraduationCap, Loader2 } from "lucide-react";
import { Card, SectionLabel, ThickBar } from "../../components/ui";
import { TopBar } from "../../components/layout";
import { ClearanceCard } from "../dashboard/ClearanceCard";
import { useAuth } from "../../hooks/useAuth";
import { useStudentProfile, useStudentMastery, useStudentProgress } from "../../api/hooks";

export function StudentProgress() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const { data: profile, isLoading: profileLoading } = useStudentProfile(userId);
  const { data: mastery, isLoading: masteryLoading } = useStudentMastery(userId);
  const { data: progress } = useStudentProgress(userId);

  const isLoading = profileLoading || masteryLoading;

  const clearanceLevel = profile?.clearance_level ?? 0;
  const predictionAccuracy = Math.round(profile?.prediction_accuracy ?? 0);
  const casesCompleted = (progress ?? []).filter(p => p.state === "completed").length;
  const conceptsAt50 = (mastery ?? []).filter(m => m.mastery_pct >= 50).length;

  if (isLoading) {
    return (
      <div>
        <TopBar title="My Progress" subtitle="Clearance level and concept mastery" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)", gap: "0.5rem" }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading progress…
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="My Progress" subtitle="Clearance level and concept mastery" />
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 640 }}>
        <ClearanceCard
          clearanceLevel={clearanceLevel}
          predictionAccuracy={predictionAccuracy}
          casesCompleted={casesCompleted}
          conceptsAt50Count={conceptsAt50}
        />
        <Card style={{ padding: "1.25rem" }}>
          <SectionLabel icon={GraduationCap}>Concept mastery</SectionLabel>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.35rem 0 1rem", lineHeight: 1.55 }}>
            Mastery is earned by completing cases. Each case shows exactly how many mastery points it contributes to each concept before you start.
          </p>
          {(mastery ?? []).length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No mastery data yet. Complete cases to build mastery.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {mastery!.map(m => (
                <div key={m.concept}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{m.concept}</span>
                    <span style={{ fontSize: "0.83rem" }}>
                      <strong style={{ fontFamily: "'Space Grotesk',sans-serif" }}>{Math.round(m.mastery_pct)}%</strong>
                      <span style={{ color: "var(--text-muted)" }}> mastery</span>
                    </span>
                  </div>
                  <ThickBar value={m.mastery_pct} color={m.mastery_pct >= 50 ? "var(--brand)" : "var(--brand-2)"} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
