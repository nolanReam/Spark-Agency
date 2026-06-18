import type { ReactNode } from "react";
import { Wrench, Hourglass, UserCheck, CheckCircle2, Lock, Send, ThumbsUp, ThumbsDown, Lightbulb, FlaskConical, Camera, Image } from "lucide-react";
import { Badge, Card, Btn, SectionLabel, Textarea, Field } from "../../components/ui";
import type { StageKey } from "../../lib/constants";

interface CaseData {
  predictPrompt: string; reflectionPrompt: string;
  lanes: { name: string; detail: string; available: boolean }[];
  reputationReward: number; conceptWeights: Record<string, number>;
}

interface Props {
  stage: StageKey;
  setStage: (s: StageKey) => void;
  caseData: CaseData;
  prediction: { think: string; because: string };
  setPrediction: (p: { think: string; because: string }) => void;
  laneAttempts: string[];
  setLaneAttempts: (a: string[]) => void;
  screenshot: string | null;
  setScreenshot: (s: string | null) => void;
  readOnly?: boolean;
}

function WaitingCard({ label, body, sim }: { label: string; body: string; sim: ReactNode }) {
  return (
    <Card style={{ padding: "1.25rem", border: "1px solid var(--accent)", background: "var(--accent-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <Hourglass size={16} color="var(--accent)" />
        <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)" }}>{label}</span>
      </div>
      <p style={{ fontSize: "0.87rem", lineHeight: 1.6, margin: "0 0 0.85rem" }}>{body}</p>
      <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginBottom: "0.55rem" }}>Demo controls (performed by volunteer in person):</div>
      {sim}
    </Card>
  );
}

function InProgressCard({ label, body, sim }: { label: string; body: string; sim: ReactNode }) {
  return (
    <Card style={{ padding: "1.25rem", border: "1px solid var(--brand)", background: "var(--brand-soft)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <UserCheck size={16} color="var(--brand)" />
        <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand)" }}>{label}</span>
      </div>
      <p style={{ fontSize: "0.87rem", lineHeight: 1.6, margin: "0 0 0.85rem" }}>{body}</p>
      <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginBottom: "0.55rem" }}>Demo controls (performed by volunteer in person):</div>
      {sim}
    </Card>
  );
}

export function StageActionPanel({ stage, setStage, caseData, prediction, setPrediction, laneAttempts, setLaneAttempts, screenshot, setScreenshot, readOnly }: Props) {
  switch (stage) {
    case "building":
      return (
        <Card style={{ padding: "1.25rem" }}>
          <SectionLabel icon={Wrench}>Build in Scratch</SectionLabel>
          <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", margin: "0.5rem 0 1rem", lineHeight: 1.6 }}>
            Open Scratch and build your project. Follow the Initialization Rules — the volunteer will check them.
          </p>
          {caseData.lanes.some(l => l.name !== "Required" && l.available) && (
            <div style={{ marginBottom: "1rem", padding: "0.85rem", borderRadius: "10px", background: "var(--surface-2)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>Optional add-ons attempted</div>
              {caseData.lanes.filter(l => l.name !== "Required" && l.available).map(lane => (
                <label key={lane.name} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.83rem", marginBottom: "0.3rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={laneAttempts.includes(lane.name)} onChange={e => {
                    if (e.target.checked) setLaneAttempts([...laneAttempts, lane.name]);
                    else setLaneAttempts(laneAttempts.filter(l => l !== lane.name));
                  }} />
                  I also attempted <Badge tone={lane.name === "Extension" ? "accent" : "danger"}>{lane.name}</Badge>
                </label>
              ))}
            </div>
          )}
          {/* Screenshot */}
          <div style={{ marginBottom: "1rem", padding: "0.85rem", borderRadius: "10px", background: "var(--surface-2)" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.4rem" }}>Optional screenshot</div>
            {!screenshot ? (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.83rem" }}>
                <Camera size={14} color="var(--text-muted)" />
                <span style={{ color: "var(--text-muted)" }}>Add a photo of your Scratch screen (optional, never required)</span>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={() => setScreenshot("placeholder")} />
              </label>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div style={{ width: 48, height: 36, background: "var(--border)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Image size={16} color="var(--text-muted)" />
                </div>
                <span style={{ fontSize: "0.82rem" }}>Screenshot attached</span>
                <Btn variant="ghost" size="sm" onClick={() => setScreenshot(null)}>Remove</Btn>
              </div>
            )}
          </div>
          <Btn variant="accent" icon={Send} disabled={readOnly} onClick={() => setStage("impl_review_requested")}>{readOnly ? "Read-only" : "Request Implementation Review"}</Btn>
        </Card>
      );

    case "impl_review_requested":
      return (
        <WaitingCard
          label="Implementation Review Requested"
          body="You're in the queue. Keep your Scratch project open — a volunteer will come check it against the Client Brief and Initialization Rules."
          sim={<Btn variant="primary" icon={UserCheck} onClick={() => setStage("impl_review_claimed")}>Volunteer claims (demo)</Btn>}
        />
      );

    case "impl_review_claimed":
      return (
        <InProgressCard
          label="A volunteer is reviewing your project"
          body="A volunteer has claimed your review and is on their way. They'll check your project against the brief, init rules, and any add-ons you attempted."
          sim={
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <Btn variant="success" icon={ThumbsUp} onClick={() => setStage("impl_approved")}>Approve</Btn>
              <Btn variant="danger" icon={ThumbsDown} onClick={() => setStage("building")}>Request changes</Btn>
            </div>
          }
        />
      );

    case "impl_approved":
      return (
        <Card style={{ padding: "1.25rem", border: "1px solid var(--success)", background: "var(--success-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <CheckCircle2 size={16} color="var(--success)" />
            <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--success)" }}>Implementation approved</span>
          </div>
          <p style={{ fontSize: "0.87rem", lineHeight: 1.6, margin: "0 0 0.85rem" }}>Your project matches the brief. Now predict what will happen before you test it.</p>
          <Btn variant="primary" onClick={() => setStage("prediction_submitted")}>Go to Predict & Prove</Btn>
        </Card>
      );

    case "prediction_submitted":
      return (
        <Card style={{ padding: "1.25rem", border: "1px solid var(--accent)", background: "var(--accent-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Lock size={16} color="var(--accent)" />
            <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)" }}>Predict & Prove</span>
          </div>
          <p style={{ fontSize: "0.87rem", lineHeight: 1.6, margin: "0 0 1rem" }}>{caseData.predictPrompt}</p>
          <Field label="I think...">
            <Textarea rows={2} value={prediction.think} placeholder="...the result will be..." readOnly={readOnly} onChange={e => setPrediction({ ...prediction, think: e.target.value })} />
          </Field>
          <Field label="Because...">
            <Textarea rows={3} value={prediction.because} placeholder="...I traced through the code and..." readOnly={readOnly} onChange={e => setPrediction({ ...prediction, because: e.target.value })} />
          </Field>
          <div style={{ marginTop: "0.85rem" }}>
            <Btn variant="accent" icon={Send} disabled={readOnly || !prediction.think.trim() || !prediction.because.trim()} onClick={() => setStage("prediction_review_requested")}>{readOnly ? "View prediction log" : "Submit prediction"}</Btn>
            {!readOnly && <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: "0.45rem" }}>Once submitted, your prediction is locked — you can't edit it.</div>}
          </div>
        </Card>
      );

    case "prediction_review_requested":
      return (
        <Card style={{ padding: "1.25rem", border: "1px solid var(--accent)", background: "var(--accent-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Hourglass size={16} color="var(--accent)" />
            <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)" }}>Prediction Review Requested</span>
          </div>
          <p style={{ fontSize: "0.87rem", lineHeight: 1.6, margin: "0 0 0.75rem" }}>Your prediction is locked and waiting in the queue.</p>
          <div style={{ marginBottom: "0.5rem" }}><div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>I think...</div><div style={{ fontSize: "0.82rem", padding: "0.55rem", borderRadius: "8px", background: "var(--surface)" }}>{prediction.think}</div></div>
          <div style={{ marginBottom: "0.85rem" }}><div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Because...</div><div style={{ fontSize: "0.82rem", padding: "0.55rem", borderRadius: "8px", background: "var(--surface)" }}>{prediction.because}</div></div>
          <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginBottom: "0.55rem" }}>Demo controls:</div>
          <Btn variant="primary" icon={UserCheck} onClick={() => setStage("prediction_review_claimed")}>Volunteer claims (demo)</Btn>
        </Card>
      );

    case "prediction_review_claimed":
      return (
        <InProgressCard
          label="A volunteer is reviewing your prediction"
          body="A volunteer has claimed your review and will talk through your reasoning before clearing you to test."
          sim={
            <div>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>I think...</div>
              <div style={{ fontSize: "0.82rem", padding: "0.55rem", borderRadius: "8px", background: "var(--surface)", marginBottom: "0.5rem" }}>{prediction.think}</div>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Because...</div>
              <div style={{ fontSize: "0.82rem", padding: "0.55rem", borderRadius: "8px", background: "var(--surface)", marginBottom: "0.75rem" }}>{prediction.because}</div>
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <Btn variant="success" icon={ThumbsUp} onClick={() => setStage("prediction_approved")}>Approve</Btn>
                <Btn variant="danger" icon={ThumbsDown} onClick={() => setStage("prediction_submitted")}>Send back</Btn>
              </div>
            </div>
          }
        />
      );

    case "prediction_approved":
      return (
        <Card style={{ padding: "1.25rem", border: "1px solid var(--success)", background: "var(--success-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <CheckCircle2 size={16} color="var(--success)" />
            <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--success)" }}>Prediction approved</span>
          </div>
          <p style={{ fontSize: "0.87rem", lineHeight: 1.6, margin: "0 0 0.75rem" }}>Great reasoning. You're cleared to test — go run your Scratch project.</p>
          <div style={{ marginBottom: "0.85rem" }}><div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Your prediction</div><div style={{ fontSize: "0.82rem", padding: "0.55rem", borderRadius: "8px", background: "var(--surface)" }}>{prediction.think}</div></div>
          <Btn variant="primary" onClick={() => setStage("testing")}>Go test in Scratch</Btn>
        </Card>
      );

    case "testing":
      return (
        <Card style={{ padding: "1.25rem", border: "1px solid var(--success)", background: "var(--success-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <FlaskConical size={16} color="var(--success)" />
            <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--success)" }}>Testing</span>
          </div>
          <p style={{ fontSize: "0.87rem", lineHeight: 1.6, margin: "0 0 0.75rem" }}>Run your Scratch project and compare what actually happens to your prediction.</p>
          <div style={{ marginBottom: "0.85rem" }}><div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Your prediction</div><div style={{ fontSize: "0.82rem", padding: "0.55rem", borderRadius: "8px", background: "var(--surface)" }}>{prediction.think}</div></div>
          <Btn variant="primary" onClick={() => setStage("reflection")}>I tested it — continue</Btn>
        </Card>
      );

    case "reflection":
      return (
        <Card style={{ padding: "1.25rem" }}>
          <SectionLabel icon={Lightbulb}>Reflection</SectionLabel>
          <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", margin: "0.5rem 0 0.75rem", lineHeight: 1.6 }}>{caseData.reflectionPrompt}</p>
          <Textarea rows={4} placeholder="My prediction was... what actually happened was..." readOnly={readOnly} />
          <div style={{ marginTop: "0.75rem" }}><Btn variant="primary" disabled={readOnly} onClick={() => setStage("complete")}>{readOnly ? "View reflection log" : "Submit reflection & complete case"}</Btn></div>
        </Card>
      );

    case "complete":
      return (
        <Card style={{ padding: "1.25rem", border: "1px solid var(--success)", background: "var(--success-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <CheckCircle2 size={18} color="var(--success)" />
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Case complete</span>
          </div>
          <p style={{ fontSize: "0.83rem", lineHeight: 1.6, margin: "0 0 0.85rem" }}>Your reflection has been logged. This case now counts toward your clearance progress and mastery.</p>
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <div><div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Reputation</div><div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: "1.2rem" }}>+{caseData.reputationReward + (laneAttempts.length * 10)}</div></div>
            <div><div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Mastery gained</div><div style={{ display: "flex", gap: "0.3rem", marginTop: "0.2rem", flexWrap: "wrap" }}>{Object.entries(caseData.conceptWeights).filter(([, v]) => v > 0).map(([c, v]) => <Badge key={c} tone="success">{c} +{v}</Badge>)}</div></div>
            {laneAttempts.length > 0 && <div><div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Add-ons</div><div style={{ display: "flex", gap: "0.3rem", marginTop: "0.2rem" }}>{laneAttempts.map(l => <Badge key={l} tone={l === "Extension" ? "accent" : "danger"}>{l}</Badge>)}</div></div>}
          </div>
        </Card>
      );

    default:
      return null;
  }
}
