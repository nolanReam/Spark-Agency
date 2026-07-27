import { Sparkles } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role={compact ? "img" : undefined}
      aria-label={compact ? "Spark Agency" : undefined}
      title={compact ? "Spark Agency" : undefined}
      style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: compact ? 0 : "0 0.25rem" }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 8, background: "var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Sparkles size={16} color="#fff" aria-hidden="true" />
      </div>
      {!compact && (
        <div style={{
          fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
          fontSize: "1.05rem", letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
        }}>
          Spark Agency
        </div>
      )}
    </div>
  );
}
