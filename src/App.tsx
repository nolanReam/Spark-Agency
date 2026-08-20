import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "./hooks/useTheme";
import { useAuth } from "./hooks/useAuth";
import { StudentShell } from "./features/dashboard/StudentShell";
import { VolunteerShell } from "./features/review/VolunteerShell";
import { InstructorShell } from "./features/instructor/InstructorShell";
import { FloatingThemeToggle } from "./components/layout/ThemeToggle";
import { StudentSignupScreen } from "./features/auth/StudentSignupScreen";

const queryClient = new QueryClient();

function LoginScreen({ onSignIn, onCreateStudentAccount }: {
  onSignIn: (username: string, password: string) => Promise<{ error?: Error | null }>;
  onCreateStudentAccount: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      const { error: authError } = await onSignIn(username.trim(), password);
      if (authError) {
        setError(authError.message || "Invalid username or password");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--surface)", fontFamily: "'Inter', 'IBM Plex Sans', sans-serif",
    }}>
      <div style={{
        background: "var(--surface)", borderRadius: "16px", padding: "2.5rem 2rem",
        border: "1px solid var(--border)", boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        maxWidth: 380, width: "100%",
      }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: "1.4rem", marginBottom: "0.25rem", color: "var(--brand)", textAlign: "center" }}>
          <span style={{ marginRight: "0.35rem" }}>&#x2728;</span>Spark Agency
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.75rem", textAlign: "center" }}>
          Sign in to your workshop account
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="student1"
              autoComplete="username"
              autoFocus
              style={{
                width: "100%", padding: "0.65rem 0.85rem", borderRadius: "10px",
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text)", fontSize: "0.92rem",
                fontFamily: "'IBM Plex Sans',sans-serif",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
              autoComplete="current-password"
              style={{
                width: "100%", padding: "0.65rem 0.85rem", borderRadius: "10px",
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text)", fontSize: "0.92rem",
                fontFamily: "'IBM Plex Sans',sans-serif",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: "0.82rem", color: "var(--danger)", padding: "0.55rem 0.75rem",
              borderRadius: "8px", background: "var(--danger-soft)", border: "1px solid var(--danger)",
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !username.trim() || !password.trim()} style={{
            padding: "0.75rem 1.25rem", borderRadius: "10px", border: "none",
            background: "var(--brand)", color: "#fff", fontWeight: 600, fontSize: "0.92rem",
            cursor: submitting ? "not-allowed" : "pointer",
            fontFamily: "'IBM Plex Sans',sans-serif",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            opacity: submitting ? 0.7 : 1,
            marginTop: "0.25rem",
          }}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>

          <button type="button" onClick={onCreateStudentAccount} disabled={submitting} className="btn-core" style={{
            padding: "0.7rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border)",
            background: "transparent", color: "var(--text)", fontWeight: 600, fontSize: "0.88rem",
            fontFamily: "'IBM Plex Sans',sans-serif",
          }}>
            Create Student Account
          </button>

          <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", textAlign: "center" }}>
            Demo accounts &mdash; username: <strong>student1</strong>, password: <strong>demo1234</strong>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { session, role, signIn, signOut } = useAuth();
  const [authScreen, setAuthScreen] = useState<"sign-in" | "student-signup">("sign-in");

  if (!session) {
    return authScreen === "student-signup"
      ? <StudentSignupScreen onBack={() => setAuthScreen("sign-in")} onSignIn={signIn} />
      : <LoginScreen onSignIn={signIn} onCreateStudentAccount={() => setAuthScreen("student-signup")} />;
  }

  const roleProps = { role, theme, setTheme: toggleTheme, onSignOut: signOut };

  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface)", color: "var(--text)", fontFamily: "'Inter', 'IBM Plex Sans', sans-serif" }}>
        {role === "student" && <StudentShell {...roleProps} />}
        {role === "volunteer" && <VolunteerShell {...roleProps} />}
        {role === "instructor" && <InstructorShell {...roleProps} />}
      </div>
      <FloatingThemeToggle theme={theme} setTheme={toggleTheme} />
    </QueryClientProvider>
  );
}
