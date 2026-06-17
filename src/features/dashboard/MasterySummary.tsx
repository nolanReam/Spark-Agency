import { GraduationCap } from "lucide-react";
import { Card, SectionLabel, ThickBar } from "../../components/ui";

interface MasteryItem {
  concept: string;
  mastery_pct: number;
}

export function MasterySummary({ mastery, conceptWeights }: {
  mastery: MasteryItem[];
  conceptWeights?: Record<string, number>;
}) {
  if (mastery.length === 0) {
    return (
      <Card style={{ padding: "1.1rem" }}>
        <SectionLabel icon={GraduationCap}>Concept mastery</SectionLabel>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
          No mastery data yet. Complete cases to build mastery.
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ padding: "1.1rem" }}>
      <SectionLabel icon={GraduationCap}>Concept mastery</SectionLabel>
      <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {mastery.map(m => {
          const bonus = conceptWeights?.[m.concept] ?? 0;
          return (
            <div key={m.concept}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{m.concept}</span>
                <span style={{ fontSize: "0.82rem" }}>
                  <strong style={{ fontFamily: "'Space Grotesk',sans-serif" }}>{Math.round(m.mastery_pct)}%</strong>
                  <span style={{ color: "var(--text-muted)" }}> mastery</span>
                  {bonus > 0 && <span style={{ color: "var(--accent)", marginLeft: "0.5rem", fontWeight: 700 }}>+{bonus} from this case</span>}
                </span>
              </div>
              <ThickBar value={m.mastery_pct} color={m.mastery_pct >= 50 ? "var(--brand)" : "var(--brand-2)"} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
