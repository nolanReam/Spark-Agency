import type { ReactNode, ElementType } from "react";

export function SectionLabel({ children, muted, icon: Icon }: { children: ReactNode; muted?: boolean; icon?: ElementType }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.4rem",
      fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.06em", color: muted ? "var(--text-muted)" : "var(--brand)",
    }}>
      {Icon && <Icon size={13} />}
      {children}
    </div>
  );
}
