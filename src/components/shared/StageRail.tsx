import { CheckCircle2 } from "lucide-react";
import { STAGES } from "../../lib/constants";
import type { StageKey } from "../../lib/constants";

function stageIndex(key: StageKey): number {
  return STAGES.findIndex(s => s.key === key) ?? 0;
}

export function StageRail({ currentKey, compact }: { currentKey: StageKey; compact?: boolean }) {
  const current = stageIndex(currentKey);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", gap: 0, paddingBottom: "0.25rem" }}>
      {STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={stage.key} style={{ display: "flex", flexDirection: "row", flex: i < STAGES.length - 1 ? 1 : 0 }}>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              minWidth: compact ? 54 : 80, gap: "0.35rem",
            }}>
              <div style={{
                width: compact ? 22 : 28, height: compact ? 22 : 28,
                borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center",
                background: done ? "var(--success)" : active ? "var(--accent)" : "var(--surface-2)",
                color: done || active ? "#fff" : "var(--text-muted)",
                fontSize: "0.68rem", fontWeight: 700, flexShrink: 0,
                border: active ? "2px solid var(--accent)" : "1px solid transparent",
                boxShadow: active ? "0 0 0 3px var(--accent-soft)" : "none",
              }}>
                {done ? <CheckCircle2 size={compact ? 12 : 15} /> : i + 1}
              </div>
              <div style={{
                fontSize: compact ? "0.6rem" : "0.65rem", textAlign: "center",
                color: active ? "var(--text)" : "var(--text-muted)",
                fontWeight: active ? 700 : 500, lineHeight: 1.25,
              }}>
                {stage.label}
              </div>
            </div>
            {i < STAGES.length - 1 && (
              <div style={{
                flex: 1, height: 2,
                background: done ? "var(--success)" : "var(--border)",
                minWidth: compact ? 8 : 12,
                marginTop: compact ? "10px" : "13px",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
