import { useState } from "react";
import { signupStudent, StudentSignupError } from "../../api/client";
import {
  canonicalizeStudentUsername,
  getStudentAuthConfigurationError,
  STUDENT_USERNAME_PATTERN,
} from "../../lib/studentAuth";

type SignInResult = Promise<{
  data?: { session?: unknown | null };
  error?: Error | null;
}>;

interface StudentSignupScreenProps {
  onBack: () => void;
  onSignIn: (username: string, password: string) => SignInResult;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.85rem",
  borderRadius: "10px",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "0.92rem",
  fontFamily: "'IBM Plex Sans',sans-serif",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--text)",
  marginBottom: "0.35rem",
};

export function StudentSignupScreen({ onBack, onSignIn }: StudentSignupScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [accountCreated, setAccountCreated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const configurationError = getStudentAuthConfigurationError();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || accountCreated) return;

    const canonicalUsername = canonicalizeStudentUsername(username);
    setUsername(canonicalUsername);
    setError("");

    if (configurationError) {
      setError(configurationError);
      return;
    }
    if (!STUDENT_USERNAME_PATTERN.test(canonicalUsername)) {
      setError("Use 3–32 letters, numbers, underscores, or hyphens. Start and end with a letter or number.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await signupStudent(canonicalUsername, password);
      const { data: signInData, error: signInError } = await onSignIn(canonicalUsername, password);
      if (signInError || !signInData?.session) {
        setAccountCreated(true);
        setError("");
      } else {
        onBack();
      }
    } catch (signupError) {
      setError(
        signupError instanceof StudentSignupError
          ? signupError.message
          : "Student signup is temporarily unavailable. Please try again later.",
      );
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
          Create your student account
        </div>

        {accountCreated ? (
          <div>
            <div role="status" style={{
              fontSize: "0.84rem", color: "var(--success)", padding: "0.75rem",
              borderRadius: "8px", background: "var(--success-soft)", border: "1px solid var(--success)",
              lineHeight: 1.5, marginBottom: "1rem",
            }}>
              Your account was created, but automatic sign-in did not finish. Return to Sign In and use your username and password.
            </div>
            <button type="button" onClick={onBack} className="btn-core" style={{
              width: "100%", padding: "0.75rem 1.25rem", borderRadius: "10px",
              border: "none", background: "var(--brand)", color: "#fff",
              fontWeight: 600, fontSize: "0.92rem",
            }}>
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div>
              <label htmlFor="student-signup-username" style={labelStyle}>Username</label>
              <input
                id="student-signup-username"
                type="text"
                value={username}
                onChange={event => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
                minLength={3}
                maxLength={32}
                aria-describedby="student-signup-username-hint"
                style={fieldStyle}
              />
              <div id="student-signup-username-hint" style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.3rem", lineHeight: 1.4 }}>
                3–32 letters, numbers, underscores, or hyphens.
              </div>
            </div>
            <div>
              <label htmlFor="student-signup-password" style={labelStyle}>Password</label>
              <input
                id="student-signup-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                style={fieldStyle}
              />
            </div>
            <div>
              <label htmlFor="student-signup-confirm-password" style={labelStyle}>Confirm Password</label>
              <input
                id="student-signup-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                style={fieldStyle}
              />
            </div>

            {(error || configurationError) && (
              <div role="alert" aria-live="polite" style={{
                fontSize: "0.82rem", color: "var(--danger)", padding: "0.55rem 0.75rem",
                borderRadius: "8px", background: "var(--danger-soft)", border: "1px solid var(--danger)",
              }}>
                {error || configurationError}
              </div>
            )}

            <button type="submit" disabled={submitting || !!configurationError} className="btn-core" style={{
              width: "100%", padding: "0.75rem 1.25rem", borderRadius: "10px", border: "none",
              background: "var(--brand)", color: "#fff", fontWeight: 600, fontSize: "0.92rem",
              opacity: submitting || configurationError ? 0.7 : 1,
            }}>
              {submitting ? "Creating account..." : "Create Account"}
            </button>
            <button type="button" onClick={onBack} disabled={submitting} className="btn-core" style={{
              width: "100%", padding: "0.7rem 1.25rem", borderRadius: "10px",
              border: "1px solid var(--border)", background: "transparent", color: "var(--text)",
              fontWeight: 600, fontSize: "0.88rem",
            }}>
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
