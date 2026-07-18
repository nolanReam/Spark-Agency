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

export function useCaseBuilderAggregate(caseId: string) {
  return useQuery({
    queryKey: ["case-builder", caseId],
    queryFn: () => api.getCaseBuilderAggregate(caseId),
    enabled: !!caseId,
  });
}

export function useSaveCaseBuilder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.saveCaseBuilder,
    onSuccess: async (caseId) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cases"] }),
        qc.invalidateQueries({ queryKey: ["case", caseId] }),
        qc.invalidateQueries({ queryKey: ["case-builder", caseId] }),
        qc.invalidateQueries({ queryKey: ["case-lanes", caseId] }),
        qc.invalidateQueries({ queryKey: ["case-concept-weights", caseId] }),
      ]);
    },
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

export function useJoinedLiveSession(userId: string) {
  return useQuery({
    queryKey: ["joined-live-session", userId],
    queryFn: () => api.getJoinedLiveSession(userId),
    enabled: !!userId,
    refetchInterval: userId ? 12_000 : false,
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
    mutationFn: ({ code }: { code: string }) => api.joinSession(code),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["joined-live-session"] }),
        qc.invalidateQueries({ queryKey: ["session-participants"] }),
      ]);
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

export function useStudentProgress(studentId: string, sessionId?: string, enabled = true) {
  return useQuery({
    queryKey: ["student-progress", studentId, sessionId],
    queryFn: () => api.getStudentProgress(studentId, sessionId),
    enabled: enabled && !!studentId,
    refetchInterval: enabled && studentId ? 4_000 : false,
  });
}

export function useAdvanceStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ progressId, newState, predictionId }: { progressId: string; newState: string; predictionId?: string }) =>
      api.advanceStage(progressId, newState, predictionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-progress"] });
      qc.invalidateQueries({ queryKey: ["review-queue-enriched"] });
      qc.invalidateQueries({ queryKey: ["queue-health"] });
      qc.invalidateQueries({ queryKey: ["student-review-feedback"] });
    },
  });
}

export function useSaveReflection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ progressId, reflectionText }: { progressId: string; reflectionText: string }) =>
      api.saveReflection(progressId, reflectionText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-progress"] });
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

export function useLatestApprovedPrediction(progressId: string, enabled = true) {
  return useQuery({
    queryKey: ["latest-approved-prediction", progressId],
    queryFn: () => api.getLatestApprovedPrediction(progressId),
    enabled: !!progressId && enabled,
  });
}

// ─── Reviews ─────────────────────────────────────────────

/** Enriched review queue with student names, case titles, prediction data */
export function useReviewQueue(sessionId: string) {
  return useQuery({
    queryKey: ["review-queue-enriched", sessionId],
    queryFn: () => api.getEnrichedReviewQueue(sessionId),
    enabled: !!sessionId,
    refetchInterval: sessionId ? 20_000 : false,
  });
}

export function useStudentReviewFeedback(progressId: string) {
  return useQuery({
    queryKey: ["student-review-feedback", progressId],
    queryFn: () => api.getStudentReviewFeedback(progressId),
    enabled: !!progressId,
    refetchInterval: progressId ? 4_000 : false,
  });
}

/** Enriched claimed reviews for the current user */
export function useClaimedReviews(userId: string, sessionId: string) {
  return useQuery({
    queryKey: ["claimed-reviews-enriched", userId, sessionId],
    queryFn: () => api.getEnrichedClaimedReviews(userId, sessionId),
    enabled: !!userId && !!sessionId,
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
      qc.invalidateQueries({ queryKey: ["student-progress"] });
      qc.invalidateQueries({ queryKey: ["queue-health"] });
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
      qc.invalidateQueries({ queryKey: ["queue-health"] });
      qc.invalidateQueries({ queryKey: ["student-review-feedback"] });
    },
  });
}

// ─── Help Requests ───────────────────────────────────────

export function useRaiseHand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ progressId }: { progressId: string }) => api.raiseHand(progressId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-requests-enriched"] });
      qc.invalidateQueries({ queryKey: ["active-raise-hand"] });
    },
  });
}

export function useActiveRaiseHand(progressId: string) {
  return useQuery({
    queryKey: ["active-raise-hand", progressId],
    queryFn: () => api.getActiveRaiseHand(progressId),
    enabled: !!progressId,
    refetchInterval: progressId ? 4_000 : false,
  });
}

export function useLowerHand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ progressId }: { progressId: string }) => api.lowerHand(progressId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-requests-enriched"] });
      qc.invalidateQueries({ queryKey: ["active-raise-hand"] });
    },
  });
}

/** Enriched help requests with student names and case titles */
export function useHelpRequests(sessionId?: string) {
  const isGlobalInstructorQuery = sessionId === undefined;
  return useQuery({
    queryKey: isGlobalInstructorQuery ? ["help-requests-enriched"] : ["help-requests-enriched", sessionId],
    queryFn: () => isGlobalInstructorQuery
      ? api.getGlobalEnrichedHelpRequests()
      : api.getEnrichedHelpRequests(sessionId!),
    enabled: isGlobalInstructorQuery || !!sessionId,
    refetchInterval: isGlobalInstructorQuery || sessionId ? 15_000 : false,
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
