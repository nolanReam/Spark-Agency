import { MessageSquareText, RotateCcw } from "lucide-react";
import { Badge, Card } from "../ui";

export function ReturnedForRevisionPanel({ reviewType, note }: {
  reviewType: "implementation" | "prediction";
  note: string | null;
}) {
  const isImplementation = reviewType === "implementation";
  const displayedNote = note?.trim() || "No written note was provided. Ask your volunteer what to revise.";

  return (
    <Card style={{ padding: "1.15rem", border: "1px solid var(--accent)", background: "var(--accent-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.55rem" }}>
        <RotateCcw size={16} color="var(--accent)" />
        <strong style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1rem" }}>Returned for revision</strong>
        <Badge tone="accent">{isImplementation ? "Implementation review" : "Prediction review"}</Badge>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: 700, marginBottom: "0.35rem" }}>
        <MessageSquareText size={14} /> A volunteer wrote:
      </div>
      <div style={{ padding: "0.7rem 0.8rem", borderRadius: "9px", background: "var(--surface)", fontSize: "0.86rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
        {displayedNote}
      </div>
      <p style={{ margin: "0.75rem 0 0", fontSize: "0.84rem", lineHeight: 1.5, fontWeight: 600 }}>
        {isImplementation
          ? "Update your project, then request implementation review again."
          : "Revise your prediction and submit it again."}
      </p>
    </Card>
  );
}
