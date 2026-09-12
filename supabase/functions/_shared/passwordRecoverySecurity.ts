export type RecoveryRole = "student" | "instructor";

export type RecoveryErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RESET_NOT_FOUND"
  | "RESET_NOT_AVAILABLE"
  | "RESET_ALREADY_PROCESSING"
  | "RESET_EXPIRED"
  | "RESET_ATTEMPTS_EXHAUSTED"
  | "TARGET_NOT_STUDENT"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_REJECTED"
  | "PASSWORD_MUST_DIFFER"
  | "RESET_FAILED"
  | "PASSWORD_CHANGE_FAILED";

export interface SafeError {
  code: RecoveryErrorCode;
  message: string;
  status: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%?";
const ALL_PASSWORD_CHARACTERS = LOWERCASE + UPPERCASE + DIGITS + SYMBOLS;

const ERROR_MESSAGES: Record<RecoveryErrorCode, string> = {
  INVALID_REQUEST: "The request was not valid.",
  UNAUTHORIZED: "Sign in is required.",
  FORBIDDEN: "You are not allowed to perform this action.",
  RESET_NOT_FOUND: "The password reset request was not found.",
  RESET_NOT_AVAILABLE: "The password reset request is not available.",
  RESET_ALREADY_PROCESSING: "The password reset request is already being processed.",
  RESET_EXPIRED: "The password reset request has expired.",
  RESET_ATTEMPTS_EXHAUSTED: "Create a new password reset request before trying again.",
  TARGET_NOT_STUDENT: "The password reset target is not an eligible student.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  PASSWORD_REJECTED: "That password was not accepted. Choose a different password.",
  PASSWORD_MUST_DIFFER: "Choose a password different from the temporary password.",
  RESET_FAILED: "The password reset could not be completed. Try again later.",
  PASSWORD_CHANGE_FAILED: "The password change could not be completed. Try again.",
};

export function safeError(code: RecoveryErrorCode, status: number): SafeError {
  return { code, message: ERROR_MESSAGES[code], status };
}

export function configuredOrigins(rawValue: string | undefined): Set<string> {
  return new Set(
    (rawValue ?? "")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean),
  );
}

export function isAllowedOrigin(origin: string | null, origins: Set<string>): origin is string {
  return Boolean(origin && origins.has(origin));
}

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin?: string,
): Response {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] =
      "authorization, x-client-info, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }

  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(error: SafeError, origin?: string): Response {
  return jsonResponse({ ok: false, code: error.code, message: error.message }, error.status, origin);
}

export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasExactFields(payload: Record<string, unknown>, expected: string[]): boolean {
  const fields = Object.keys(payload);
  return fields.length === expected.length && expected.every(field => fields.includes(field));
}

export function parseResetRequest(
  payload: unknown,
): { ok: true; requestId: string } | { ok: false } {
  if (!isRecord(payload) || !hasExactFields(payload, ["requestId"])) return { ok: false };
  if (typeof payload.requestId !== "string" || !UUID_PATTERN.test(payload.requestId)) {
    return { ok: false };
  }
  return { ok: true, requestId: payload.requestId };
}

export function parsePasswordChangeRequest(
  payload: unknown,
):
  | { ok: true; newPassword: string }
  | { ok: false; code: "INVALID_REQUEST" | "PASSWORD_TOO_SHORT" | "PASSWORD_REJECTED" } {
  if (!isRecord(payload) || !hasExactFields(payload, ["newPassword"])) {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  if (typeof payload.newPassword !== "string") {
    return { ok: false, code: "INVALID_REQUEST" };
  }
  if (payload.newPassword.length < 8) {
    return { ok: false, code: "PASSWORD_TOO_SHORT" };
  }
  if (payload.newPassword.length > 128) {
    return { ok: false, code: "PASSWORD_REJECTED" };
  }
  return { ok: true, newPassword: payload.newPassword };
}

export function rolesAreReconciled(
  trustedRole: unknown,
  publicRole: unknown,
  requiredRole: RecoveryRole,
): boolean {
  return trustedRole === requiredRole && publicRole === requiredRole;
}

function secureIndex(length: number, source: Pick<Crypto, "getRandomValues">): number {
  const maximum = Math.floor(256 / length) * length;
  const bytes = new Uint8Array(1);
  do {
    source.getRandomValues(bytes);
  } while (bytes[0] >= maximum);
  return bytes[0] % length;
}

function choose(characters: string, source: Pick<Crypto, "getRandomValues">): string {
  return characters[secureIndex(characters.length, source)];
}

export function generateTemporaryPassword(
  source: Pick<Crypto, "getRandomValues"> = crypto,
): string {
  const characters = [
    choose(LOWERCASE, source),
    choose(UPPERCASE, source),
    choose(DIGITS, source),
    choose(SYMBOLS, source),
  ];

  while (characters.length < 16) {
    characters.push(choose(ALL_PASSWORD_CHARACTERS, source));
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = secureIndex(index + 1, source);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

export function claimResultError(resultCode: unknown): SafeError | null {
  switch (resultCode) {
    case "CLAIMED":
      return null;
    case "FORBIDDEN":
      return safeError("FORBIDDEN", 403);
    case "RESET_NOT_FOUND":
      return safeError("RESET_NOT_FOUND", 404);
    case "RESET_ALREADY_PROCESSING":
      return safeError("RESET_ALREADY_PROCESSING", 409);
    case "RESET_EXPIRED":
      return safeError("RESET_EXPIRED", 409);
    case "RESET_ATTEMPTS_EXHAUSTED":
      return safeError("RESET_ATTEMPTS_EXHAUSTED", 409);
    case "TARGET_NOT_STUDENT":
      return safeError("TARGET_NOT_STUDENT", 409);
    case "RESET_NOT_AVAILABLE":
      return safeError("RESET_NOT_AVAILABLE", 409);
    default:
      return safeError("RESET_FAILED", 503);
  }
}

export function passwordUpdateError(providerCode: unknown): SafeError {
  if (providerCode === "same_password") {
    return safeError("PASSWORD_MUST_DIFFER", 400);
  }
  if (providerCode === "weak_password") {
    return safeError("PASSWORD_REJECTED", 400);
  }
  return safeError("PASSWORD_CHANGE_FAILED", 503);
}
