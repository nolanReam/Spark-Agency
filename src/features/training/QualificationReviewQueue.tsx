import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import type { QualificationReviewItem } from "../../api/client";
import { useQualificationReviewQueue, useReviewQualification } from "../../api/hooks";
import { TopBar } from "../../components/layout";
import { Badge, Btn, Card, Field, Textarea } from "../../components/ui";

function QualificationReviewCard({ item, instructorId }: { item: QualificationReviewItem; instructorId: string }) {
  const review = useReviewQualification(instructorId);
  const [criteria, setCriteria] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rubric = item.qualification.rubric ?? [];
  const allPassed = rubric.length > 0 && rubric.every(criterion => criteria[criterion.code] === true);

  const submitReview = (outcome: "needs_retry" | "passed") => {
    if (outcome === "needs_retry" && !feedback.trim()) {
      setError("Write a short, actionable note before returning this for retry.");
      return;
    }
    setError(null);
    review.mutate({
      attemptId: item.id,
      criterionResults: Object.fromEntries(rubric.map(criterion => [criterion.code, criteria[criterion.code] ?? false])),
      outcome,
      feedback: outcome === "needs_retry" ? feedback.trim() : undefined,
    }, {
      onError: reviewError => setError(reviewError instanceof Error ? reviewError.message : "Review failed."),
    });
  };

  return (
    <Card style={{ padding: "1.15rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800 }}>{item.student_name}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{item.qualification.title} · {item.session_code}</div>
        </div>
        <Badge tone="accent">Submitted</Badge>
      </div>

      <div style={{ margin: "1rem 0", padding: "0.85rem", background: "var(--surface-2)", borderRadius: 9, fontSize: "0.84rem" }}>
        <div><strong>Project:</strong> {item.project_url ? <a href={item.project_url} target="_blank" rel="noreferrer">Open Scratch project <ExternalLink size={12} /></a> : "Missing"}</div>
        <p><strong>What changed:</strong> {item.change_summary || "Missing"}</p>
        <p><strong>How they tested:</strong> {item.testing_summary || "Missing"}</p>
        <div><strong>Student checks:</strong> {Object.entries(item.check_results ?? {}).filter(([, checked]) => checked).map(([code]) => code.replaceAll("_", " ")).join(", ") || "None"}</div>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.75rem" }}>
        <legend style={{ fontWeight: 800, fontSize: "0.84rem", marginBottom: "0.35rem" }}>Pass rubric</legend>
        {rubric.map(criterion => (
          <label key={criterion.code} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.83rem", marginTop: "0.45rem" }}>
            <input type="checkbox" checked={criteria[criterion.code] ?? false} onChange={event => setCriteria(current => ({ ...current, [criterion.code]: event.target.checked }))} />
            {criterion.label}
          </label>
        ))}
      </fieldset>

      <Field label="Retry note" hint="Required for Retry. Tell the student one clear thing to fix." htmlFor={`retry-note-${item.id}`}>
        <Textarea id={`retry-note-${item.id}`} rows={2} maxLength={500} value={feedback} onChange={event => setFeedback(event.target.value)} />
      </Field>
      {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.8rem", marginBottom: "0.65rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Btn variant="danger" icon={RotateCcw} disabled={review.isPending} onClick={() => submitReview("needs_retry")}>Retry</Btn>
        <Btn variant="success" icon={CheckCircle2} disabled={review.isPending || !allPassed} onClick={() => submitReview("passed")}>Pass and grant CL1</Btn>
      </div>
    </Card>
  );
}

export function QualificationReviewQueue({ instructorId }: { instructorId: string }) {
  const queue = useQualificationReviewQueue(instructorId);

  return (
    <div>
      <TopBar title="Training Reviews" subtitle="Junior Developer Qualification submissions" />
      {queue.isLoading && <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", padding: "3rem", color: "var(--text-muted)" }}><Loader2 size={18} /> Loading submissions…</div>}
      {queue.isError && <Card role="alert" style={{ padding: "1rem", color: "var(--danger)", border: "1px solid var(--danger)" }}>Could not load qualification submissions.</Card>}
      {!queue.isLoading && !queue.isError && (queue.data?.length ?? 0) === 0 && <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No qualifications are waiting for review.</Card>}
      <div style={{ display: "grid", gap: "0.85rem" }}>
        {(queue.data ?? []).map(item => <QualificationReviewCard key={item.id} item={item} instructorId={instructorId} />)}
      </div>
    </div>
  );
}
