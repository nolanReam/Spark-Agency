import { Award, CheckCircle2 } from "lucide-react";
import { Card, SectionLabel } from "../../components/ui";
import { CLEARANCE_LEVELS } from "../../lib/constants";

interface ClearanceCardProps {
  clearanceLevel: number;
  predictionAccuracy: number;
  casesCompleted: number;
  conceptsAt50Count: number;
}

export function ClearanceCard({ clearanceLevel, predictionAccuracy, casesCompleted, conceptsAt50Count }: ClearanceCardProps) {
  const currentLevel = CLEARANCE_LEVELS.find(l => l.level === clearanceLevel);
  const nextLevel = CLEARANCE_LEVELS.find(l => l.level === clearanceLevel + 1);

  if (!nextLevel) {
    return (
      <Card style={{ padding: "1.25rem" }}>
        <SectionLabel icon={Award}>Clearance Level</SectionLabel>
        <div style={{ marginTop: "0.6rem", fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.1rem", fontWeight: 700 }}>
          CL-{clearanceLevel} — {currentLevel?.title}
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.4rem 0 0" }}>
          Maximum clearance level reached.
        </p>
      </Card>
    );
  }

  const reqs = [
    { label: "Cases completed", current: casesCompleted, required: nextLevel.casesRequired, met: casesCompleted >= nextLevel.casesRequired },
    { label: "Prediction accuracy", current: `${predictionAccuracy}%`, required: `${nextLevel.accuracy}%`, met: predictionAccuracy >= nextLevel.accuracy },
    { label: "Concepts at 50%+ mastery", current: conceptsAt50Count, required: nextLevel.conceptsAt50, met: conceptsAt50Count >= nextLevel.conceptsAt50 },
  ];

  return (
    <Card style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
        <div>
          <SectionLabel icon={Award}>Clearance Level</SectionLabel>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.1rem", fontWeight: 700, marginTop: "0.35rem" }}>
            CL-{clearanceLevel} — {currentLevel?.title}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.2rem" }}>Next level</div>
          <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>CL-{nextLevel.level} — {nextLevel.title}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {reqs.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ flexShrink: 0 }}>
              {r.met ? <CheckCircle2 size={15} color="var(--success)" />
                : <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid var(--border)" }} />}
            </div>
            <div style={{ flex: 1, fontSize: "0.85rem" }}>{r.label}</div>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: r.met ? "var(--success)" : "var(--text-muted)" }}>
              {r.current} / {r.required}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
