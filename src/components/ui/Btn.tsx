import type { ButtonHTMLAttributes, ElementType } from "react";

type Variant = "primary" | "accent" | "ghost" | "subtle" | "success" | "danger";
type Size = "sm" | "md";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ElementType;
  size?: Size;
}

const sizeStyles: Record<Size, { fontSize: string; padding: string }> = {
  sm: { fontSize: "0.78rem", padding: "0.35rem 0.7rem" },
  md: { fontSize: "0.875rem", padding: "0.6rem 1.1rem" },
};

const variantStyles: Record<Variant, { background: string; color: string; border?: string }> = {
  primary: { background: "var(--brand)", color: "#fff" },
  accent:  { background: "var(--accent)", color: "#fff" },
  ghost:   { background: "transparent", color: "var(--text)", border: "1px solid var(--border)" },
  subtle:  { background: "var(--surface-2)", color: "var(--text)" },
  success: { background: "var(--success)", color: "#fff" },
  danger:  { background: "var(--danger)", color: "#fff" },
};

export function Btn({ children, variant = "primary", icon: Icon, size = "md", className, ...props }: BtnProps) {
  const vs = variantStyles[variant];
  const ss = sizeStyles[size];
  return (
    <button className={`btn-core ${className ?? ""}`} style={{
      display: "inline-flex", alignItems: "center", gap: "0.45rem",
      fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 600,
      borderRadius: "9px", border: vs.border ?? "1px solid transparent",
      whiteSpace: "nowrap", ...ss, background: vs.background, color: vs.color,
    }} {...props}>
      {Icon && <Icon size={size === "sm" ? 13 : 16} />}
      {children}
    </button>
  );
}
