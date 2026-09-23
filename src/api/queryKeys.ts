export const instructorQueryKeys = {
  root: (userId: string) => ["instructor", userId] as const,
  casesRoot: (userId: string) =>
    [...instructorQueryKeys.root(userId), "cases"] as const,
  cases: (userId: string, status?: string) =>
    [...instructorQueryKeys.casesRoot(userId), status ?? "all"] as const,
  case: (userId: string, caseId: string) =>
    [...instructorQueryKeys.root(userId), "case", caseId] as const,
  caseBuilder: (userId: string, caseId: string) =>
    [...instructorQueryKeys.root(userId), "case-builder", caseId] as const,
  sessions: (userId: string) =>
    [...instructorQueryKeys.root(userId), "sessions"] as const,
  activeSession: (userId: string) =>
    [...instructorQueryKeys.root(userId), "active-session"] as const,
  session: (userId: string, sessionId: string) =>
    [...instructorQueryKeys.root(userId), "session", sessionId] as const,
  participants: (userId: string, sessionId: string) =>
    [...instructorQueryKeys.session(userId, sessionId), "participants"] as const,
  queueHealth: (userId: string, sessionId: string) =>
    [...instructorQueryKeys.session(userId, sessionId), "queue-health"] as const,
  helpRequests: (userId: string, sessionId: string) =>
    [...instructorQueryKeys.session(userId, sessionId), "help-requests"] as const,
};
