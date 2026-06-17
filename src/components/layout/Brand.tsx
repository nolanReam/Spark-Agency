import { Sparkles } from "lucide-react";

export function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0 0.25rem" }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, background: "var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Sparkles size={16} color="#fff" />
      </div>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
        fontSize: "1.05rem", letterSpacing: "-0.01em",
      }}>
        Spark Agency
      </div>
    </div>
  );
}
