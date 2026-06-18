import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oxiximaftgrpipqbrwej.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94aXhpbWFmdGdycGlwcWJyd2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Mzc5ODUsImV4cCI6MjA5NzIxMzk4NX0.agyl0Ge416zGP3ZDV74rm9AazlON8s3T74tHrZJMWGQ";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Types ───────────────────────────────────────────────

export interface DbUser {
  id: string; username: string; role: "student" | "volunteer" | "instructor" | "admin";
  display_name: string; created_at: string; updated_at: string;
}

export interface DbStudentProfile {
  user_id: string; grade: number; age: number | null; interests: string[];
  clearance_level: number; reputation_points: number; prediction_accuracy: number;
  guardian_contact: string | null;
}

export interface DbCase {
  id: string; case_code: string | null; title: string; client_brief: string;
  mission: string; constraints: string | null; tools_allowed: string[];
  difficulty_lane: string; concept_tags: string[]; min_clearance: number;
  status: "draft" | "published" | "archived";
  predict_prove_prompt: string | null; reflection_prompt: string | null;
  transfer_hint: string | null; reputation_reward: number;
  estimated_minutes: number | null; created_by: string | null;
  published_at: string | null; archived_at: string | null;
  created_at: string; updated_at: string;
}

export interface DbCaseLane {
  id: string; case_id: string; lane: "Required" | "Extension" | "Challenge";
  description: string; available: boolean;
}

export interface DbSession {
  id: string; session_code: string; case_ids: string[];
  status: "draft" | "open" | "active" | "closing" | "closed";
  instructor_id: string | null; started_at: string;
  ended_at: string | null; closed_at: string | null;
}

export interface DbCaseProgress {
  id: string; student_id: string; case_id: string; session_id: string;
  state: string; created_at: string; updated_at: string;
}

export interface DbPrediction {
  id: string; case_progress_id: string; attempt_number: number;
  prediction_text: string; reasoning_text: string; committed_at: string;
  status: string;
}

export interface DbReview {
  id: string; case_progress_id: string; review_type: "implementation" | "prediction";
  prediction_id: string | null; requested_at: string; reviewed_at: string | null;
  reviewer_id: string | null; claimed_by: string | null; claimed_at: string | null;
  outcome: string | null; note: string | null;
}

export interface DbInterventionFlag {
  id: string; student_id: string; case_id: string;
  reason: string; raised_at: string;
  resolved_at: string | null; resolved_by: string | null;
}

// ─── Auth / Profile ──────────────────────────────────────

export async function getStudentProfile(userId: string) {
  const { data, error } = await supabase
    .from("student_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data as DbStudentProfile;
}

// ─── Cases ───────────────────────────────────────────────

export async function getCases(status?: string, _orgId?: string) {
  let q = supabase.from("cases").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return data as DbCase[];
}

export async function getCaseById(caseId: string) {
  const { data, error } = await supabase.from("cases").select("*").eq("id", caseId).single();
  if (error) throw error;
  return data as DbCase;
}

export async function getCaseLanes(caseId: string) {
  const { data, error } = await supabase.from("case_lanes").select("*").eq("case_id", caseId);
  if (error) throw error;
  return data as DbCaseLane[];
}

export async function getCaseConceptWeights(caseId: string) {
  const { data, error } = await supabase.from("case_concept_weights").select("*").eq("case_id", caseId);
  if (error) throw error;
  return data as { case_id: string; concept: string; points: number }[];
}

export async function createCase(caseData: Partial<DbCase>) {
  const { data, error } = await supabase.from("cases").insert(caseData).select().single();
  if (error) throw error;
  return data as DbCase;
}

export async function updateCase(caseId: string, updates: Partial<DbCase>) {
  const { data, error } = await supabase.from("cases").update(updates).eq("id", caseId).select().single();
  if (error) throw error;
  return data as DbCase;
}

export async function deleteCase(caseId: string) {
  const { error } = await supabase.from("cases").delete().eq("id", caseId);
  if (error) throw error;
}

// ─── Sessions ────────────────────────────────────────────

/** Generate a unique Spark Agency session code */
export function generateSessionCode(): string {
  const n = Math.floor(Math.random() * 900) + 100; // 100–999
  return `AGENCY-${n}`;
}

export async function createSession(sessionCode: string, caseIds: string[], instructorId?: string, status: string = "draft") {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      session_code: sessionCode,
      case_ids: caseIds,
      instructor_id: instructorId || null,
      status,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbSession;
}

export async function updateSessionStatus(sessionId: string, status: string) {
  const { data, error } = await supabase
    .from("sessions")
    .update({ status })
    .eq("id", sessionId)
    .select()
    .single();
  if (error) throw error;
  return data as DbSession;
}

export async function getSessions() {
  const { data, error } = await supabase.from("sessions").select("*").order("started_at", { ascending: false });
  if (error) throw error;
  return data as DbSession[];
}

export async function getActiveSession() {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .in("status", ["open", "active"])
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  // No session is not an error
  if (error && error.code !== "PGRST116") throw error;
  return data as DbSession | null;
}

export async function joinSession(sessionCode: string, studentId: string) {
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("session_code", sessionCode)
    .in("status", ["open", "active"])
    .single();

  if (sessionErr || !session) throw new Error("Session not found or not open");

  const { error } = await supabase
    .from("session_participants")
    .insert({ session_id: session.id, student_id: studentId });

  if (error && error.code !== "23505") throw error; // ignore duplicate
  return session as { id: string; status: string };
}

export async function getSessionCases(sessionId: string) {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("case_ids")
    .eq("id", sessionId)
    .single();
  if (error || !session?.case_ids?.length) return [];
  const { data } = await supabase.from("cases").select("*").in("id", session.case_ids);
  return (data || []) as DbCase[];
}

// ─── Case Progress ───────────────────────────────────────

export async function getStudentProgress(studentId: string, sessionId?: string) {
  let q = supabase.from("case_progress").select("*").eq("student_id", studentId);
  if (sessionId) q = q.eq("session_id", sessionId);
  const { data, error } = await q;
  if (error) throw error;
  return data as DbCaseProgress[];
}

async function ensurePendingReview(
  progressId: string,
  reviewType: "implementation" | "prediction",
  predictionId?: string
) {
  const { data: existing, error: existingError } = await supabase
    .from("reviews")
    .select("id")
    .eq("case_progress_id", progressId)
    .eq("review_type", reviewType)
    .is("reviewed_at", null)
    .limit(1);

  if (existingError) throw existingError;
  if (existing && existing.length > 0) return existing[0];

  if (reviewType === "prediction" && !predictionId) {
    throw new Error("Prediction review requires a prediction");
  }

  const review = {
    case_progress_id: progressId,
    review_type: reviewType,
    ...(predictionId ? { prediction_id: predictionId } : {}),
  };

  const { data, error } = await supabase
    .from("reviews")
    .insert(review)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getNextPredictionAttemptNumber(progressId: string) {
  const { data, error } = await supabase
    .from("predictions")
    .select("attempt_number")
    .eq("case_progress_id", progressId)
    .order("attempt_number", { ascending: false })
    .limit(1);

  if (error) throw error;
  return ((data?.[0]?.attempt_number as number | undefined) ?? 0) + 1;
}

export async function advanceStage(progressId: string, newState: string, predictionId?: string) {
  const { data, error } = await supabase
    .from("case_progress")
    .update({ state: newState, updated_at: new Date().toISOString() })
    .eq("id", progressId)
    .select()
    .single();
  if (error) throw error;

  if (newState === "awaiting_implementation_review") {
    await ensurePendingReview(progressId, "implementation");
  }

  if (newState === "awaiting_prediction_review") {
    await ensurePendingReview(progressId, "prediction", predictionId);
  }

  return data as DbCaseProgress;
}

export async function createCaseProgress(studentId: string, caseId: string, sessionId: string) {
  const { data, error } = await supabase
    .from("case_progress")
    .insert({
      student_id: studentId,
      case_id: caseId,
      session_id: sessionId,
      state: "building",
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbCaseProgress;
}

// ─── Predictions ─────────────────────────────────────────

export async function submitPrediction(progressId: string, predictionText: string, reasoningText: string) {
  const attemptNumber = await getNextPredictionAttemptNumber(progressId);
  const { data, error } = await supabase
    .from("predictions")
    .insert({
      case_progress_id: progressId,
      attempt_number: attemptNumber,
      prediction_text: predictionText,
      reasoning_text: reasoningText,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbPrediction;
}

// ─── Reviews ─────────────────────────────────────────────

/** Rich review queue item with joined student/case/prediction data */
export interface EnrichedReview {
  id: string; case_progress_id: string; review_type: string;
  prediction_id: string | null; requested_at: string; reviewed_at: string | null;
  reviewer_id: string | null; claimed_by: string | null; claimed_at: string | null;
  outcome: string | null; note: string | null;
  // joined from case_progress
  student_id: string; case_id: string; state: string;
  // joined from cases
  case_title: string; case_code: string | null; difficulty_lane: string;
  // joined from users (student)
  student_name: string;
  // joined from predictions
  prediction_text: string | null; reasoning_text: string | null;
}

/** Fetch review queue with rich joined data — student name, case title, predictions */
export async function getEnrichedReviewQueue() {
  const { data, error } = await supabase
    .from("reviews")
    .select(`
      id, case_progress_id, review_type, prediction_id, requested_at,
      reviewed_at, reviewer_id, claimed_by, claimed_at, outcome, note,
      case_progress!inner(student_id, case_id, state,
        users!case_progress_student_id_fkey(display_name),
        cases!case_progress_case_id_fkey(title, case_code, difficulty_lane)
      ),
      predictions!reviews_prediction_id_fkey(prediction_text, reasoning_text)
    `)
    .is("reviewed_at", null)
    .order("requested_at", { ascending: true });

  if (error) throw error;

  // Flatten the nested structure
  return (data || []).map((r: Record<string, unknown>) => {
    const cp = r.case_progress as Record<string, unknown> | null;
    const studentUser = cp?.users as Record<string, unknown> | null;
    const caseData = cp?.cases as Record<string, unknown> | null;
    // predictions is a single embedded object (one-to-one via prediction_id FK)
    const pred = r.predictions as Record<string, unknown> | null;
    return {
      id: r.id as string,
      case_progress_id: r.case_progress_id as string,
      review_type: r.review_type as string,
      prediction_id: r.prediction_id as string | null,
      requested_at: r.requested_at as string,
      reviewed_at: r.reviewed_at as string | null,
      reviewer_id: r.reviewer_id as string | null,
      claimed_by: r.claimed_by as string | null,
      claimed_at: r.claimed_at as string | null,
      outcome: r.outcome as string | null,
      note: r.note as string | null,
      student_id: (cp?.student_id ?? "") as string,
      case_id: (cp?.case_id ?? "") as string,
      state: (cp?.state ?? "") as string,
      student_name: (studentUser?.display_name ?? "Unknown") as string,
      case_title: (caseData?.title ?? "Untitled") as string,
      case_code: (caseData?.case_code ?? null) as string | null,
      difficulty_lane: (caseData?.difficulty_lane ?? "core") as string,
      prediction_text: (pred?.prediction_text ?? null) as string | null,
      reasoning_text: (pred?.reasoning_text ?? null) as string | null,
    } satisfies EnrichedReview;
  });
}

/** Fetch claimed reviews for a user with rich joined data */
export async function getEnrichedClaimedReviews(userId: string) {
  const { data, error } = await supabase
    .from("reviews")
    .select(`
      id, case_progress_id, review_type, prediction_id, requested_at,
      reviewed_at, reviewer_id, claimed_by, claimed_at, outcome, note,
      case_progress!inner(student_id, case_id, state,
        users!case_progress_student_id_fkey(display_name),
        cases!case_progress_case_id_fkey(title, case_code, difficulty_lane)
      ),
      predictions!reviews_prediction_id_fkey(prediction_text, reasoning_text)
    `)
    .eq("claimed_by", userId)
    .is("reviewed_at", null)
    .order("requested_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((r: Record<string, unknown>) => {
    const cp = r.case_progress as Record<string, unknown> | null;
    const studentUser = cp?.users as Record<string, unknown> | null;
    const caseData = cp?.cases as Record<string, unknown> | null;
    const pred = r.predictions as Record<string, unknown> | null;
    return {
      id: r.id as string,
      case_progress_id: r.case_progress_id as string,
      review_type: r.review_type as string,
      prediction_id: r.prediction_id as string | null,
      requested_at: r.requested_at as string,
      reviewed_at: r.reviewed_at as string | null,
      reviewer_id: r.reviewer_id as string | null,
      claimed_by: r.claimed_by as string | null,
      claimed_at: r.claimed_at as string | null,
      outcome: r.outcome as string | null,
      note: r.note as string | null,
      student_id: (cp?.student_id ?? "") as string,
      case_id: (cp?.case_id ?? "") as string,
      state: (cp?.state ?? "") as string,
      student_name: (studentUser?.display_name ?? "Unknown") as string,
      case_title: (caseData?.title ?? "Untitled") as string,
      case_code: (caseData?.case_code ?? null) as string | null,
      difficulty_lane: (caseData?.difficulty_lane ?? "core") as string,
      prediction_text: (pred?.prediction_text ?? null) as string | null,
      reasoning_text: (pred?.reasoning_text ?? null) as string | null,
    } satisfies EnrichedReview;
  });
}

/** Rich help request with student and case data */
export interface EnrichedHelpRequest {
  id: string; student_id: string; case_id: string;
  reason: string; raised_at: string;
  resolved_at: string | null; resolved_by: string | null;
  student_name: string; case_title: string;
}

export async function getEnrichedHelpRequests() {
  const { data, error } = await supabase
    .from("intervention_flags")
    .select(`
      id, student_id, case_id, reason, raised_at, resolved_at, resolved_by,
      users!intervention_flags_student_id_fkey(display_name),
      cases!intervention_flags_case_id_fkey(title)
    `)
    .is("resolved_at", null)
    .order("raised_at", { ascending: true });

  if (error) throw error;

  return (data || []).map((f: Record<string, unknown>) => {
    const studentUser = f.users as Record<string, unknown> | null;
    const caseData = f.cases as Record<string, unknown> | null;
    return {
      id: f.id as string,
      student_id: f.student_id as string,
      case_id: f.case_id as string,
      reason: f.reason as string,
      raised_at: f.raised_at as string,
      resolved_at: f.resolved_at as string | null,
      resolved_by: f.resolved_by as string | null,
      student_name: (studentUser?.display_name ?? "Unknown") as string,
      case_title: (caseData?.title ?? "Untitled") as string,
    } satisfies EnrichedHelpRequest;
  });
}

export async function getReviewQueue(_userId: string, reviewType?: string) {
  let q = supabase
    .from("reviews")
    .select("*, case_progress!inner(student_id, case_id, state), predictions(*)")
    .is("reviewed_at", null);

  if (reviewType) q = q.eq("review_type", reviewType);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

function claimedProgressState(reviewType: string) {
  return reviewType === "implementation"
    ? "implementation_review_claimed"
    : "prediction_review_claimed";
}

function resolvedProgressState(reviewType: string, outcome: string) {
  if (reviewType === "implementation") {
    return outcome === "approved" ? "implementation_approved" : "building";
  }

  return outcome === "approved" ? "prediction_approved" : "implementation_approved";
}

async function updateProgressState(progressId: string, state: string) {
  const { error } = await supabase
    .from("case_progress")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", progressId);

  if (error) throw error;
}

export async function claimReview(reviewId: string, userId: string) {
  const { data, error } = await supabase
    .from("reviews")
    .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
    .is("claimed_by", null) // first-write-wins
    .eq("id", reviewId)
    .select("*, case_progress_id, review_type")
    .single();
  if (error) throw error;

  await updateProgressState(
    data.case_progress_id,
    claimedProgressState(data.review_type)
  );

  return data;
}

export async function resolveReview(reviewId: string, userId: string, outcome: string, note?: string) {
  const { data, error } = await supabase
    .from("reviews")
    .update({
      reviewer_id: userId,
      reviewed_at: new Date().toISOString(),
      outcome,
      note: note || null,
    })
    .eq("id", reviewId)
    .select("*, case_progress_id, review_type")
    .single();
  if (error) throw error;

  await updateProgressState(
    data.case_progress_id,
    resolvedProgressState(data.review_type, outcome)
  );

  return data;
}

export async function getClaimedReviews(userId: string) {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("claimed_by", userId)
    .is("reviewed_at", null);
  if (error) throw error;
  return data;
}

// ─── Help Requests / Intervention ────────────────────────

export async function raiseHand(studentId: string, caseId: string) {
  const { data, error } = await supabase
    .from("intervention_flags")
    .insert({
      student_id: studentId,
      case_id: caseId,
      reason: "student_raise_hand",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getHelpRequests() {
  const { data, error } = await supabase
    .from("intervention_flags")
    .select("*")
    .is("resolved_at", null)
    .order("raised_at", { ascending: true });
  if (error) throw error;
  return data as DbInterventionFlag[];
}

export async function resolveHelpRequest(flagId: string, userId: string) {
  const { data, error } = await supabase
    .from("intervention_flags")
    .update({ resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", flagId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Mastery ─────────────────────────────────────────────

export async function getStudentMastery(studentId: string) {
  const { data, error } = await supabase
    .from("student_concept_mastery")
    .select("*")
    .eq("student_id", studentId);
  if (error) throw error;
  return data as { student_id: string; concept: string; mastery_pct: number }[];
}

// ─── Session Monitor ─────────────────────────────────────

export async function getSessionQueueHealth(sessionId: string) {
  const { data, error } = await supabase
    .from("case_progress")
    .select("state")
    .eq("session_id", sessionId);

  if (error) throw error;
  return (data || []) as { state: string }[];
}

export async function getSessionParticipants(sessionId: string) {
  const { data, error } = await supabase
    .from("session_participants")
    .select("student_id, users!inner(id, display_name, role)")
    .eq("session_id", sessionId);
  if (error) throw error;
  return data;
}
