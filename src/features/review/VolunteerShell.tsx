import { useState } from "react";
import { Inbox, HelpCircle, ClipboardCheck, UserCheck, AlertCircle, CheckCircle2, ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { Badge, Card, Btn } from "../../components/ui";
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
  useActiveSession,
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

function ClaimedCard({ item, onResolve }: { item: QueueItem; onResolve: (item: QueueItem, outcome: string) => void }) {
  const typeTone = item.type === "Implementation" ? "brand" as const : item.type === "Prediction" ? "accent" as const : "danger" as const;
  const isHelp = item.type === "Help";

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
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        {isHelp ? <Btn variant="success" icon={CheckCircle2} size="sm" onClick={() => onResolve(item, "helped")}>Mark helped</Btn> : (
          <><Btn variant="success" icon={ThumbsUp} size="sm" onClick={() => onResolve(item, "approved")}>Approve</Btn><Btn variant="danger" icon={ThumbsDown} size="sm" onClick={() => onResolve(item, "returned")}>Send back</Btn></>
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
  const { data: enrichedReviews, isLoading: reviewsLoading, error: reviewsError } = useReviewQueue();
  const { data: enrichedHelp, isLoading: helpLoading } = useHelpRequests();
  const { data: enrichedClaimed, isLoading: claimedLoading } = useClaimedReviews(userId);
  const { data: activeSession } = useActiveSession();

  const claimReview = useClaimReview();
  const resolveReview = useResolveReview();
  const resolveHelp = useResolveHelp();

  // Derive queue items from enriched data
  const allQueue: QueueItem[] = [
    ...(enrichedReviews ?? []).map(reviewToItem).filter(q => q.status === "pending"),
    ...(enrichedHelp ?? []).map(helpToItem).filter(q => !claimedHelpIds.includes(q.id)),
  ];
  const claimedItems: QueueItem[] = [
    ...(enrichedClaimed ?? []).map(reviewToItem),
    ...(enrichedHelp ?? []).map(helpToItem).filter(q => claimedHelpIds.includes(q.id)),
  ];

  const pendingReviews = allQueue.filter(q => q.type !== "Help");
  const helpQueue = allQueue.filter(q => q.type === "Help");
  const sortedReviews = [...pendingReviews].sort((a, b) => b.waitMin - a.waitMin);
  const sortedHelp = [...helpQueue].sort((a, b) => b.waitMin - a.waitMin);
  const claimedIds = claimedItems.map(c => c.id);

  // Auth-dependent display name
  const volunteerName = "Volunteer"; // fallback; enriched data carries student names, not volunteer's own

  // ── Handlers ──
  const handleClaim = (item: QueueItem) => {
    if (!userId) return;
    if (item.type === "Help") {
      // Track locally as claimed so it moves to the Claimed tab
      setClaimedHelpIds(prev => [...prev, item.id]);
    } else {
      claimReview.mutate({ reviewId: item._reviewId!, userId });
    }
  };

  const handleResolve = (item: QueueItem, outcome: string) => {
    if (!userId) return;
    if (item.type === "Help") {
      resolveHelp.mutate({ flagId: item._helpId!, userId }, {
        onSuccess: () => {
          // Remove from local claimed list after resolving
          setClaimedHelpIds(prev => prev.filter(id => id !== item.id));
        },
      });
    } else {
      resolveReview.mutate({ reviewId: item._reviewId!, userId, outcome });
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
      {activeSession && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
          {activeSession.session_code}
        </div>
      )}
    </Card>
  );

  const loading = reviewsLoading || helpLoading || claimedLoading;

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
            {sortedHelp.length === 0 ? <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No help requests right now.</Card> : (
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
                {claimedItems.map(item => <ClaimedCard key={item.id} item={item} onResolve={handleResolve} />)}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
