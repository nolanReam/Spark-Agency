import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Inbox, HelpCircle, ClipboardCheck, UserCheck, AlertCircle, CheckCircle2, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { Badge, Card, Btn, Input, Textarea } from "../../components/ui";
import { TopBar, Sidebar } from "../../components/layout";
import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../hooks/useAuth";
import {
  useReviewQueue,
  useClaimedReviews,
  useClaimReview,
  useResolveReview,
  useHelpRequests,
  useResolveHelp,
  useJoinedLiveSession,
  useJoinSession,
} from "../../api/hooks";
import type { EnrichedReview, EnrichedHelpRequest } from "../../api/client";

// ─── Helpers ────────────────────────────────────────────────────────

/** Map DB state enum to a short display label */
function stageLabel(state: string): string {
  const map: Record<string, string> = {
    building: "Building",
    implementation_review_claimed: "Review claimed",
    awaiting_implementation_review: "Awaiting impl review",
    implementation_approved: "Impl approved",
    prediction_review_claimed: "Pred review claimed",
    awaiting_prediction_review: "Awaiting pred review",
    prediction_revision: "Revising prediction",
    prediction_approved: "Pred approved",
    testing_in_scratch: "Testing",
    reflection_pending: "Reflection",
    completed: "Completed",
  };
  return map[state] ?? state;
}

function escTone(min: number) { return min >= 20 ? "danger" as const : min >= 10 ? "warning" as const : "neutral" as const; }

/** Compute wait minutes from an ISO timestamp */
function waitMinutes(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

function joinErrorMessage(error: Error): string {
  const message = error.message.toLowerCase();
  if (message.includes("session code not found")) return "We couldn't find that session code.";
  if (message.includes("session is not open")) return "That session is no longer open.";
  if (message.includes("already joined to live session")) return "You're already joined to another live session.";
  if (message.includes("only students and volunteers")) return "This account cannot join a volunteer session.";
  return "Could not join the session. Please check the code and try again.";
}

function VolunteerJoinSession({ userId }: { userId: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const joinSession = useJoinSession(userId);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      setError("Enter a session code.");
      return;
    }

    setError(null);
    joinSession.mutate({ code: normalizedCode }, {
      onError: (joinError: Error) => setError(joinErrorMessage(joinError)),
    });
  };

  return (
    <main style={{ flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <Card style={{ width: "100%", maxWidth: 420, padding: "2rem" }}>
        <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.5rem", margin: "0 0 0.5rem" }}>Join a session</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 1.25rem" }}>Enter the session code provided by the instructor.</p>
        <form onSubmit={handleSubmit}>
          <Input value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="Enter session code" aria-label="Session code" autoCapitalize="characters" autoComplete="off" disabled={joinSession.isPending} />
          {error && <div style={{ color: "var(--danger)", background: "var(--danger-soft)", border: "1px solid var(--danger)", borderRadius: "8px", padding: "0.65rem 0.75rem", fontSize: "0.82rem", marginTop: "0.75rem" }}>{error}</div>}
          <Btn type="submit" disabled={joinSession.isPending} style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}>
            {joinSession.isPending ? "Joining…" : "Join session"}
          </Btn>
        </form>
      </Card>
    </main>
  );
}

// ─── QueueItem (derived from enriched API types) ────────────────────

interface QueueItem {
  id: string;
  student: string;
  caseTitle: string;
  stage: string;
  type: "Implementation" | "Prediction" | "Help";
  lane: string;
  waitMin: number;
  status: "pending" | "claimed";
  claimedBy: string | null;
  screenshotUrl: null; // removed — volunteers never upload screenshots
  prediction?: string;
  reasoning?: string;
  reason?: string;
  // Keep original IDs for mutations
  _reviewId?: string;
  _helpId?: string;
  _progressId?: string;
}

/** Convert enriched help request to QueueItem */
function helpToItem(h: EnrichedHelpRequest): QueueItem {
  return {
    id: h.id,
    student: h.student_name,
    caseTitle: h.case_title,
    stage: "",
    type: "Help",
    lane: "",
    waitMin: waitMinutes(h.raised_at),
    status: "pending",
    claimedBy: null,
    screenshotUrl: null,
    reason: h.reason,
    _helpId: h.id,
    _progressId: h.case_progress_id ?? undefined,
  };
}

/** Convert enriched review to QueueItem */
function reviewToItem(r: EnrichedReview): QueueItem {
  return {
    id: r.id,
    student: r.student_name,
    caseTitle: r.case_title,
    stage: stageLabel(r.state),
    type: r.review_type === "implementation" ? "Implementation" : "Prediction",
    lane: r.difficulty_lane ? r.difficulty_lane.charAt(0).toUpperCase() + r.difficulty_lane.slice(1) : "Core",
    waitMin: waitMinutes(r.requested_at),
    status: r.claimed_by ? "claimed" : "pending",
    claimedBy: r.claimed_by,
    screenshotUrl: null,
    prediction: r.prediction_text ?? undefined,
    reasoning: r.reasoning_text ?? undefined,
    _reviewId: r.id,
    _progressId: r.case_progress_id,
  };
}

// ─── Cards ──────────────────────────────────────────────────────────

function QueueCard({ item, onClaim, claimedIds }: { item: QueueItem; onClaim: (item: QueueItem) => void; claimedIds: string[] }) {
  const claimed = claimedIds.includes(item.id);
  const tone = escTone(item.waitMin);
  const border = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--border)";
  const typeTone = item.type === "Implementation" ? "brand" as const : item.type === "Prediction" ? "accent" as const : "danger" as const;

  return (
    <Card style={{ padding: "1rem", border: `1px solid ${border}`, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{item.student}</div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.caseTitle}</div>
          {item.stage && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Stage: {item.stage}</div>}
        </div>
        <Badge tone={tone === "neutral" ? "brand" : tone}>{item.waitMin} min</Badge>
      </div>
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        <Badge tone={typeTone}>{item.type === "Help" ? "Help request" : `${item.type} review`}</Badge>
        {item.type !== "Help" && item.lane && <Badge tone={item.lane === "Required" ? "neutral" : item.lane === "Extension" ? "accent" : "danger"}>{item.lane}</Badge>}
      </div>
      {item.type === "Help" && item.reason && (
        <div style={{ fontSize: "0.8rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
          <AlertCircle size={13} color="var(--danger)" style={{ flexShrink: 0, marginTop: "0.1rem" }} />{item.reason}
        </div>
      )}
      {item.prediction && <div style={{ fontSize: "0.78rem", lineHeight: 1.5, background: "var(--surface-2)", padding: "0.5rem", borderRadius: "7px" }}><strong>I think:</strong> {item.prediction}</div>}
      <div style={{ marginTop: "auto" }}>
        {!claimed ? <Btn variant="primary" size="sm" onClick={() => onClaim(item)}>Claim</Btn> : <Badge tone="success">Claimed by you</Badge>}
      </div>
    </Card>
  );
}

function ClaimedCard({ item, onResolve, isResolving }: {
  item: QueueItem;
  onResolve: (item: QueueItem, outcome: string, note?: string) => void;
  isResolving: boolean;
}) {
  const [returnNote, setReturnNote] = useState("");
  const [returnError, setReturnError] = useState<string | null>(null);
  const typeTone = item.type === "Implementation" ? "brand" as const : item.type === "Prediction" ? "accent" as const : "danger" as const;
  const isHelp = item.type === "Help";

  const handleReturn = () => {
    const trimmedNote = returnNote.trim();
    if (!trimmedNote) {
      setReturnError("Write a feedback note before returning this review.");
      return;
    }
    setReturnError(null);
    onResolve(item, "returned", trimmedNote);
  };

  return (
    <Card style={{ padding: "1rem", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div><div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{item.student}</div><div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{item.caseTitle}</div></div>
        <div style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}>
          <Badge tone={typeTone}>{item.type === "Help" ? "Help" : item.type}</Badge>
          {item.type !== "Help" && item.lane && <Badge tone={item.lane === "Required" ? "neutral" : item.lane === "Extension" ? "accent" : "danger"}>{item.lane}</Badge>}
        </div>
      </div>
      {isHelp && item.reason && <div style={{ fontSize: "0.82rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}><AlertCircle size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: "0.1rem" }} />{item.reason}</div>}
      {item.type === "Implementation" && <div style={{ fontSize: "0.78rem", padding: "0.55rem", borderRadius: "8px", background: "var(--surface-2)" }}>Walk through the Initialization Rules in person. Check any Extension/Challenge add-ons the student attempted.</div>}
      {item.prediction && (
        <div style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
          <div style={{ padding: "0.5rem", borderRadius: "7px", background: "var(--surface-2)", marginBottom: "0.4rem" }}><strong>I think:</strong> {item.prediction}</div>
          {item.reasoning && <div style={{ padding: "0.5rem", borderRadius: "7px", background: "var(--surface-2)" }}><strong>Because:</strong> {item.reasoning}</div>}
        </div>
      )}
      {!isHelp && (
        <div>
          <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.3rem" }}>Feedback for a return</label>
          <Textarea
            rows={3}
            value={returnNote}
            placeholder="Explain what the student should revise..."
            disabled={isResolving}
            onChange={event => {
              setReturnNote(event.target.value);
              if (returnError && event.target.value.trim()) setReturnError(null);
            }}
          />
          {returnError && <div style={{ marginTop: "0.35rem", color: "var(--danger)", fontSize: "0.76rem", fontWeight: 600 }}>{returnError}</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        {isHelp ? <Btn variant="success" icon={CheckCircle2} size="sm" onClick={() => onResolve(item, "helped")}>Mark helped</Btn> : (
          <><Btn variant="success" icon={ThumbsUp} size="sm" disabled={isResolving} onClick={() => onResolve(item, "approved")}>Approve</Btn><Btn variant="subtle" icon={ThumbsDown} size="sm" disabled={isResolving} onClick={handleReturn}>Return for revision</Btn></>
        )}
      </div>
    </Card>
  );
}

// ─── Shell ──────────────────────────────────────────────────────────

export function VolunteerShell({ role, theme, setTheme, onSignOut }: {
  role: UserRole; theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void; onSignOut?: () => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const [view, setView] = useState("queue");
  const [claimedHelpIds, setClaimedHelpIds] = useState<string[]>([]);

  // Live data hooks
  const joinedSessionQuery = useJoinedLiveSession(userId);
  const joinedSession = joinedSessionQuery.data;
  const sessionId = joinedSession?.id ?? "";
  const { data: enrichedReviews, isLoading: reviewsLoading, error: reviewsError } = useReviewQueue(sessionId);
  const { data: enrichedClaimed, isLoading: claimedLoading } = useClaimedReviews(userId, sessionId);
  const { data: enrichedHelp, isLoading: helpLoading, error: helpError } = useHelpRequests(sessionId);

  const claimReview = useClaimReview();
  const resolveReview = useResolveReview();
  const resolveHelp = useResolveHelp();

  useEffect(() => {
    if (joinedSession?.id) {
      setView("queue");
      setClaimedHelpIds([]);
    }
  }, [joinedSession?.id]);

  if (!userId || joinedSessionQuery.isLoading) {
    return <main style={{ flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", color: "var(--text-muted)" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading session…</main>;
  }

  if (joinedSessionQuery.isError) {
    return (
      <main style={{ flex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <Card style={{ maxWidth: 420, padding: "2rem", textAlign: "center" }}>
          <div style={{ color: "var(--danger)", marginBottom: "1rem" }}>Could not load your joined session.</div>
          <Btn variant="ghost" onClick={() => joinedSessionQuery.refetch()}>Try again</Btn>
        </Card>
      </main>
    );
  }

  if (!joinedSession) return <VolunteerJoinSession userId={userId} />;

  // Derive queue items from enriched data
  const allQueue: QueueItem[] = (enrichedReviews ?? []).map(reviewToItem);
  const helpQueue: QueueItem[] = (enrichedHelp ?? []).map(helpToItem).filter(item => !claimedHelpIds.includes(item.id));
  const claimedItems: QueueItem[] = [
    ...(enrichedClaimed ?? []).map(reviewToItem),
    ...(enrichedHelp ?? []).map(helpToItem).filter(item => claimedHelpIds.includes(item.id)),
  ];

  const sortedReviews = [...allQueue].sort((a, b) => b.waitMin - a.waitMin);
  const sortedHelp = [...helpQueue].sort((a, b) => b.waitMin - a.waitMin);
  const claimedIds = claimedItems.map(c => c.id);

  // Auth-dependent display name
  const volunteerName = "Volunteer"; // fallback; enriched data carries student names, not volunteer's own

  // ── Handlers ──
  const handleClaim = (item: QueueItem) => {
    if (!userId) return;
    if (item.type === "Help") {
      setClaimedHelpIds(previous => [...previous, item.id]);
    } else {
      claimReview.mutate({ reviewId: item._reviewId!, userId });
    }
  };

  const handleResolve = (item: QueueItem, outcome: string, note?: string) => {
    if (!userId) return;
    if (item.type === "Help") {
      resolveHelp.mutate({ flagId: item._helpId!, userId }, {
        onSuccess: () => setClaimedHelpIds(previous => previous.filter(id => id !== item.id)),
      });
    } else {
      resolveReview.mutate({ reviewId: item._reviewId!, userId, outcome, note });
    }
  };

  const navItems = [
    { key: "queue", label: "Review Queue", icon: Inbox },
    { key: "help", label: "Help Requests", icon: HelpCircle },
    { key: "claimed", label: "Claimed", icon: ClipboardCheck },
  ];

  const bottomContent = (
    <Card style={{ padding: "0.85rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
        <UserCheck size={13} color="var(--brand)" />
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Volunteer</span>
      </div>
      <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{volunteerName}</div>
      {joinedSession && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
          {joinedSession.session_code}
        </div>
      )}
    </Card>
  );

  const loading = reviewsLoading || claimedLoading || helpLoading;

  return (
    <>
      <Sidebar items={navItems} view={view} setView={setView} role={role} theme={theme} setTheme={setTheme} bottomContent={bottomContent} onSignOut={onSignOut} />
      <main style={{ flex: 1, padding: "1.75rem 2.25rem", overflow: "auto" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)", gap: "0.5rem" }}>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading queue…
          </div>
        )}
        {!loading && reviewsError && (
          <Card style={{ padding: "2rem", textAlign: "center", color: "var(--danger)" }}>Failed to load review queue. Please try again.</Card>
        )}
        {!loading && !reviewsError && view === "queue" && (
          <div>
            <TopBar title="Review Queue" subtitle="Implementation and prediction reviews — sorted by wait time"
              right={<div style={{ display: "flex", gap: "0.4rem" }}><Badge tone="brand">{sortedReviews.filter(q => q.type === "Implementation").length} impl</Badge><Badge tone="accent">{sortedReviews.filter(q => q.type === "Prediction").length} pred</Badge></div>}
            />
            {sortedReviews.length === 0 ? <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Queue is empty — great work!</Card> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "0.85rem" }}>
                {sortedReviews.map(item => <QueueCard key={item.id} item={item} onClaim={handleClaim} claimedIds={claimedIds} />)}
              </div>
            )}
          </div>
        )}
        {!loading && view === "help" && (
          <div>
            <TopBar title="Help Requests" subtitle="Students who raised their hand or were flagged as stuck" right={<Badge tone="danger">{sortedHelp.length} pending</Badge>} />
            {helpError ? <Card style={{ padding: "2rem", textAlign: "center", color: "var(--danger)" }}>Failed to load Help Requests. Please try again.</Card> : sortedHelp.length === 0 ? <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No help requests right now.</Card> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "0.85rem" }}>
                {sortedHelp.map(item => <QueueCard key={item.id} item={item} onClaim={handleClaim} claimedIds={claimedIds} />)}
              </div>
            )}
          </div>
        )}
        {!loading && view === "claimed" && (
          <div>
            <TopBar title="Claimed" subtitle="Items you've claimed — go find the student" right={<Badge tone="brand">{claimedItems.length} claimed</Badge>} />
            {claimedItems.length === 0 ? <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Nothing claimed. Pick something up from the queue.</Card> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "0.85rem" }}>
                {claimedItems.map(item => <ClaimedCard
                  key={item.id}
                  item={item}
                  onResolve={handleResolve}
                  isResolving={item.type !== "Help" && resolveReview.isPending}
                />)}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
