import { createClient } from "npm:@supabase/supabase-js@2.108.2";
import {
  claimResultError,
  configuredOrigins,
  errorResponse,
  generateTemporaryPassword,
  isAllowedOrigin,
  jsonResponse,
  parseBearerToken,
  parseResetRequest,
  rolesAreReconciled,
  safeError,
} from "../_shared/passwordRecoverySecurity.ts";

interface ClaimRow {
  result_code: string;
  reset_request_id: string | null;
  student_id: string | null;
  attempt_count: number | null;
}

function logFailure(code: string, resetId?: string, actorId?: string) {
  console.error("reset-student-password failed", {
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
    return errorResponse(safeError("RESET_FAILED", 503), origin);
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
  const instructorId = callerData.user.id;

  const { data: publicInstructor, error: publicInstructorError } = await admin
    .from("users")
    .select("role")
    .eq("id", instructorId)
    .maybeSingle();
  if (
    publicInstructorError
    || !rolesAreReconciled(
      callerData.user.app_metadata?.role,
      publicInstructor?.role,
      "instructor",
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
  const parsedRequest = parseResetRequest(requestBody);
  if (!parsedRequest.ok) {
    return errorResponse(safeError("INVALID_REQUEST", 400), origin);
  }
  const resetId = parsedRequest.requestId;

  const { data: claimData, error: claimRpcError } = await admin.rpc(
    "claim_password_reset_request",
    { p_request_id: resetId, p_instructor_id: instructorId },
  );
  if (claimRpcError || !Array.isArray(claimData) || claimData.length !== 1) {
    logFailure("CLAIM_RPC_FAILED", resetId, instructorId);
    return errorResponse(safeError("RESET_FAILED", 503), origin);
  }

  const claim = claimData[0] as ClaimRow;
  const claimError = claimResultError(claim.result_code);
  if (claimError) {
    return errorResponse(claimError, origin);
  }
  if (claim.reset_request_id !== resetId || !claim.student_id) {
    logFailure("INVALID_CLAIM_RESULT", resetId, instructorId);
    return errorResponse(safeError("RESET_FAILED", 503), origin);
  }
  const studentId = claim.student_id;

  async function failClaim(failureCode: string) {
    const { error } = await admin.rpc("fail_password_reset_attempt", {
      p_request_id: resetId,
      p_instructor_id: instructorId,
      p_failure_code: failureCode,
    });
    if (error) logFailure("FAILURE_TRANSITION_FAILED", resetId, instructorId);
  }

  const { data: authStudentData, error: authStudentError } =
    await admin.auth.admin.getUserById(studentId);
  if (authStudentError || !authStudentData.user) {
    await failClaim("target_lookup_failed");
    return errorResponse(safeError("RESET_FAILED", 503), origin);
  }

  const { data: publicStudent, error: publicStudentError } = await admin
    .from("users")
    .select("role")
    .eq("id", studentId)
    .maybeSingle();
  if (
    publicStudentError
    || !rolesAreReconciled(
      authStudentData.user.app_metadata?.role,
      publicStudent?.role,
      "student",
    )
  ) {
    await failClaim("target_not_student");
    return errorResponse(safeError("TARGET_NOT_STUDENT", 409), origin);
  }

  const { data: requirementResult, error: requirementError } = await admin.rpc(
    "ensure_student_password_change_requirement",
    { p_request_id: resetId, p_instructor_id: instructorId },
  );
  if (requirementError || requirementResult !== "REQUIREMENT_READY") {
    await failClaim(
      requirementResult === "TARGET_NOT_STUDENT"
        ? "target_not_student"
        : "requirement_conflict",
    );
    const responseError = requirementResult === "TARGET_NOT_STUDENT"
      ? safeError("TARGET_NOT_STUDENT", 409)
      : safeError("RESET_FAILED", 503);
    return errorResponse(responseError, origin);
  }

  const temporaryPassword = generateTemporaryPassword();
  const { error: authUpdateError } = await admin.auth.admin.updateUserById(studentId, {
    password: temporaryPassword,
  });
  if (authUpdateError) {
    await failClaim("auth_password_update_failed");
    logFailure("AUTH_PASSWORD_UPDATE_FAILED", resetId, instructorId);
    return errorResponse(safeError("RESET_FAILED", 503), origin);
  }

  const { data: completionResult, error: completionError } = await admin.rpc(
    "complete_password_reset",
    { p_request_id: resetId, p_instructor_id: instructorId },
  );
  if (completionError || completionResult !== "RESET_COMPLETED") {
    // The unknown password must not escape without durable completion state.
    // Leave the requirement and processing lease intact for a later retry.
    logFailure("COMPLETION_TRANSITION_FAILED", resetId, instructorId);
    return errorResponse(safeError("RESET_FAILED", 503), origin);
  }

  return jsonResponse({
    ok: true,
    requestId: resetId,
    temporaryPassword,
  }, 200, origin);
});
