import { Sun, Moon } from "lucide-react";

/**
 * Inline toggle used in Sidebar — compact icon + label row.
 * (The floating FAB is rendered by App.tsx.)
 */
export function ThemeToggle({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void }) {
  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      style={{
        display: "flex", alignItems: "center", gap: "0.4rem",
        padding: "0.35rem", borderRadius: "8px", border: "none",
        background: "transparent", color: "var(--text-muted)", cursor: "pointer",
        fontSize: "0.8rem", fontFamily: "'IBM Plex Sans',sans-serif",
      }}
    >
      {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}

/** Circular floating action button — fixed bottom-right, visible on all screens */
export function FloatingThemeToggle({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void }) {
  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      style={{
        position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 1000,
        width: 48, height: 48, borderRadius: "50%",
        border: "1px solid var(--border)", background: "var(--surface)",
        color: "var(--text)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
    >
      {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
}
