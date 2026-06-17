import type { CSSProperties, ReactNode, ButtonHTMLAttributes } from "react";

export function Card({ children, style, ...props }: { children: ReactNode; style?: CSSProperties } & ButtonHTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "14px", ...style,
    }} {...props}>
      {children}
    </div>
  );
}
