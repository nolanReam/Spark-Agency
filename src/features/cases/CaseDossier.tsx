import { FileText, Target, Wrench, ListChecks, TrendingUp, Lightbulb } from "lucide-react";
import { Badge, Card, PlainText, SectionLabel } from "../../components/ui";

interface LaneDef { name: string; detail: string; available: boolean; }
interface CaseData {
  title?: string; client?: string; brief: string; mission: string;
  lanes: LaneDef[]; tools: string[]; initRules: string[];
  conceptWeights: Record<string, number>;
  transferHint: string;
}

export function CaseDossier({ caseData, showTransferHint }: { caseData: CaseData; showTransferHint: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <Card style={{ padding: "1.1rem" }}>
        <SectionLabel icon={FileText}>Client brief</SectionLabel>
        <PlainText style={{ fontSize: "0.88rem", lineHeight: 1.6, margin: "0.5rem 0 0" }}>{caseData.brief}</PlainText>
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionLabel icon={Target}>Mission</SectionLabel>
        <PlainText style={{ fontSize: "0.88rem", lineHeight: 1.6, margin: "0.5rem 0 0" }}>{caseData.mission}</PlainText>
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionLabel icon={Target}>Difficulty lanes</SectionLabel>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.4rem 0 0.65rem", lineHeight: 1.5 }}>
          <strong>Required</strong> is the case — everyone builds this. <strong>Extension</strong> and <strong>Challenge</strong> are optional add-ons to the same project.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
          {caseData.lanes.filter(lane => lane.available).map(lane => (
            <div key={lane.name} style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start" }}>
              <Badge tone={lane.name === "Required" ? "brand" : lane.name === "Extension" ? "accent" : "danger"}>{lane.name}</Badge>
              <PlainText style={{ fontSize: "0.83rem", lineHeight: 1.5, margin: 0 }}>{lane.detail}</PlainText>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionLabel icon={Wrench}>Tools allowed</SectionLabel>
        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.55rem", flexWrap: "wrap" }}>
          {caseData.tools.map(t => <Badge key={t}>{t}</Badge>)}
        </div>
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionLabel icon={ListChecks}>Initialization rules</SectionLabel>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", fontSize: "0.83rem", lineHeight: 1.65 }}>
          {caseData.initRules.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
          A volunteer checks these during your Implementation Review.
        </div>
      </Card>

      <Card style={{ padding: "1.1rem" }}>
        <SectionLabel icon={TrendingUp}>Mastery contribution</SectionLabel>
        <div style={{ marginTop: "0.55rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {Object.entries(caseData.conceptWeights).filter(([, v]) => v > 0).map(([concept, pts]) => (
            <div key={concept} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
              <span>{concept}</span><span style={{ fontWeight: 700, color: "var(--accent)" }}>+{pts} mastery</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginTop: "0.45rem" }}>
          Extension×1.25 · Challenge×1.5 · capped at 100%
        </div>
      </Card>

      {showTransferHint && (
        <Card style={{ padding: "1.1rem", background: "var(--surface-2)", borderStyle: "dashed" }}>
          <SectionLabel icon={Lightbulb} muted>Transfer hint</SectionLabel>
          <PlainText style={{ fontSize: "0.83rem", lineHeight: 1.6, margin: "0.5rem 0 0", color: "var(--text-muted)", fontStyle: "italic" }}>
            {caseData.transferHint}
          </PlainText>
        </Card>
      )}
    </div>
  );
}

export default CaseDossier;
