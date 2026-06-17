import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function TopBar({ title, subtitle, right, onBack }: {
  title: string; subtitle?: string; right?: ReactNode; onBack?: () => void;
}) {
  return (
    <div style={{ marginBottom: "1.75rem" }}>
      {onBack && (
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", gap: "0.4rem",
          background: "none", border: "none", color: "var(--text-muted)",
          fontSize: "0.85rem", cursor: "pointer", marginBottom: "0.75rem", padding: 0,
          fontFamily: "'IBM Plex Sans',sans-serif",
        }}>
          <ArrowLeft size={15} />Back
        </button>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.5rem",
            fontWeight: 700, margin: 0, letterSpacing: "-0.01em",
          }}>{title}</h1>
          {subtitle && <p style={{ margin: "0.2rem 0 0", color: "var(--text-muted)", fontSize: "0.875rem" }}>{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}
