import { type ReactNode } from "react";

type Tone = "neutral" | "accent" | "success" | "danger" | "brand" | "warning";

const toneStyles: Record<Tone, { background: string; color: string }> = {
  neutral:  { background: "var(--surface-2)", color: "var(--text-muted)" },
  accent:   { background: "var(--accent-soft)", color: "var(--accent)" },
  success:  { background: "var(--success-soft)", color: "var(--success)" },
  danger:   { background: "var(--danger-soft)", color: "var(--danger)" },
  brand:    { background: "var(--brand-soft)", color: "var(--brand)" },
  warning:  { background: "var(--warning-soft)", color: "var(--warning)" },
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span style={{
      ...toneStyles[tone],
      fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.02em",
      padding: "0.2rem 0.55rem", borderRadius: "999px",
      textTransform: "uppercase", whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
