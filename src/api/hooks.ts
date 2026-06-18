import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./client";

// ─── Auth & Profile ──────────────────────────────────────

export function useStudentProfile(userId: string) {
  return useQuery({
    queryKey: ["student-profile", userId],
    queryFn: () => api.getStudentProfile(userId),
    enabled: !!userId,
  });
}

// ─── Cases ───────────────────────────────────────────────

export function useCases(status?: string) {
  return useQuery({
    queryKey: ["cases", status],
    queryFn: () => api.getCases(status),
  });
}

export function useCaseById(caseId: string) {
  return useQuery({
    queryKey: ["case", caseId],
    queryFn: () => api.getCaseById(caseId),
    enabled: !!caseId,
  });
}

export function useCaseLanes(caseId: string) {
  return useQuery({
    queryKey: ["case-lanes", caseId],
    queryFn: () => api.getCaseLanes(caseId),
    enabled: !!caseId,
  });
}

export function useCaseConceptWeights(caseId: string) {
  return useQuery({
    queryKey: ["case-concept-weights", caseId],
    queryFn: () => api.getCaseConceptWeights(caseId),
    enabled: !!caseId,
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createCase,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });
}

export function useUpdateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<api.DbCase> }) =>
      api.updateCase(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });
}

export function useDeleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.deleteCase(caseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cases"] }),
  });
}

// ─── Sessions ────────────────────────────────────────────

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: api.getSessions,
  });
}

export function useActiveSession() {
  return useQuery({
    queryKey: ["active-session"],
    queryFn: api.getActiveSession,
    // Poll every 30s since session status can change
    refetchInterval: 30_000,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionCode, caseIds, instructorId, status }: { sessionCode: string; caseIds: string[]; instructorId?: string; status?: string }) =>
      api.createSession(sessionCode, caseIds, instructorId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}

export function useUpdateSessionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, status }: { sessionId: string; status: string }) =>
      api.updateSessionStatus(sessionId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["active-session"] });
    },
  });
}

export function useSessionCases(sessionId: string) {
  return useQuery({
    queryKey: ["session-cases", sessionId],
    queryFn: () => api.getSessionCases(sessionId),
    enabled: !!sessionId,
  });
}

export function useJoinSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, studentId }: { code: string; studentId: string }) =>
      api.joinSession(code, studentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-session"] });
      qc.invalidateQueries({ queryKey: ["session-participants"] });
    },
  });
}

// ─── Case Progress ───────────────────────────────────────

export function useCreateCaseProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, caseId, sessionId }: { studentId: string; caseId: string; sessionId: string }) =>
      api.createCaseProgress(studentId, caseId, sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-progress"] });
    },
  });
}

export function useStudentProgress(studentId: string, sessionId?: string) {
  return useQuery({
    queryKey: ["student-progress", studentId, sessionId],
    queryFn: () => api.getStudentProgress(studentId, sessionId),
    enabled: !!studentId,
  });
}

export function useAdvanceStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ progressId, newState }: { progressId: string; newState: string }) =>
      api.advanceStage(progressId, newState),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-progress"] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["queue-health"] });
    },
  });
}

// ─── Predictions ─────────────────────────────────────────

export function useSubmitPrediction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ progressId, prediction, reasoning }: {
      progressId: string; prediction: string; reasoning: string;
    }) => api.submitPrediction(progressId, prediction, reasoning),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student-progress"] }),
  });
}

// ─── Reviews ─────────────────────────────────────────────

/** Enriched review queue with student names, case titles, prediction data */
export function useReviewQueue() {
  return useQuery({
    queryKey: ["review-queue-enriched"],
    queryFn: api.getEnrichedReviewQueue,
    refetchInterval: 20_000,
  });
}

/** Enriched claimed reviews for the current user */
export function useClaimedReviews(userId: string) {
  return useQuery({
    queryKey: ["claimed-reviews-enriched", userId],
    queryFn: () => api.getEnrichedClaimedReviews(userId),
    enabled: !!userId,
  });
}

export function useClaimReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, userId }: { reviewId: string; userId: string }) =>
      api.claimReview(reviewId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-queue-enriched"] });
      qc.invalidateQueries({ queryKey: ["claimed-reviews-enriched"] });
    },
  });
}

export function useResolveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, userId, outcome, note }: {
      reviewId: string; userId: string; outcome: string; note?: string;
    }) => api.resolveReview(reviewId, userId, outcome, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-queue-enriched"] });
      qc.invalidateQueries({ queryKey: ["claimed-reviews-enriched"] });
      qc.invalidateQueries({ queryKey: ["student-progress"] });
    },
  });
}

// ─── Help Requests ───────────────────────────────────────

export function useRaiseHand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, caseId }: { studentId: string; caseId: string }) =>
      api.raiseHand(studentId, caseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help-requests-enriched"] }),
  });
}

/** Enriched help requests with student names and case titles */
export function useHelpRequests() {
  return useQuery({
    queryKey: ["help-requests-enriched"],
    queryFn: api.getEnrichedHelpRequests,
    refetchInterval: 15_000,
  });
}

export function useResolveHelp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flagId, userId }: { flagId: string; userId: string }) =>
      api.resolveHelpRequest(flagId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["help-requests-enriched"] }),
  });
}

// ─── Mastery ─────────────────────────────────────────────

export function useStudentMastery(studentId: string) {
  return useQuery({
    queryKey: ["student-mastery", studentId],
    queryFn: () => api.getStudentMastery(studentId),
    enabled: !!studentId,
  });
}

// ─── Session Monitor ─────────────────────────────────────

export function useSessionQueueHealth(sessionId: string) {
  return useQuery({
    queryKey: ["queue-health", sessionId],
    queryFn: () => api.getSessionQueueHealth(sessionId),
    enabled: !!sessionId,
    refetchInterval: 20_000,
  });
}

export function useSessionParticipants(sessionId: string) {
  return useQuery({
    queryKey: ["session-participants", sessionId],
    queryFn: () => api.getSessionParticipants(sessionId),
    enabled: !!sessionId,
  });
}
