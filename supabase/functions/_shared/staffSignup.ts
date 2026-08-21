import { createClient } from "npm:@supabase/supabase-js@2.108.2";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type StaffRole = "volunteer" | "instructor";
type StaffSignupErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_ACCESS_CODE"
  | "INVALID_NAME"
  | "INVALID_EMAIL"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_REJECTED"
  | "ACCOUNT_EXISTS"
  | "SIGNUP_UNAVAILABLE";

interface StaffSignupConfig {
  role: StaffRole;
  accessCodeSecretName: "VOLUNTEER_SIGNUP_CODE" | "INSTRUCTOR_SIGNUP_CODE";
}

type ResponseBody =
  | { ok: true }
  | { ok: false; code: StaffSignupErrorCode; message: string };

function jsonResponse(body: ResponseBody, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
      "Vary": "Origin",
    },
  });
}

function configuredOrigins() {
  return new Set(
    (Deno.env.get("STUDENT_SIGNUP_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean),
  );
}

function hasOnlyFields(payload: Record<string, unknown>, allowedFields: string[]) {
  const allowed = new Set(allowedFields);
  return Object.keys(payload).every(field => allowed.has(field));
}

async function accessCodesMatch(submitted: string, expected: string) {
  const encoder = new TextEncoder();
  const [submittedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(submitted)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const submittedBytes = new Uint8Array(submittedDigest);
  const expectedBytes = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= submittedBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

function staffUsername(role: StaffRole) {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  return `${role}_${suffix}`;
}

function duplicateAuthError(code?: string) {
  return code === "email_exists"
    || code === "user_already_exists"
    || code === "identity_already_exists";
}

export function createStaffSignupHandler(config: StaffSignupConfig) {
  return async (request: Request) => {
    const origin = request.headers.get("Origin") ?? "";
    if (!origin || !configuredOrigins().has(origin)) {
      return new Response(JSON.stringify({
        ok: false,
        code: "SIGNUP_UNAVAILABLE",
        message: "Account signup is temporarily unavailable. Please try again later.",
      }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Vary": "Origin" },
      });
    }

    if (request.method === "OPTIONS") {
      return jsonResponse({ ok: true }, 200, origin);
    }
    if (request.method !== "POST") {
      return jsonResponse({
        ok: false,
        code: "INVALID_REQUEST",
        message: "The signup request was not valid.",
      }, 405, origin);
    }

    const expectedAccessCode = Deno.env.get(config.accessCodeSecretName);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!expectedAccessCode || !supabaseUrl || !serviceRoleKey) {
      console.error(`${config.role} signup configuration is incomplete`);
      return jsonResponse({
        ok: false,
        code: "SIGNUP_UNAVAILABLE",
        message: "Account signup is temporarily unavailable. Please try again later.",
      }, 503, origin);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({
        ok: false,
        code: "INVALID_REQUEST",
        message: "The signup request was not valid.",
      }, 400, origin);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({
        ok: false,
        code: "INVALID_REQUEST",
        message: "The signup request was not valid.",
      }, 400, origin);
    }

    const payload = body as Record<string, unknown>;
    const operation = payload.operation;
    if (operation !== "verify" && operation !== "create") {
      return jsonResponse({
        ok: false,
        code: "INVALID_REQUEST",
        message: "The signup request was not valid.",
      }, 400, origin);
    }

    const allowedFields = operation === "verify"
      ? ["operation", "accessCode"]
      : ["operation", "accessCode", "fullName", "email", "password"];
    if (!hasOnlyFields(payload, allowedFields) || typeof payload.accessCode !== "string") {
      return jsonResponse({
        ok: false,
        code: "INVALID_REQUEST",
        message: "The signup request was not valid.",
      }, 400, origin);
    }

    // Production-hardening seam: rate-limit verify/create attempts here before
    // comparing credentials or calling the Auth Admin API.
    if (!(await accessCodesMatch(payload.accessCode, expectedAccessCode))) {
      return jsonResponse({
        ok: false,
        code: "INVALID_ACCESS_CODE",
        message: "Invalid access code.",
      }, 403, origin);
    }

    if (operation === "verify") {
      return jsonResponse({ ok: true }, 200, origin);
    }

    if (
      typeof payload.fullName !== "string"
      || typeof payload.email !== "string"
      || typeof payload.password !== "string"
    ) {
      return jsonResponse({
        ok: false,
        code: "INVALID_REQUEST",
        message: "The signup request was not valid.",
      }, 400, origin);
    }

    const fullName = payload.fullName.trim();
    const email = payload.email.trim().toLowerCase();
    if (fullName.length < 2 || fullName.length > 80) {
      return jsonResponse({
        ok: false,
        code: "INVALID_NAME",
        message: "Enter a name between 2 and 80 characters.",
      }, 400, origin);
    }
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return jsonResponse({
        ok: false,
        code: "INVALID_EMAIL",
        message: "Enter a valid email address.",
      }, 400, origin);
    }
    if (payload.password.length < 8) {
      return jsonResponse({
        ok: false,
        code: "PASSWORD_TOO_SHORT",
        message: "Password must be at least 8 characters.",
      }, 400, origin);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const username = staffUsername(config.role);
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      password: payload.password,
      email_confirm: true,
      app_metadata: { role: config.role },
      user_metadata: {
        username,
        display_name: fullName,
      },
    });

    if (createError) {
      if (duplicateAuthError(createError.code)) {
        return jsonResponse({
          ok: false,
          code: "ACCOUNT_EXISTS",
          message: "Unable to create this account. If you already registered, try signing in.",
        }, 409, origin);
      }
      if (createError.code === "email_address_invalid") {
        return jsonResponse({
          ok: false,
          code: "INVALID_EMAIL",
          message: "Enter a valid email address.",
        }, 400, origin);
      }
      if (createError.code === "weak_password") {
        return jsonResponse({
          ok: false,
          code: "PASSWORD_REJECTED",
          message: "That password was not accepted. Choose a different password and try again.",
        }, 400, origin);
      }

      console.error(`${config.role} Auth creation failed`, {
        code: createError.code,
        status: createError.status,
      });
      return jsonResponse({
        ok: false,
        code: "SIGNUP_UNAVAILABLE",
        message: "Account signup is temporarily unavailable. Please try again later.",
      }, 503, origin);
    }

    return jsonResponse({ ok: true }, 201, origin);
  };
}
