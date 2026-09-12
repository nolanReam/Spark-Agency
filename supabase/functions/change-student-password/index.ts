import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  configuredOrigins,
  errorResponse,
  isAllowedOrigin,
  jsonResponse,
  parseBearerToken,
  parsePasswordChangeRequest,
  passwordUpdateError,
  rolesAreReconciled,
  safeError,
} from "../_shared/passwordRecoverySecurity.ts";

function logFailure(code: string, resetId?: string, actorId?: string) {
  console.error("change-student-password failed", {
    code,
    resetId: resetId ?? null,
    actorId: actorId ?? null,
  });
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin");
  const origins = configuredOrigins(Deno.env.get("APP_ALLOWED_ORIGINS"));
  if (!isAllowedOrigin(origin, origins)) {
    return errorResponse(safeError("FORBIDDEN", 403));
  }

  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true }, 200, origin);
  }
  if (request.method !== "POST") {
    return errorResponse(safeError("INVALID_REQUEST", 405), origin);
  }

  const token = parseBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return errorResponse(safeError("UNAUTHORIZED", 401), origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    logFailure("CONFIGURATION_ERROR");
    return errorResponse(safeError("PASSWORD_CHANGE_FAILED", 503), origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) {
    return errorResponse(safeError("UNAUTHORIZED", 401), origin);
  }
  const studentId = callerData.user.id;

  const { data: publicStudent, error: publicStudentError } = await admin
    .from("users")
    .select("role")
    .eq("id", studentId)
    .maybeSingle();
  if (
    publicStudentError
    || !rolesAreReconciled(
      callerData.user.app_metadata?.role,
      publicStudent?.role,
      "student",
    )
  ) {
    return errorResponse(safeError("FORBIDDEN", 403), origin);
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return errorResponse(safeError("INVALID_REQUEST", 400), origin);
  }
  const parsedRequest = parsePasswordChangeRequest(requestBody);
  if (!parsedRequest.ok) {
    return errorResponse(safeError(parsedRequest.code, 400), origin);
  }

  const { data: requirement, error: requirementError } = await admin
    .from("student_password_change_requirements")
    .select("reset_request_id")
    .eq("student_id", studentId)
    .maybeSingle();
  if (requirementError) {
    logFailure("REQUIREMENT_LOOKUP_FAILED", undefined, studentId);
    return errorResponse(safeError("PASSWORD_CHANGE_FAILED", 503), origin);
  }
  if (!requirement) {
    return errorResponse(safeError("RESET_NOT_AVAILABLE", 409), origin);
  }

  const resetId = requirement.reset_request_id;
  const { data: resetRequest, error: resetRequestError } = await admin
    .from("password_reset_requests")
    .select("id, student_id, status")
    .eq("id", resetId)
    .maybeSingle();
  if (resetRequestError) {
    logFailure("RESET_LOOKUP_FAILED", resetId, studentId);
    return errorResponse(safeError("PASSWORD_CHANGE_FAILED", 503), origin);
  }
  if (
    !resetRequest
    || resetRequest.status !== "completed"
    || resetRequest.student_id !== studentId
  ) {
    return errorResponse(safeError("RESET_NOT_AVAILABLE", 409), origin);
  }

  const { error: authUpdateError } = await callerClient.auth.updateUser({
    password: parsedRequest.newPassword,
  });
  if (authUpdateError) {
    const mappedError = passwordUpdateError(authUpdateError.code);
    if (mappedError.code === "PASSWORD_CHANGE_FAILED") {
      logFailure("AUTH_PASSWORD_UPDATE_FAILED", resetId, studentId);
    }
    return errorResponse(mappedError, origin);
  }

  const { data: completedResetId, error: completionError } = await admin.rpc(
    "complete_student_password_change",
    { p_student_id: studentId },
  );
  if (completionError || completedResetId !== resetId) {
    // Auth succeeded, so preserve the live requirement and fail closed. A retry
    // must use another distinct password before the requirement can be cleared.
    logFailure("COMPLETION_TRANSITION_FAILED", resetId, studentId);
    return errorResponse(safeError("PASSWORD_CHANGE_FAILED", 503), origin);
  }

  return jsonResponse({ ok: true, requestId: resetId }, 200, origin);
});
