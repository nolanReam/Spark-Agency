import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTheme } from "./hooks/useTheme";
import { useAuth } from "./hooks/useAuth";
import { StudentShell } from "./features/dashboard/StudentShell";
import { VolunteerShell } from "./features/review/VolunteerShell";
import { InstructorShell } from "./features/instructor/InstructorShell";
import { FloatingThemeToggle } from "./components/layout/ThemeToggle";
import { StudentSignupScreen } from "./features/auth/StudentSignupScreen";
import { StaffSignupScreen } from "./features/auth/StaffSignupScreen";

const queryClient = new QueryClient();

type LoginMode = "student" | "staff";
type AuthScreen = "sign-in" | "student-signup" | "volunteer-signup" | "instructor-signup";
type SignInResult = Promise<{
  data?: { session?: unknown | null };
  error?: Error | null;
}>;

function LoginScreen({
  mode,
  onModeChange,
  onStudentSignIn,
  onStaffSignIn,
  onCreateStudentAccount,
  onCreateVolunteerAccount,
  onCreateInstructorAccount,
}: {
  mode: LoginMode;
  onModeChange: (mode: LoginMode) => void;
  onStudentSignIn: (username: string, password: string) => SignInResult;
  onStaffSignIn: (email: string, password: string) => SignInResult;
  onCreateStudentAccount: () => void;
  onCreateVolunteerAccount: () => void;
  onCreateInstructorAccount: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      const signIn = mode === "student" ? onStudentSignIn : onStaffSignIn;
      const { error: authError } = await signIn(identifier.trim(), password);
      if (authError) {
        setError(mode === "student" ? "Invalid username or password." : "Invalid email or password.");
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

        <div role="group" aria-label="Account type" style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", padding: "0.2rem",
          borderRadius: "10px", background: "var(--surface-2)", marginBottom: "1rem",
        }}>
          {(["student", "staff"] as const).map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => {
                onModeChange(option);
                setIdentifier("");
                setPassword("");
                setError("");
              }}
              style={{
                padding: "0.55rem", borderRadius: "8px", border: "none",
                background: mode === option ? "var(--surface)" : "transparent",
                color: "var(--text)", fontWeight: 700, fontSize: "0.82rem",
                boxShadow: mode === option ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {option === "student" ? "Student" : "Staff"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div>
            <label htmlFor="login-identifier" style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
              {mode === "student" ? "Username" : "Email"}
            </label>
            <input
              id="login-identifier"
              type="text"
              inputMode={mode === "staff" ? "email" : undefined}
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder={mode === "student" ? "your username" : "staff@example.com"}
              autoComplete={mode === "student" ? "username" : "email"}
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              style={{
                width: "100%", padding: "0.65rem 0.85rem", borderRadius: "10px",
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text)", fontSize: "0.92rem",
                fontFamily: "'IBM Plex Sans',sans-serif",
                boxSizing: "border-box",
              }}
            />
            {mode === "staff" && (
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>
                Legacy workshop staff may enter their existing username.
              </div>
            )}
          </div>
          <div>
            <label htmlFor="login-password" style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
              Password
            </label>
            <input
              id="login-password"
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
            <div role="alert" aria-live="polite" style={{
              fontSize: "0.82rem", color: "var(--danger)", padding: "0.55rem 0.75rem",
              borderRadius: "8px", background: "var(--danger-soft)", border: "1px solid var(--danger)",
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !identifier.trim() || !password.trim()} style={{
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

          <button type="button" onClick={onCreateVolunteerAccount} disabled={submitting} className="btn-core" style={{
            padding: "0.7rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border)",
            background: "transparent", color: "var(--text)", fontWeight: 600, fontSize: "0.88rem",
            fontFamily: "'IBM Plex Sans',sans-serif",
          }}>
            Create Volunteer Account
          </button>

          <button type="button" onClick={onCreateInstructorAccount} disabled={submitting} className="btn-core" style={{
            padding: "0.7rem 1.25rem", borderRadius: "10px", border: "1px solid var(--border)",
            background: "transparent", color: "var(--text)", fontWeight: 600, fontSize: "0.88rem",
            fontFamily: "'IBM Plex Sans',sans-serif",
          }}>
            Create Instructor Account
          </button>

        </form>
      </div>
    </div>
  );
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { session, role, signIn, signInStaff, signOut } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>("sign-in");
  const [loginMode, setLoginMode] = useState<LoginMode>("student");
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = session?.user.id ?? null;
    if (previousUserId.current !== currentUserId) {
      queryClient.clear();
      previousUserId.current = currentUserId;
    }
  }, [session?.user.id]);

  const showSignIn = (mode: LoginMode) => {
    setLoginMode(mode);
    setAuthScreen("sign-in");
  };

  if (!session) {
    if (authScreen === "student-signup") {
      return <StudentSignupScreen onBack={() => showSignIn("student")} onSignIn={signIn} />;
    }
    if (authScreen === "volunteer-signup" || authScreen === "instructor-signup") {
      const staffRole = authScreen === "volunteer-signup" ? "volunteer" : "instructor";
      return (
        <StaffSignupScreen
          role={staffRole}
          onBack={() => showSignIn("staff")}
          onStaffSignIn={signInStaff}
        />
      );
    }
    return (
      <LoginScreen
        mode={loginMode}
        onModeChange={setLoginMode}
        onStudentSignIn={signIn}
        onStaffSignIn={signInStaff}
        onCreateStudentAccount={() => setAuthScreen("student-signup")}
        onCreateVolunteerAccount={() => setAuthScreen("volunteer-signup")}
        onCreateInstructorAccount={() => setAuthScreen("instructor-signup")}
      />
    );
  }

  const roleProps = { role, theme, setTheme: toggleTheme, onSignOut: signOut };

  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface)", color: "var(--text)", fontFamily: "'Inter', 'IBM Plex Sans', sans-serif" }}>
        {role === "student" && <StudentShell key={session.user.id} {...roleProps} />}
        {role === "volunteer" && <VolunteerShell key={session.user.id} {...roleProps} />}
        {role === "instructor" && <InstructorShell key={session.user.id} {...roleProps} />}
      </div>
      <FloatingThemeToggle theme={theme} setTheme={toggleTheme} />
    </QueryClientProvider>
  );
}
