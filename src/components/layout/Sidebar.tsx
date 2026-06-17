import type { ReactNode, ElementType } from "react";
import { LogOut } from "lucide-react";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import type { UserRole } from "../../hooks/useAuth";

interface SidebarItem {
  key: string;
  label: string;
  icon: ElementType;
  subkeys?: string[];
}

export function Sidebar({
  items, view, setView, role, theme, setTheme, bottomContent, onSignOut,
}: {
  items: SidebarItem[];
  view: string;
  setView: (v: string) => void;
  role: UserRole;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  bottomContent?: ReactNode;
  onSignOut?: () => void;
}) {
  const isActive = (item: SidebarItem) =>
    view === item.key || (item.subkeys?.includes(view) ?? false);

  return (
    <aside style={{
      width: 240, minWidth: 240, minHeight: "100vh",
      borderRight: "1px solid var(--border)", background: "var(--surface)",
      display: "flex", flexDirection: "column", padding: "1.25rem 0.85rem",
      boxSizing: "border-box",
    }}>
      <div style={{ padding: "0 0.5rem", marginBottom: "1rem" }}>
        <Brand />
      </div>

      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        {items.map(item => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            style={{
              display: "flex", alignItems: "center", gap: "0.65rem",
              padding: "0.55rem 0.75rem", borderRadius: "9px",
              border: "none", cursor: "pointer",
              background: isActive(item) ? "var(--surface-2)" : "transparent",
              color: isActive(item) ? "var(--text)" : "var(--text-muted)",
              fontWeight: isActive(item) ? 600 : 400,
              fontSize: "0.85rem",
              fontFamily: "'IBM Plex Sans',sans-serif",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            <item.icon size={17} />
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: "0 0.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.35rem 0.5rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: role === "instructor" ? "var(--brand)" : role === "volunteer" ? "var(--accent)" : "var(--success)",
            }} />
            <span style={{
              fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.05em", color: "var(--text-muted)",
            }}>
              {role}
            </span>
          </div>
          {/* Theme toggle moved to floating FAB in App.tsx */}
        </div>

        {bottomContent && <div>{bottomContent}</div>}

        {onSignOut && (
          <button
            onClick={onSignOut}
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.5rem 0.5rem", borderRadius: "9px",
              border: "none", cursor: "pointer",
              background: "transparent",
              color: "var(--text-muted)", fontSize: "0.78rem",
              fontFamily: "'IBM Plex Sans',sans-serif",
            }}
          >
            <LogOut size={14} />
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}
