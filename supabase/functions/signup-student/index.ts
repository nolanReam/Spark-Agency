import { createClient } from "npm:@supabase/supabase-js@2.108.2";

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$/;
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ALLOWED_REQUEST_FIELDS = new Set(["username", "password"]);

type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_USERNAME"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_REJECTED"
  | "USERNAME_TAKEN"
  | "SIGNUP_UNAVAILABLE";

function jsonResponse(
  body: { ok: true } | { ok: false; code: ErrorCode; message: string },
  status: number,
  origin: string,
) {
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

function canonicalDomain() {
  const domain = Deno.env.get("STUDENT_AUTH_EMAIL_DOMAIN")?.trim().toLowerCase();
  return domain && DOMAIN_PATTERN.test(domain) ? domain : null;
}

function duplicateAuthError(code?: string) {
  return code === "email_exists"
    || code === "user_already_exists"
    || code === "identity_already_exists";
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigins = configuredOrigins();

  if (!origin || !allowedOrigins.has(origin)) {
    return new Response(JSON.stringify({
      ok: false,
      code: "SIGNUP_UNAVAILABLE",
      message: "Student signup is temporarily unavailable. Please try again later.",
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const emailDomain = canonicalDomain();
  if (!supabaseUrl || !serviceRoleKey || !emailDomain) {
    console.error("signup-student configuration is incomplete");
    return jsonResponse({
      ok: false,
      code: "SIGNUP_UNAVAILABLE",
      message: "Student signup is temporarily unavailable. Please try again later.",
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

  const fields = Object.keys(body);
  if (fields.some(field => !ALLOWED_REQUEST_FIELDS.has(field))) {
    return jsonResponse({
      ok: false,
      code: "INVALID_REQUEST",
      message: "The signup request was not valid.",
    }, 400, origin);
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.username !== "string" || typeof payload.password !== "string") {
    return jsonResponse({
      ok: false,
      code: "INVALID_REQUEST",
      message: "The signup request was not valid.",
    }, 400, origin);
  }

  const username = payload.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    return jsonResponse({
      ok: false,
      code: "INVALID_USERNAME",
      message: "Use 3–32 letters, numbers, underscores, or hyphens. Start and end with a letter or number.",
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

  // Production-hardening seam: apply a per-IP and per-username rate-limit
  // check here before performing either database or Auth Admin operations.
  const { data: existingUser, error: lookupError } = await admin
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error("signup-student username lookup failed", { code: lookupError.code });
    return jsonResponse({
      ok: false,
      code: "SIGNUP_UNAVAILABLE",
      message: "Student signup is temporarily unavailable. Please try again later.",
    }, 503, origin);
  }
  if (existingUser) {
    return jsonResponse({
      ok: false,
      code: "USERNAME_TAKEN",
      message: "That username is already taken.",
    }, 409, origin);
  }

  const { error: createError } = await admin.auth.admin.createUser({
    email: `${username}@${emailDomain}`,
    password: payload.password,
    email_confirm: true,
    app_metadata: { role: "student" },
    user_metadata: {
      username,
      display_name: username,
    },
  });

  if (createError) {
    if (duplicateAuthError(createError.code)) {
      return jsonResponse({
        ok: false,
        code: "USERNAME_TAKEN",
        message: "That username is already taken.",
      }, 409, origin);
    }

    if (createError.code === "weak_password") {
      return jsonResponse({
        ok: false,
        code: "PASSWORD_REJECTED",
        message: "That password was not accepted. Choose a different password and try again.",
      }, 400, origin);
    }

    console.error("signup-student Auth creation failed", {
      code: createError.code,
      status: createError.status,
    });
    return jsonResponse({
      ok: false,
      code: "SIGNUP_UNAVAILABLE",
      message: "Student signup is temporarily unavailable. Check the password and try again.",
    }, createError.status === 422 ? 400 : 503, origin);
  }

  return jsonResponse({ ok: true }, 201, origin);
});
