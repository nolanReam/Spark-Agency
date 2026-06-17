import { useState } from "react";
import { Activity, Layers, Calendar, BarChart3, Users, ShieldCheck, StopCircle, AlertCircle, Clock, UserCheck, Inbox, HelpCircle, CheckCircle2, Plus, Copy, Archive, Pencil, PlayCircle, Layers3, FileText, Target, Wrench, ListChecks, TrendingUp, Lock, ArrowRight, Lightbulb, X, Loader2 } from "lucide-react";
import { Badge, Card, Btn, SectionLabel, Input, Textarea, Field, ThinBar } from "../../components/ui";
import { TopBar, Sidebar } from "../../components/layout";
import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../hooks/useAuth";
import { CONCEPTS, CLEARANCE_LEVELS } from "../../lib/constants";
import {
  useCases, useCreateCase, useUpdateCase, useCaseLanes, useCaseConceptWeights,
  useSessions, useActiveSession, useSessionParticipants, useSessionQueueHealth,
  useHelpRequests, useStudentProgress, useCreateSession, useUpdateSessionStatus,
} from "../../api/hooks";
import type { DbCase, DbSession, EnrichedHelpRequest } from "../../api/client";
import { generateSessionCode } from "../../api/client";

// ─── Shared helpers ─────────────────────────────────────────────────

function escTone(min: number) { return min >= 20 ? "danger" as const : min >= 10 ? "warning" as const : "neutral" as const; }

const DB_STATE_LABEL: Record<string, string> = {
  building: "Building",
  implementation_review_claimed: "Impl Review — In Progress",
  awaiting_implementation_review: "Impl Review — Waiting",
  implementation_approved: "Impl Approved",
  prediction_review_claimed: "Pred Review — In Progress",
  awaiting_prediction_review: "Pred Review — Waiting",
  prediction_approved: "Pred Approved",
  testing_in_scratch: "Testing",
  reflection_pending: "Reflection",
  completed: "Complete",
};

// ─── Case List View ─────────────────────────────────────────────────

function CaseListView({ cases, onNew, onEdit }: {
  cases: DbCase[]; onNew: () => void; onEdit: (c: DbCase) => void;
}) {
  const [tab, setTab] = useState("published");
  const filtered = cases.filter(c => c.status === tab);
  const counts = { draft: cases.filter(c => c.status === "draft").length, published: cases.filter(c => c.status === "published").length, archived: cases.filter(c => c.status === "archived").length };

  return (
    <div>
      <TopBar title="Case Builder" subtitle="Manage your curriculum case files" right={<Btn variant="primary" icon={Plus} onClick={onNew}>New case</Btn>} />
      <div style={{ display: "flex", gap: "0.25rem", background: "var(--surface-2)", borderRadius: "10px", padding: "0.25rem", border: "1px solid var(--border)", width: "fit-content", marginBottom: "1.25rem" }}>
        {(["draft", "published", "archived"] as const).map(s => (
          <button key={s} onClick={() => setTab(s)} style={{ padding: "0.4rem 0.85rem", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, fontFamily: "'IBM Plex Sans',sans-serif", textTransform: "capitalize", background: tab === s ? "var(--surface)" : "transparent", color: tab === s ? "var(--brand)" : "var(--text-muted)", boxShadow: tab === s ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
            {s} <Badge tone={s === "published" ? "success" : s === "draft" ? "warning" : "neutral"}>{counts[s]}</Badge>
          </button>
        ))}
      </div>
      {filtered.length === 0 && <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No {tab} cases.</Card>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {filtered.map(c => (
          <Card key={c.id} style={{ padding: "1rem 1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',sans-serif", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>{c.case_code ?? "—"}</span>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{c.title}</span>
                  {c.status === "published" && <Badge tone="success">Published</Badge>}
                  {c.status === "draft" && <Badge tone="warning">Draft</Badge>}
                  {c.status === "archived" && <Badge>Archived</Badge>}
                </div>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  <span>CL-{c.min_clearance}+</span><span>+{c.reputation_reward} rep</span><span>~{c.estimated_minutes} min</span>
                  <span style={{ display: "flex", gap: "0.3rem" }}>{(c.concept_tags ?? []).map((concept: string) => <Badge key={concept}>{concept}</Badge>)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(c)}>Edit</Btn>
                <Btn variant="ghost" size="sm" icon={Copy}>Duplicate</Btn>
                {c.status === "draft" && <Btn variant="primary" size="sm">Publish</Btn>}
                {c.status === "published" && <Btn variant="subtle" size="sm" icon={Archive}>Archive</Btn>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Case Builder Form ──────────────────────────────────────────────

interface CaseFormData {
  id?: string; case_code: string; title: string; client_brief: string;
  min_clearance: number; reputation_reward: number; estimated_minutes: number;
  mission: string; tools_allowed: string;
  predict_prove_prompt: string; reflection_prompt: string; transfer_hint: string;
  concept_tags: string[];
  concept_weights: Record<string, number>;
  lanes: { name: string; detail: string; available: boolean }[];
  init_rules: string[];
}

function emptyCaseForm(): CaseFormData {
  return {
    case_code: "", title: "", client_brief: "", min_clearance: 1,
    reputation_reward: 25, estimated_minutes: 20, mission: "",
    tools_allowed: "", predict_prove_prompt: "", reflection_prompt: "",
    transfer_hint: "", concept_tags: [],
    concept_weights: Object.fromEntries(CONCEPTS.map(c => [c, 0])),
    lanes: [{ name: "Required", detail: "", available: true }, { name: "Extension", detail: "", available: false }, { name: "Challenge", detail: "", available: false }],
    init_rules: [""],
  };
}

function dbToForm(c: DbCase): CaseFormData {
  return {
    id: c.id, case_code: c.case_code ?? "", title: c.title,
    client_brief: c.client_brief, min_clearance: c.min_clearance,
    reputation_reward: c.reputation_reward, estimated_minutes: c.estimated_minutes ?? 20,
    mission: c.mission, tools_allowed: (c.tools_allowed ?? []).join(", "),
    predict_prove_prompt: c.predict_prove_prompt ?? "",
    reflection_prompt: c.reflection_prompt ?? "",
    transfer_hint: c.transfer_hint ?? "",
    concept_tags: c.concept_tags ?? [],
    concept_weights: {}, // Not in DbCase
    lanes: [{ name: "Required", detail: "", available: true }, { name: "Extension", detail: "", available: false }, { name: "Challenge", detail: "", available: false }],
    init_rules: c.constraints ? [c.constraints] : [""],
  };
}

function formToDbPartial(f: CaseFormData): Partial<DbCase> {
  return {
    ...(f.id ? { id: f.id } : {}),
    case_code: f.case_code || null, title: f.title,
    client_brief: f.client_brief, min_clearance: f.min_clearance,
    reputation_reward: f.reputation_reward, estimated_minutes: f.estimated_minutes,
    mission: f.mission, tools_allowed: f.tools_allowed ? f.tools_allowed.split(",").map(s => s.trim()).filter(Boolean) : [],
    predict_prove_prompt: f.predict_prove_prompt || null,
    reflection_prompt: f.reflection_prompt || null,
    transfer_hint: f.transfer_hint || null,
    concept_tags: f.concept_tags,
    constraints: f.init_rules.filter(r => r.trim()).join("\n") || null,
    status: "draft",
  };
}

function CaseBuilderForm({ existing, onBack }: { existing: DbCase | null; onBack: () => void }) {
  const isNew = !existing;
  const [form, setForm] = useState<CaseFormData>(existing ? dbToForm(existing) : emptyCaseForm());
  const createCase = useCreateCase();
  const updateCase = useUpdateCase();

  const set = (k: string, v: unknown) => setForm((f: CaseFormData) => ({ ...f, [k]: v }));
  const setWeight = (concept: string, v: string) => setForm((f: CaseFormData) => ({ ...f, concept_weights: { ...f.concept_weights, [concept]: parseInt(v) || 0 } }));
  const setLane = (i: number, key: string, val: unknown) => { const lanes = [...form.lanes]; (lanes[i] as Record<string, unknown>)[key] = val; set("lanes", lanes); };
  const addInitRule = () => set("init_rules", [...form.init_rules, ""]);
  const setInitRule = (i: number, v: string) => { const r = [...form.init_rules]; r[i] = v; set("init_rules", r); };
  const removeInitRule = (i: number) => set("init_rules", form.init_rules.filter((_, idx) => idx !== i));

  const handleSaveDraft = () => {
    const data = formToDbPartial(form);
    if (isNew) createCase.mutate(data, { onSuccess: () => onBack() });
    else updateCase.mutate({ id: form.id!, updates: data }, { onSuccess: () => onBack() });
  };

  return (
    <div>
      <TopBar title={isNew ? "New Case" : "Edit Case"} subtitle={isNew ? "Create a new case file" : `${existing?.case_code ?? ""} — ${existing?.title ?? ""}`} onBack={onBack} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <div>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={FileText}>Case metadata</SectionLabel>
            <div style={{ marginTop: "0.85rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field label="Case Code"><Input placeholder="L1-06" value={form.case_code} onChange={e => set("case_code", e.target.value)} /></Field>
                <Field label="Client Brief (short)"><Input placeholder="Client / Organization" value={form.client_brief} onChange={e => set("client_brief", e.target.value)} /></Field>
              </div>
              <Field label="Case Title"><Input placeholder="Descriptive project title" value={form.title} onChange={e => set("title", e.target.value)} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <Field label="Min Clearance">
                  <select value={form.min_clearance} onChange={e => set("min_clearance", Number(e.target.value))} style={{ width: "100%", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.875rem", fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    {CLEARANCE_LEVELS.map(l => <option key={l.level} value={l.level}>CL-{l.level} — {l.title}</option>)}
                  </select>
                </Field>
                <Field label="Reputation Reward"><Input type="number" min={5} max={100} value={form.reputation_reward} onChange={e => set("reputation_reward", Number(e.target.value))} /></Field>
                <Field label="Est. Minutes"><Input type="number" min={5} max={120} value={form.estimated_minutes} onChange={e => set("estimated_minutes", Number(e.target.value))} /></Field>
              </div>
            </div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={FileText}>Client Brief & Mission</SectionLabel>
            <div style={{ marginTop: "0.75rem" }}>
              <Field label="Client Brief"><Textarea rows={3} value={form.client_brief} placeholder="Describe the client scenario..." onChange={e => set("client_brief", e.target.value)} /></Field>
              <Field label="Mission"><Textarea rows={2} value={form.mission} placeholder="What the student needs to build..." onChange={e => set("mission", e.target.value)} /></Field>
            </div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={Target}>Difficulty lanes</SectionLabel>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.4rem 0 0.75rem" }}>Required is always on. Extension and Challenge are optional add-ons.</p>
            {form.lanes.map((lane, i) => (
              <div key={lane.name} style={{ padding: "0.85rem", borderRadius: "10px", background: "var(--surface-2)", marginBottom: "0.5rem", opacity: !lane.available && lane.name !== "Required" ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <Badge tone={lane.name === "Required" ? "brand" : lane.name === "Extension" ? "accent" : "danger"}>{lane.name}</Badge>
                  {lane.name !== "Required" && <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", cursor: "pointer" }}><input type="checkbox" checked={lane.available} onChange={e => setLane(i, "available", e.target.checked)} />Available</label>}
                </div>
                <Textarea rows={2} value={lane.detail} placeholder={`Describe the ${lane.name} lane requirements...`} onChange={e => setLane(i, "detail", e.target.value)} />
              </div>
            ))}
          </Card>
          <Card style={{ padding: "1.25rem" }}>
            <SectionLabel icon={Wrench}>Tools allowed</SectionLabel>
            <div style={{ marginTop: "0.75rem" }}><Input placeholder="repeat, variables, operators (+, <), say block" value={form.tools_allowed} onChange={e => set("tools_allowed", e.target.value)} /></div>
          </Card>
        </div>
        <div>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={ListChecks}>Initialization rules</SectionLabel>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.4rem 0 0.75rem" }}>Exact starting conditions the volunteer checks during Implementation Review.</p>
            {form.init_rules.map((rule, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.4rem" }}>
                <Input value={rule} placeholder={`Rule ${i + 1}...`} onChange={e => setInitRule(i, e.target.value)} style={{ flex: 1 }} />
                {form.init_rules.length > 1 && <button onClick={() => removeInitRule(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0.3rem" }}><X size={14} /></button>}
              </div>
            ))}
            <Btn variant="ghost" size="sm" icon={Plus} onClick={addInitRule}>Add rule</Btn>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={TrendingUp}>Concept weights</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem 0.75rem", marginTop: "0.75rem" }}>
              {CONCEPTS.map(concept => (
                <div key={concept} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <label style={{ fontSize: "0.82rem" }}>{concept}</label>
                  <input type="number" min={0} max={15} value={form.concept_weights[concept]} onChange={e => setWeight(concept, e.target.value)} style={{ width: 52, padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.82rem", fontFamily: "'IBM Plex Sans',sans-serif", textAlign: "right" }} />
                </div>
              ))}
            </div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={Lock}>Predict & Prove prompt</SectionLabel>
            <div style={{ marginTop: "0.75rem" }}><Textarea rows={3} value={form.predict_prove_prompt} placeholder="What will your project output / do?" onChange={e => set("predict_prove_prompt", e.target.value)} /></div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={Lightbulb}>Reflection prompt</SectionLabel>
            <div style={{ marginTop: "0.75rem" }}><Textarea rows={2} value={form.reflection_prompt} placeholder="What actually happened?" onChange={e => set("reflection_prompt", e.target.value)} /></div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1.25rem" }}>
            <SectionLabel icon={ArrowRight}>Transfer hint</SectionLabel>
            <Textarea rows={2} value={form.transfer_hint} placeholder="This pattern appears in real software when..." onChange={e => set("transfer_hint", e.target.value)} />
          </Card>
          <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
            <Btn variant="subtle" onClick={handleSaveDraft}>Save as draft</Btn>
            <Btn variant="primary">Publish case</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Session List View ──────────────────────────────────────────────

function SessionListView({ sessions, onNew, onMonitor }: {
  sessions: DbSession[]; onNew: () => void; onMonitor: (s: DbSession) => void;
}) {
  const statusTone = (s: string) => s === "active" ? "success" as const : s === "closed" ? "neutral" as const : "brand" as const;
  return (
    <div>
      <TopBar title="Sessions" subtitle="Workshop session lifecycle" right={<Btn variant="primary" icon={Plus} onClick={onNew}>New session</Btn>} />
      {sessions.length === 0 && <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No sessions yet.</Card>}
      {sessions.map(s => (
        <Card key={s.id} style={{ padding: "1rem 1.25rem", marginBottom: "0.6rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
                <span style={{ fontFamily: "'IBM Plex Mono',sans-serif", fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>{s.session_code}</span>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{/* sessions have no title field */}</span>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                <span>{s.started_at ? new Date(s.started_at).toLocaleDateString() : "—"}</span>
                <span>{(s.case_ids ?? []).length} cases</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
              {(s.status === "active" || s.status === "open") && <Btn variant="primary" size="sm" onClick={() => onMonitor(s)}>Monitor</Btn>}
              {s.status === "closed" && <Btn variant="ghost" size="sm">Summary</Btn>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ─── Session Builder View ───────────────────────────────────────────

function SessionBuilderView({ cases, onBack }: { cases: DbCase[]; onBack: () => void }) {
  const { user } = useAuth();
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const createSession = useCreateSession();
  const updateStatus = useUpdateSessionStatus();
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const publishedCases = cases.filter(c => c.status === "published");
  const toggleCase = (id: string) => { if (selectedCases.includes(id)) setSelectedCases(selectedCases.filter(c => c !== id)); else setSelectedCases([...selectedCases, id]); };

  const handleGenerateCode = () => {
    setError(null);
    const code = generateSessionCode();
    setSessionCode(code);
    // Immediately persist the draft session
    createSession.mutate(
      { sessionCode: code, caseIds: selectedCases, instructorId: user?.id },
      {
        onSuccess: (data) => {
          setCreatedSessionId(data.id);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Failed to create session");
          setSessionCode(null);
        },
      }
    );
  };

  const handleOpenSession = () => {
    if (!createdSessionId) return;
    updateStatus.mutate(
      { sessionId: createdSessionId, status: "open" },
      {
        onSuccess: () => onBack(),
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Failed to open session");
        },
      }
    );
  };

  const isCreating = createSession.isPending;
  const isOpening = updateStatus.isPending;

  return (
    <div>
      <TopBar title="New Session" subtitle="Configure and open a workshop session" onBack={onBack} />
      {error && (
        <Card style={{ padding: "0.75rem 1rem", marginBottom: "1rem", background: "var(--danger-soft)", border: "1px solid var(--danger)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--danger)", fontSize: "0.85rem" }}>
            <AlertCircle size={16} /> {error}
          </div>
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <div>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={Calendar}>Session details</SectionLabel>
            <div style={{ marginTop: "0.85rem" }}>
              {sessionCode && (
                <div style={{ padding: "0.85rem", borderRadius: "10px", background: "var(--success-soft)", border: "1px solid var(--success)", marginBottom: "0.5rem" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--success)", marginBottom: "0.3rem" }}>Session code generated</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.4rem", fontWeight: 700 }}>{sessionCode}</div>
                </div>
              )}
              {createSession.isError && (
                <div style={{ padding: "0.75rem", borderRadius: "8px", background: "var(--danger-soft)", border: "1px solid var(--danger)", color: "var(--danger)", fontSize: "0.82rem", marginBottom: "0.5rem" }}>
                  {error}
                </div>
              )}
              <Btn
                variant={sessionCode ? "subtle" : "accent"}
                onClick={handleGenerateCode}
                disabled={isCreating}
                style={{ marginTop: sessionCode ? "0.25rem" : "0.5rem", width: "100%" }}
              >
                {isCreating ? (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Creating…
                  </span>
                ) : sessionCode ? (
                  "Regenerate session code"
                ) : (
                  "Generate session code"
                )}
              </Btn>
            </div>
          </Card>
          <Card style={{ padding: "1.25rem" }}>
            <SectionLabel icon={FileText}>Session lifecycle</SectionLabel>
            {[{ state: "draft", label: "Draft", body: "Code generated, cases assigned." }, { state: "open", label: "Open", body: "Code is live. Students can join." }, { state: "active", label: "Active", body: "Workshop is live — queues open." }, { state: "closing", label: "Closing", body: "New requests blocked." }, { state: "closed", label: "Closed", body: "Session ended." }].map((s, i) => (
              <div key={s.state} style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: i === 0 ? "var(--brand)" : "var(--surface-2)", color: i === 0 ? "#fff" : "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div><div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{s.label}</div><div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{s.body}</div></div>
              </div>
            ))}
          </Card>
        </div>
        <Card style={{ padding: "1.25rem", height: "fit-content" }}>
          <SectionLabel icon={Layers3}>Assign cases</SectionLabel>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.4rem 0 0.85rem" }}>Only published cases can be assigned.</p>
          {publishedCases.map(c => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.65rem 0.75rem", borderRadius: "9px", background: selectedCases.includes(c.id) ? "var(--brand-soft)" : "var(--surface-2)", border: `1px solid ${selectedCases.includes(c.id) ? "var(--brand)" : "transparent"}`, cursor: "pointer", marginBottom: "0.5rem" }}>
              <input type="checkbox" checked={selectedCases.includes(c.id)} onChange={() => toggleCase(c.id)} />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{c.title}</div><div style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>{c.case_code ?? ""} · CL-{c.min_clearance}+</div></div>
              <div style={{ display: "flex", gap: "0.3rem" }}>{(c.concept_tags ?? []).map((concept: string) => <Badge key={concept}>{concept}</Badge>)}</div>
            </label>
          ))}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
            <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
            <Btn
              variant="primary"
              icon={PlayCircle}
              disabled={!sessionCode || selectedCases.length === 0 || isCreating || isOpening}
              onClick={handleOpenSession}
            >
              {isOpening ? "Opening…" : "Open session"}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Session Monitor View ───────────────────────────────────────────

function SessionMonitorView({ session, participants, queueHealth, helpRequests, onBack }: {
  session: DbSession | null; participants: { student_id: string; display_name?: string; role?: string }[];
  queueHealth: { state: string }[]; helpRequests: EnrichedHelpRequest[]; onBack: (() => void) | null;
}) {
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);

  const studentsPresent = participants.filter(p => p.role === "student").length;
  const volunteersActive = participants.filter(p => p.role === "volunteer").length;

  // Aggregate queue health by state
  const stateCounts: Record<string, number> = {};
  queueHealth.forEach(q => { stateCounts[q.state] = (stateCounts[q.state] || 0) + 1; });

  const pendingReviews = (stateCounts["awaiting_implementation_review"] || 0) + (stateCounts["awaiting_prediction_review"] || 0);
  const pendingHelp = helpRequests.length;
  const max = Math.max(...Object.values(stateCounts), 1);

  const helpItems = helpRequests.map(h => ({ id: h.id, student: h.student_name, caseTitle: h.case_title, waitMin: Math.round((Date.now() - new Date(h.raised_at).getTime()) / 60_000), reason: h.reason }));

  if (closed) return (
    <div>
      <TopBar title="Session Closed" subtitle="Summary generated" onBack={onBack ?? undefined} />
      <Card style={{ padding: "1.25rem", border: "1px solid var(--success)", background: "var(--success-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}><CheckCircle2 size={18} color="var(--success)" /><span style={{ fontWeight: 700 }}>Session closed successfully</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "0.75rem" }}>
          {[["Students present", studentsPresent], ["Reviews pending", queueHealth.length], ["Help requests", pendingHelp]].map(([label, val]) => (
            <div key={label as string}><div style={{ fontSize: "0.72rem", color: "var(--success)", textTransform: "uppercase", marginBottom: "0.2rem" }}>{label as string}</div><div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: "1.15rem" }}>{String(val)}</div></div>
          ))}
        </div>
      </Card>
    </div>
  );

  const sessionTitle = session?.session_code ?? "No active session";

  return (
    <div>
      <TopBar title="Session Monitor" subtitle={sessionTitle}
        right={<div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Badge tone="success">Session live</Badge>
          {!closing ? <Btn variant="subtle" icon={StopCircle} size="sm" onClick={() => setClosing(true)}>Close session</Btn> : (
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--danger)" }}>Confirm close?</span>
              <Btn variant="danger" size="sm" onClick={() => setClosed(true)}>Yes, close</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setClosing(false)}>Cancel</Btn>
            </div>
          )}
        </div>}
        onBack={onBack ?? (() => {})}
      />
      {closing && !closed && (
        <Card style={{ padding: "0.85rem", border: "1px solid var(--warning)", background: "var(--warning-soft)", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}><AlertCircle size={15} color="var(--warning)" />Closing is a two-step process. New review requests will be blocked.</div>
        </Card>
      )}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {[{ icon: Users, label: "Students", val: studentsPresent }, { icon: UserCheck, label: "Volunteers", val: volunteersActive }, { icon: Inbox, label: "Pending reviews", val: pendingReviews, tone: "var(--accent)" }, { icon: HelpCircle, label: "Help requests", val: pendingHelp, tone: "var(--danger)" }].map(k => (
          <Card key={k.label} style={{ padding: "1rem", flex: "1 1 0", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.4rem" }}><k.icon size={13} /><span>{k.label}</span></div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.6rem", fontWeight: 700, color: (k as { tone?: string }).tone || "var(--text)" }}>{k.val}</div>
          </Card>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "1.25rem" }}>
        <Card style={{ padding: "1.25rem" }}>
          <SectionLabel icon={Activity}>Queue health — students per stage</SectionLabel>
          {Object.entries(stateCounts).map(([state, count]) => {
            const label = DB_STATE_LABEL[state] ?? state;
            const isBottleneck = count >= 3;
            const isReview = state.includes("review");
            return (
              <div key={state} style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.55rem" }}>
                <div style={{ width: 230, fontSize: "0.77rem", color: "var(--text-muted)" }}>{label}</div>
                <div style={{ flex: 1, height: 9, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                  <div style={{ width: `${(count / max) * 100}%`, height: "100%", background: isBottleneck ? "var(--danger)" : isReview ? "var(--accent)" : "var(--brand)", borderRadius: 999 }} />
                </div>
                <span style={{ fontWeight: 700, fontSize: "0.82rem", width: 20 }}>{count}</span>
                {isBottleneck && <Badge tone="danger">Bottleneck</Badge>}
              </div>
            );
          })}
          {Object.keys(stateCounts).length === 0 && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No students in queue yet.</p>}
        </Card>
        <div>
          <SectionLabel icon={AlertCircle} muted>Students needing help</SectionLabel>
          {helpItems.length === 0 && <Card style={{ padding: "1.25rem", textAlign: "center", color: "var(--text-muted)", marginTop: "0.6rem" }}>No help requests.</Card>}
          {helpItems.map((h) => (
            <Card key={h.id} style={{ padding: "0.85rem", border: `1px solid ${escTone(h.waitMin) === "danger" ? "var(--danger)" : "var(--warning)"}`, marginTop: "0.6rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}><span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{h.student}</span><Badge tone={escTone(h.waitMin)}>{h.waitMin} min</Badge></div>
              <div style={{ fontSize: "0.77rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>{h.caseTitle}</div>
              <div style={{ fontSize: "0.8rem" }}>{h.reason}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Analytics View ──────────────────────────────────────────────────

function AnalyticsView() {
  const width = 520, height = 180, padL = 48, padB = 36, padT = 12, padR = 16;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const colors: Record<string, string> = { "Variables": "var(--brand)", "Loops": "var(--accent)", "Conditionals": "var(--success)" };
  const MASTERY_HISTORY = [{ concept: "Variables", history: [45, 58, 72] }, { concept: "Loops", history: [20, 38, 58] }, { concept: "Conditionals", history: [52, 68, 81] }];
  const COHORT_DIFFICULTY = [
    { caseTitle: "Loop Tracker — Daily Step Counter", avgAccuracy: 71, attempts: 14 },
    { caseTitle: "Greeting Bot — Welcome Message", avgAccuracy: 88, attempts: 18 },
    { caseTitle: "Pet Feeder Scheduler", avgAccuracy: 64, attempts: 9 },
  ];
  const nSessions = MASTERY_HISTORY[0].history.length;

  return (
    <div>
      <TopBar title="Analytics" subtitle="Cohort learning evidence and concept difficulty" />
      <Card style={{ padding: "1.25rem", marginBottom: "1.25rem" }}>
        <SectionLabel icon={TrendingUp}>Learning Evidence Graph</SectionLabel>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.35rem 0 0.5rem" }}>X-axis: Workshop Sessions · Y-axis: Average Prediction Accuracy (%) · One line per concept</p>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: width, height: "auto" }}>
          {[0, 25, 50, 75, 100].map(v => { const y = padT + innerH - (v / 100) * innerH; return <g key={v}><line x1={padL} x2={padL + innerW} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" /><text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{v}%</text></g>; })}
          {MASTERY_HISTORY.map(m => {
            const pts = m.history.map((val, i) => `${padL + (i / (nSessions - 1)) * innerW},${padT + innerH - (val / 100) * innerH}`).join(" ");
            return <g key={m.concept}><polyline points={pts} fill="none" stroke={colors[m.concept] || "var(--text-muted)"} strokeWidth="2.5" strokeLinecap="round" />{m.history.map((val, i) => <circle key={i} cx={padL + (i / (nSessions - 1)) * innerW} cy={padT + innerH - (val / 100) * innerH} r="3.5" fill={colors[m.concept] || "var(--text-muted)"}><title>{m.concept}: {val}%</title></circle>)}</g>;
          })}
        </svg>
        <div style={{ display: "flex", gap: "1rem", marginTop: "0.75rem" }}>
          {MASTERY_HISTORY.map(m => <div key={m.concept} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: colors[m.concept], display: "inline-block" }} />{m.concept}: {m.history[0]}% → {m.history[m.history.length - 1]}%</div>)}
        </div>
      </Card>
      <Card style={{ padding: "1.25rem" }}>
        <SectionLabel icon={Target}>Case difficulty — cohort average accuracy</SectionLabel>
        {COHORT_DIFFICULTY.map(c => (
          <div key={c.caseTitle} style={{ marginTop: "0.7rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}><span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{c.caseTitle}</span><span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{c.avgAccuracy}% avg · {c.attempts} attempts{c.avgAccuracy < 70 && <Badge tone="warning" style={{ marginLeft: "0.4rem" }}>Needs attention</Badge>}</span></div>
            <ThinBar value={c.avgAccuracy} max={100} color={c.avgAccuracy < 70 ? "var(--warning)" : "var(--brand)"} />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── Roster View ─────────────────────────────────────────────────────

function RosterView({ participants, progressMap }: {
  participants: { student_id: string; display_name?: string; role?: string }[];
  progressMap: Record<string, { state: string; case_id: string }>;
}) {
  const students = participants.filter(p => p.role === "student");
  return (
    <div>
      <TopBar title="Roster" subtitle={`${students.length} students checked in`} />
      {students.length === 0 ? (
        <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No students checked in yet.</Card>
      ) : (
        <Card style={{ padding: "0.5rem" }}>
          {students.map((r, i) => {
            const p = progressMap[r.student_id];
            const stageLabel = p ? (DB_STATE_LABEL[p.state] ?? p.state) : "Not started";
            return (
              <div key={r.student_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 0.85rem", borderBottom: i < students.length - 1 ? "1px solid var(--border)" : "none", gap: "0.5rem" }}>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{r.display_name ?? "Unknown"}</div><div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{stageLabel}</div></div>
                <Badge tone="brand">{stageLabel}</Badge>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ─── Instructor Shell ────────────────────────────────────────────────

export function InstructorShell({ role, theme, setTheme, onSignOut }: {
  role: UserRole; theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void; onSignOut?: () => void;
}) {
  const [view, setView] = useState("operations");
  const [editingCase, setEditingCase] = useState<DbCase | null>(null);
  const [sessionBuilderOpen, setSessionBuilderOpen] = useState(false);
  const [sessionMonitorOpen, setSessionMonitorOpen] = useState(false);
  const [monitoringSession, setMonitoringSession] = useState<DbSession | null>(null);

  // Live data
  const { data: cases, isLoading: casesLoading } = useCases();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: activeSession } = useActiveSession();
  const { data: participants } = useSessionParticipants(activeSession?.id ?? "");
  const { data: queueHealth } = useSessionQueueHealth(activeSession?.id ?? "");
  const { data: helpRequests } = useHelpRequests();

  // Roster progress data - fetch all student progress for roster view
  const studentIds = (participants ?? []).filter(p => p.role === "student").map(p => p.student_id);
  const progressMap: Record<string, { state: string; case_id: string }> = {};
  // For roster, we use a simplified approach since we can't easily batch query
  // The roster will show limited data if we can't get progress
  const loading = casesLoading || sessionsLoading;

  const navItems = [
    { key: "operations", label: "Operations", icon: Activity },
    { key: "cases", label: "Case Builder", icon: Layers },
    { key: "sessions", label: "Sessions", icon: Calendar },
    { key: "analytics", label: "Analytics", icon: BarChart3 },
    { key: "roster", label: "Roster", icon: Users },
  ];

  const bottomContent = (
    <Card style={{ padding: "0.85rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
        <ShieldCheck size={13} color="var(--brand)" />
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Instructor</span>
      </div>
      {activeSession && (
        <>
          <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{activeSession.session_code}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>Status: {activeSession.status}</div>
        </>
      )}
    </Card>
  );

  const handleSetView = (v: string) => { setView(v); setEditingCase(null); setSessionBuilderOpen(false); setSessionMonitorOpen(false); };

  const renderMain = () => {
    if (loading && (view === "cases" || view === "sessions")) {
      return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)", gap: "0.5rem" }}>
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading…
      </div>;
    }

    if (view === "cases") {
      if (editingCase) return <CaseBuilderForm existing={editingCase} onBack={() => setEditingCase(null)} />;
      return <CaseListView cases={cases ?? []} onNew={() => setEditingCase(null)} onEdit={c => setEditingCase(c)} />;
    }
    if (view === "sessions") {
      if (sessionBuilderOpen) return <SessionBuilderView cases={cases ?? []} onBack={() => setSessionBuilderOpen(false)} />;
      if (sessionMonitorOpen && monitoringSession) return <SessionMonitorView session={monitoringSession} participants={participants ?? []} queueHealth={queueHealth ?? []} helpRequests={helpRequests ?? []} onBack={() => setSessionMonitorOpen(false)} />;
      return <SessionListView sessions={sessions ?? []} onNew={() => setSessionBuilderOpen(true)} onMonitor={s => { setMonitoringSession(s); setSessionMonitorOpen(true); }} />;
    }
    if (view === "operations") return <SessionMonitorView session={activeSession} participants={participants ?? []} queueHealth={queueHealth ?? []} helpRequests={helpRequests ?? []} onBack={null} />;
    if (view === "analytics") return <AnalyticsView />;
    if (view === "roster") return <RosterView participants={participants ?? []} progressMap={progressMap} />;
    return null;
  };

  return (
    <>
      <Sidebar items={navItems} view={view} setView={handleSetView} role={role} theme={theme} setTheme={setTheme} bottomContent={bottomContent} onSignOut={onSignOut} />
      <main style={{ flex: 1, padding: "1.75rem 2.25rem", overflow: "auto" }}>
        {renderMain()}
      </main>
    </>
  );
}
