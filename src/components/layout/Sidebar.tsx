import { useState, type ReactNode, type ElementType } from "react";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Brand } from "./Brand";
// ThemeToggle import removed because it is unused
import type { UserRole } from "../../hooks/useAuth";

interface SidebarItem {
  key: string;
  label: string;
  icon: ElementType;
  subkeys?: string[];
}

export function Sidebar({
  items, view, setView, role, theme: _theme, setTheme: _setTheme, bottomContent, onSignOut,
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isActive = (item: SidebarItem) =>
    view === item.key || (item.subkeys?.includes(view) ?? false);
  const sidebarWidth = isCollapsed ? 68 : 240;

  return (
    <aside style={{
      width: sidebarWidth, minWidth: sidebarWidth,
      height: "100vh", maxHeight: "100dvh",
      position: "sticky", top: 0, alignSelf: "flex-start", flexShrink: 0,
      borderRight: "1px solid var(--border)", background: "var(--surface)",
      display: "flex", flexDirection: "column", padding: "1.25rem 0.85rem 0.85rem",
      boxSizing: "border-box", overflow: "hidden",
      transition: "width 0.2s ease, min-width 0.2s ease",
    }}>
      <div style={{
        display: "flex", flexDirection: isCollapsed ? "column" : "row",
        alignItems: "center", justifyContent: "space-between", gap: "0.5rem",
        padding: isCollapsed ? 0 : "0 0.25rem", marginBottom: "1rem", flexShrink: 0,
      }}>
        <Brand compact={isCollapsed} />
        <button
          type="button"
          className="btn-core"
          onClick={() => setIsCollapsed(collapsed => !collapsed)}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            width: 30, height: 30, borderRadius: 8, border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", color: "var(--text-muted)", flexShrink: 0,
          }}
        >
          {isCollapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
        </button>
      </div>

      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <nav aria-label="Primary navigation" style={{ display: "flex", flexDirection: "column", gap: "0.15rem", flexShrink: 0 }}>
          {items.map(item => {
            const active = isActive(item);
            return (
              <button
                key={item.key}
                type="button"
                className="btn-core"
                onClick={() => setView(item.key)}
                aria-label={isCollapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                title={isCollapsed ? item.label : undefined}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                  gap: isCollapsed ? 0 : "0.65rem",
                  padding: isCollapsed ? "0.55rem" : "0.55rem 0.75rem", borderRadius: "9px",
                  border: "none", cursor: "pointer",
                  background: active ? "var(--surface-2)" : "transparent",
                  color: active ? "var(--text)" : "var(--text-muted)",
                  fontWeight: active ? 600 : 400,
                  fontSize: "0.85rem",
                  fontFamily: "'IBM Plex Sans',sans-serif",
                  transition: "background 0.15s, color 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                <item.icon size={17} aria-hidden="true" />
                {!isCollapsed && item.label}
              </button>
            );
          })}
        </nav>

        <div style={{
          marginTop: "auto", padding: isCollapsed ? "0.75rem 0 0" : "0.75rem 0.25rem 0",
          display: "flex", flexDirection: "column", gap: "0.5rem",
        }}>
          <div
            role={isCollapsed ? "img" : undefined}
            aria-label={isCollapsed ? `${role} role` : undefined}
            title={isCollapsed ? `${role} role` : undefined}
            style={{
              display: "flex", alignItems: "center",
              justifyContent: isCollapsed ? "center" : "space-between",
              padding: "0.35rem 0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: role === "instructor" ? "var(--brand)" : role === "volunteer" ? "var(--accent)" : "var(--success)",
              }} />
              {!isCollapsed && (
                <span style={{
                  fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.05em", color: "var(--text-muted)",
                }}>
                  {role}
                </span>
              )}
            </div>
            {/* Theme toggle moved to floating FAB in App.tsx */}
          </div>

          {!isCollapsed && bottomContent && <div>{bottomContent}</div>}
        </div>
      </div>

      <div style={{ padding: "0.5rem 0.25rem 0", flexShrink: 0 }}>
        {onSignOut && (
          <button
            type="button"
            className="btn-core"
            onClick={onSignOut}
            aria-label={isCollapsed ? "Sign out" : undefined}
            title={isCollapsed ? "Sign out" : undefined}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              justifyContent: isCollapsed ? "center" : "flex-start",
              gap: isCollapsed ? 0 : "0.5rem",
              padding: "0.5rem", borderRadius: "9px",
              border: "none", cursor: "pointer",
              background: "transparent",
              color: "var(--text-muted)", fontSize: "0.78rem",
              fontFamily: "'IBM Plex Sans',sans-serif",
            }}
          >
            <LogOut size={14} aria-hidden="true" />
            {!isCollapsed && "Sign out"}
          </button>
        )}
      </div>
    </aside>
  );
}
