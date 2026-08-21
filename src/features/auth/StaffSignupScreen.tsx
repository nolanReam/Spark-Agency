import { useState } from "react";
import {
  createStaffAccount,
  StaffSignupError,
  verifyStaffSignup,
  type StaffSignupRole,
} from "../../api/client";

type StaffSignInResult = Promise<{
  data?: { session?: unknown | null };
  error?: Error | null;
}>;

interface StaffSignupScreenProps {
  role: StaffSignupRole;
  onBack: () => void;
  onStaffSignIn: (email: string, password: string) => StaffSignInResult;
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

export function StaffSignupScreen({ role, onBack, onStaffSignIn }: StaffSignupScreenProps) {
  const roleLabel = role === "volunteer" ? "Volunteer" : "Instructor";
  const [accessCode, setAccessCode] = useState("");
  const [gateVerified, setGateVerified] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [accountCreated, setAccountCreated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const verifyGate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !accessCode) return;
    setError("");
    setSubmitting(true);
    try {
      await verifyStaffSignup(role, accessCode);
      setGateVerified(true);
    } catch (verifyError) {
      setError(
        verifyError instanceof StaffSignupError
          ? verifyError.message
          : "Account signup is temporarily unavailable. Please try again later.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || accountCreated) return;

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    setFullName(normalizedName);
    setEmail(normalizedEmail);
    setError("");

    if (normalizedName.length < 2 || normalizedName.length > 80) {
      setError("Enter a name between 2 and 80 characters.");
      return;
    }
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
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
      await createStaffAccount(role, {
        accessCode,
        fullName: normalizedName,
        email: normalizedEmail,
        password,
      });
      const { data: signInData, error: signInError } = await onStaffSignIn(normalizedEmail, password);
      if (signInError || !signInData?.session) {
        setAccountCreated(true);
        setError("");
      } else {
        onBack();
      }
    } catch (createError) {
      if (createError instanceof StaffSignupError && createError.code === "INVALID_ACCESS_CODE") {
        setGateVerified(false);
      }
      setError(
        createError instanceof StaffSignupError
          ? createError.message
          : "Account signup is temporarily unavailable. Please try again later.",
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
        maxWidth: 400, width: "100%",
      }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: "1.4rem", marginBottom: "0.25rem", color: "var(--brand)", textAlign: "center" }}>
          <span style={{ marginRight: "0.35rem" }}>&#x2728;</span>Spark Agency
        </div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.75rem", textAlign: "center" }}>
          Create your {roleLabel.toLowerCase()} account
        </div>

        {accountCreated ? (
          <div>
            <div role="status" style={{
              fontSize: "0.84rem", color: "var(--success)", padding: "0.75rem",
              borderRadius: "8px", background: "var(--success-soft)", border: "1px solid var(--success)",
              lineHeight: 1.5, marginBottom: "1rem",
            }}>
              Your account was created, but automatic sign-in did not finish. Return to Staff Sign In and use your email and password.
            </div>
            <button type="button" onClick={onBack} className="btn-core" style={{
              width: "100%", padding: "0.75rem 1.25rem", borderRadius: "10px",
              border: "none", background: "var(--brand)", color: "#fff",
              fontWeight: 600, fontSize: "0.92rem",
            }}>
              Go to Staff Sign In
            </button>
          </div>
        ) : !gateVerified ? (
          <form onSubmit={verifyGate} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div>
              <label htmlFor={`${role}-signup-access-code`} style={labelStyle}>{roleLabel} Access Code</label>
              <input
                id={`${role}-signup-access-code`}
                type="password"
                value={accessCode}
                onChange={event => setAccessCode(event.target.value)}
                autoComplete="off"
                autoFocus
                required
                style={fieldStyle}
              />
            </div>
            {error && <ErrorMessage message={error} />}
            <button type="submit" disabled={submitting || !accessCode} className="btn-core" style={{
              width: "100%", padding: "0.75rem 1.25rem", borderRadius: "10px", border: "none",
              background: "var(--brand)", color: "#fff", fontWeight: 600, fontSize: "0.92rem",
              opacity: submitting || !accessCode ? 0.7 : 1,
            }}>
              {submitting ? "Checking access..." : "Continue"}
            </button>
            <BackButton onClick={onBack} disabled={submitting} />
          </form>
        ) : (
          <form onSubmit={createAccount} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            <div>
              <label htmlFor={`${role}-signup-name`} style={labelStyle}>Full Name</label>
              <input
                id={`${role}-signup-name`}
                type="text"
                value={fullName}
                onChange={event => setFullName(event.target.value)}
                autoComplete="name"
                autoFocus
                required
                minLength={2}
                maxLength={80}
                style={fieldStyle}
              />
            </div>
            <div>
              <label htmlFor={`${role}-signup-email`} style={labelStyle}>Email</label>
              <input
                id={`${role}-signup-email`}
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                style={fieldStyle}
              />
            </div>
            <div>
              <label htmlFor={`${role}-signup-password`} style={labelStyle}>Password</label>
              <input
                id={`${role}-signup-password`}
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
              <label htmlFor={`${role}-signup-confirm-password`} style={labelStyle}>Confirm Password</label>
              <input
                id={`${role}-signup-confirm-password`}
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                style={fieldStyle}
              />
            </div>
            {error && <ErrorMessage message={error} />}
            <button type="submit" disabled={submitting} className="btn-core" style={{
              width: "100%", padding: "0.75rem 1.25rem", borderRadius: "10px", border: "none",
              background: "var(--brand)", color: "#fff", fontWeight: 600, fontSize: "0.92rem",
              opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? "Creating account..." : `Create ${roleLabel} Account`}
            </button>
            <BackButton onClick={onBack} disabled={submitting} />
          </form>
        )}
      </div>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div role="alert" aria-live="polite" style={{
      fontSize: "0.82rem", color: "var(--danger)", padding: "0.55rem 0.75rem",
      borderRadius: "8px", background: "var(--danger-soft)", border: "1px solid var(--danger)",
    }}>
      {message}
    </div>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-core" style={{
      width: "100%", padding: "0.7rem 1.25rem", borderRadius: "10px",
      border: "1px solid var(--border)", background: "transparent", color: "var(--text)",
      fontWeight: 600, fontSize: "0.88rem",
    }}>
      Back to Sign In
    </button>
  );
}
