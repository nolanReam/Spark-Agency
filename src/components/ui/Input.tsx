import type { ReactNode } from "react";

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea style={{
      width: "100%", padding: "0.7rem", borderRadius: "8px",
      border: "1px solid var(--border)", background: "var(--surface)",
      color: "var(--text)", fontSize: "0.85rem",
      fontFamily: "'IBM Plex Sans',sans-serif", resize: "vertical",
      boxSizing: "border-box", lineHeight: 1.5,
    }} {...props} />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input style={{
      width: "100%", padding: "0.6rem 0.8rem", borderRadius: "8px",
      border: "1px solid var(--border)", background: "var(--surface)",
      color: "var(--text)", fontSize: "0.875rem",
      fontFamily: "'IBM Plex Sans',sans-serif", boxSizing: "border-box",
    }} {...props} />
  );
}

export function Field({ label, hint, htmlFor, error, errorId, children }: {
  label: ReactNode;
  hint?: string;
  htmlFor?: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <label htmlFor={htmlFor} style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: "0.3rem" }}>
        {label}
      </label>
      {hint && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 0.4rem", lineHeight: 1.5 }}>{hint}</p>}
      {children}
      {error && <p id={errorId} style={{ fontSize: "0.75rem", color: "var(--danger)", margin: "0.35rem 0 0", lineHeight: 1.4 }}>{error}</p>}
    </div>
  );
}
