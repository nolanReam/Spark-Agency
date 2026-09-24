import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { Activity, Layers, Calendar, BarChart3, Users, ShieldCheck, StopCircle, AlertCircle, UserCheck, Inbox, HelpCircle, CheckCircle2, Plus, Copy, Archive, Pencil, PlayCircle, Layers3, FileText, Target, Wrench, ListChecks, TrendingUp, Lock, ArrowRight, Lightbulb, X, Loader2, Eye, CheckSquare, RotateCcw } from "lucide-react";
import { Badge, Card, Btn, SectionLabel, Input, Textarea, Field } from "../../components/ui";
import { TopBar, Sidebar } from "../../components/layout";
import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../hooks/useAuth";
import { CASE_CLEARANCE_LEVELS, CONCEPTS } from "../../lib/constants";
import {
  useCases, useCreateCase, useUpdateCase, useCaseBuilderAggregate, useSaveCaseBuilder,
  useSessions, useActiveSession, useSessionParticipants, useSessionQueueHealth,
  useHelpRequests, useCreateSession, useUpdateSessionStatus,
} from "../../api/hooks";
import type { CaseBuilderSavePayload, DbCase, DbCaseConceptWeight, DbCaseLane, DbSession, EnrichedHelpRequest } from "../../api/client";
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
  prediction_revision: "Revising Prediction",
  prediction_approved: "Pred Approved",
  testing_in_scratch: "Testing",
  reflection_pending: "Reflection",
  completed: "Complete",
};

// ─── Case List View ─────────────────────────────────────────────────

function CaseListView({ cases, onNew, onEdit, onPublish, onDuplicate, onArchive, onRestore, onView }: {
  cases: DbCase[]; onNew: () => void; onEdit: (c: DbCase) => void;
  onPublish: (c: DbCase) => void; onDuplicate: (c: DbCase) => void; onArchive: (c: DbCase) => void;
  onRestore: (c: DbCase) => void; onView: (c: DbCase) => void;
}) {
  const [tab, setTab] = useState("published");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtered = cases.filter(c => c.status === tab);
  const counts = { draft: cases.filter(c => c.status === "draft").length, published: cases.filter(c => c.status === "published").length, archived: cases.filter(c => c.status === "archived").length };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  // Derive allowed bulk actions from the selected cases' states
  const selectedCases = cases.filter(c => selected.has(c.id));
  const selectedStates = new Set(selectedCases.map(c => c.status));
  const allSameState = selectedStates.size === 1;
  const singleState = allSameState ? [...selectedStates][0] : null;

  const bulkDraft = allSameState && singleState === "draft";
  const bulkPublished = allSameState && singleState === "published";
  const bulkArchived = allSameState && singleState === "archived";

  const handleBulk = (action: (c: DbCase) => void) => {
    selectedCases.forEach(action);
    exitSelect();
  };

  return (
    <div>
      <TopBar title="Case Builder" subtitle="Manage your curriculum case files"
        right={<div style={{ display: "flex", gap: "0.5rem" }}>
          {selectMode ? (
            <Btn variant="ghost" size="sm" onClick={exitSelect}>Cancel</Btn>
          ) : (
            <Btn variant="ghost" size="sm" icon={CheckSquare} onClick={() => setSelectMode(true)}>Select</Btn>
          )}
          <Btn variant="primary" icon={Plus} onClick={onNew}>New case</Btn>
        </div>}
      />
      <div style={{ display: "flex", gap: "0.25rem", background: "var(--surface-2)", borderRadius: "10px", padding: "0.25rem", border: "1px solid var(--border)", width: "fit-content", marginBottom: "1.25rem" }}>
        {(["draft", "published", "archived"] as const).map(s => (
          <button key={s} onClick={() => setTab(s)} style={{ padding: "0.4rem 0.85rem", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, fontFamily: "'IBM Plex Sans',sans-serif", textTransform: "capitalize", background: tab === s ? "var(--surface)" : "transparent", color: tab === s ? "var(--brand)" : "var(--text-muted)", boxShadow: tab === s ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
            {s} <Badge tone={s === "published" ? "success" : s === "draft" ? "warning" : "neutral"}>{counts[s]}</Badge>
          </button>
        ))}
      </div>

      {tab === "archived" && (
        <p style={{ margin: "-0.5rem 0 1rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
          Archived cases are hidden from active use but kept for workshop history. Restore a case to edit or reuse it.
        </p>
      )}

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <Card style={{ padding: "0.75rem 1rem", marginBottom: "1rem", border: "1px solid var(--brand)", background: "var(--brand-soft)", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{selected.size} selected</span>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {bulkDraft && (
              <>
                <Btn variant="primary" size="sm" onClick={() => handleBulk(onPublish)}>Publish</Btn>
                <Btn variant="ghost" size="sm" icon={Copy} onClick={() => handleBulk(onDuplicate)}>Duplicate</Btn>
                <Btn variant="subtle" size="sm" icon={Archive} onClick={() => handleBulk(onArchive)}>Archive</Btn>
              </>
            )}
            {bulkPublished && (
              <Btn variant="subtle" size="sm" icon={Archive} onClick={() => handleBulk(onArchive)}>Archive</Btn>
            )}
            {bulkArchived && (
              <Btn variant="ghost" size="sm" icon={RotateCcw} onClick={() => handleBulk(onRestore)}>Restore</Btn>
            )}
          </div>
        </Card>
      )}

      {filtered.length === 0 && <Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No {tab} cases.</Card>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {filtered.map(c => (
          <Card key={c.id} style={{ padding: "1rem 1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
              {selectMode && <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ flexShrink: 0, width: 16, height: 16, accentColor: "var(--brand)" }} />}
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
              {!selectMode && (
                <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                  {c.status === "draft" && (
                    <>
                      <Btn variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(c)}>Edit</Btn>
                      <Btn variant="primary" size="sm" onClick={() => onPublish(c)}>Publish</Btn>
                      <Btn variant="ghost" size="sm" icon={Copy} onClick={() => onDuplicate(c)}>Duplicate</Btn>
                      <Btn variant="subtle" size="sm" icon={Archive} onClick={() => onArchive(c)}>Archive</Btn>
                    </>
                  )}
                  {c.status === "published" && (
                    <>
                      <Btn variant="ghost" size="sm" icon={Eye} onClick={() => onView(c)}>View</Btn>
                      <Btn variant="subtle" size="sm" icon={Archive} onClick={() => onArchive(c)}>Archive</Btn>
                    </>
                  )}
                  {c.status === "archived" && (
                    <>
                      <Btn variant="ghost" size="sm" icon={Eye} onClick={() => onView(c)}>View</Btn>
                      <Btn variant="ghost" size="sm" icon={RotateCcw} onClick={() => onRestore(c)}>Restore</Btn>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Case Builder Form ──────────────────────────────────────────────

type CaseLaneName = "Required" | "Extension" | "Challenge";

interface CaseFormData {
  id?: string; case_code: string; title: string; client_brief: string;
  min_clearance: number; reputation_reward: number; estimated_minutes: number;
  mission: string; tools_allowed: string;
  predict_prove_prompt: string; reflection_prompt: string; transfer_hint: string;
  concept_tags: string[];
  concept_weights: Record<string, number>;
  lanes: { name: CaseLaneName; detail: string; available: boolean }[];
  init_rules: string[];
}

type PublishField =
  | "case_code"
  | "title"
  | "client_brief"
  | "mission"
  | "required_lane"
  | "extension_lane"
  | "challenge_lane"
  | "predict_prove_prompt"
  | "reflection_prompt"
  | "estimated_minutes"
  | "reputation_reward"
  | "concept_weights";

type PublishValidationErrors = Partial<Record<PublishField, string>>;

const PUBLISH_FIELD_ELEMENT_IDS: Record<PublishField, string> = {
  case_code: "case-code",
  title: "case-title",
  client_brief: "client-brief",
  mission: "case-mission",
  required_lane: "lane-required",
  extension_lane: "lane-extension",
  challenge_lane: "lane-challenge",
  predict_prove_prompt: "predict-prove-prompt",
  reflection_prompt: "reflection-prompt",
  estimated_minutes: "estimated-minutes",
  reputation_reward: "reputation-reward",
  concept_weights: "concept-weight-0",
};

const FORM_FIELD_TO_PUBLISH_FIELD: Partial<Record<string, PublishField>> = {
  case_code: "case_code",
  title: "title",
  client_brief: "client_brief",
  mission: "mission",
  predict_prove_prompt: "predict_prove_prompt",
  reflection_prompt: "reflection_prompt",
  estimated_minutes: "estimated_minutes",
  reputation_reward: "reputation_reward",
};

function RequirementTag({ required }: { required: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", flexShrink: 0,
      padding: "0.15rem 0.4rem", borderRadius: 999,
      border: "1px solid var(--border)", background: "var(--surface-2)",
      color: "var(--text-muted)", fontSize: "0.68rem", fontWeight: 600,
      lineHeight: 1.2, textTransform: "none", letterSpacing: 0,
    }}>
      {required ? "Required to publish" : "Optional"}
    </span>
  );
}

function CaseBuilderFieldLabel({ children, required }: { children: ReactNode; required: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.35rem 0.5rem", width: "100%", flexWrap: "wrap" }}>
      <span>{children}</span>
      <RequirementTag required={required} />
    </span>
  );
}

function CaseBuilderSectionLabel({ children, required, icon }: { children: ReactNode; required: boolean; icon: ElementType }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
      <SectionLabel icon={icon}>{children}</SectionLabel>
      <RequirementTag required={required} />
    </div>
  );
}

function conceptWeightValidationError(weights: Record<string, number>): string | null {
  const values = CONCEPTS.map(concept => weights[concept]);
  if (values.some(value => !Number.isFinite(value) || value < 0 || value > 15)) {
    return "Each concept weight must be a number between 0 and 15.";
  }
  if (!values.some(value => value > 0)) {
    return "Set at least one concept weight above 0.";
  }
  return null;
}

function validateCaseForPublish(form: CaseFormData): PublishValidationErrors {
  const errors: PublishValidationErrors = {};
  const requireText = (field: PublishField, value: string, message: string) => {
    if (!value.trim()) errors[field] = message;
  };

  requireText("case_code", form.case_code, "Enter a case code.");
  requireText("title", form.title, "Enter a case title.");
  if (!Number.isFinite(form.reputation_reward) || form.reputation_reward < 0) {
    errors.reputation_reward = "Enter a finite reputation reward of 0 or more.";
  }
  if (!Number.isFinite(form.estimated_minutes) || form.estimated_minutes <= 0) {
    errors.estimated_minutes = "Enter estimated minutes greater than 0.";
  }
  requireText("client_brief", form.client_brief, "Enter a client brief.");
  requireText("mission", form.mission, "Enter a mission.");

  const requiredLane = form.lanes.find(lane => lane.name === "Required");
  const extensionLane = form.lanes.find(lane => lane.name === "Extension");
  const challengeLane = form.lanes.find(lane => lane.name === "Challenge");
  if (!requiredLane?.detail.trim()) errors.required_lane = "Describe the Required lane.";
  if (extensionLane?.available && !extensionLane.detail.trim()) errors.extension_lane = "Describe the enabled Extension lane.";
  if (challengeLane?.available && !challengeLane.detail.trim()) errors.challenge_lane = "Describe the enabled Challenge lane.";

  const weightError = conceptWeightValidationError(form.concept_weights);
  if (weightError) errors.concept_weights = weightError;
  requireText("predict_prove_prompt", form.predict_prove_prompt, "Enter a Predict & Prove prompt.");
  requireText("reflection_prompt", form.reflection_prompt, "Enter a reflection prompt.");

  return errors;
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

function dbToForm(c: DbCase, savedLanes: DbCaseLane[] = [], savedWeights: DbCaseConceptWeight[] = []): CaseFormData {
  const lanesByName = new Map(savedLanes.map(lane => [lane.lane, lane]));
  const lanes = (["Required", "Extension", "Challenge"] as const).map(name => {
    const saved = lanesByName.get(name);
    return {
      name,
      detail: saved?.description ?? "",
      available: saved?.available ?? name === "Required",
    };
  });
  const weightsByConcept = new Map(savedWeights.map(weight => [weight.concept, weight.points]));
  const initRules = (c.constraints ?? "")
    .split(/\r?\n/)
    .map(rule => rule.trim())
    .filter(Boolean);

  return {
    id: c.id, case_code: c.case_code ?? "", title: c.title,
    client_brief: c.client_brief, min_clearance: c.min_clearance,
    reputation_reward: c.reputation_reward, estimated_minutes: c.estimated_minutes ?? 20,
    mission: c.mission, tools_allowed: (c.tools_allowed ?? []).join(", "),
    predict_prove_prompt: c.predict_prove_prompt ?? "",
    reflection_prompt: c.reflection_prompt ?? "",
    transfer_hint: c.transfer_hint ?? "",
    concept_tags: c.concept_tags ?? [],
    concept_weights: Object.fromEntries(CONCEPTS.map(concept => [concept, weightsByConcept.get(concept) ?? 0])),
    lanes,
    init_rules: initRules.length > 0 ? initRules : [""],
  };
}

function formToDbPartial(f: CaseFormData): Partial<DbCase> {
  return {
    ...(f.id ? { id: f.id } : {}),
    case_code: f.case_code || null, title: f.title,
    client_brief: f.client_brief, min_clearance: f.min_clearance,
    reputation_reward: f.reputation_reward, estimated_minutes: f.estimated_minutes,
    mission: f.mission, difficulty_lane: "core",
    tools_allowed: f.tools_allowed ? f.tools_allowed.split(",").map(s => s.trim()).filter(Boolean) : [],
    predict_prove_prompt: f.predict_prove_prompt || null,
    reflection_prompt: f.reflection_prompt || null,
    transfer_hint: f.transfer_hint || null,
    concept_tags: f.concept_tags,
    constraints: f.init_rules.map(r => r.trim()).filter(Boolean).join("\n") || null,
    status: "draft",
  };
}

function formToCaseBuilderPayload(f: CaseFormData, status: "draft" | "published"): CaseBuilderSavePayload {
  return {
    caseId: f.id,
    caseData: { ...formToDbPartial(f), status },
    lanes: f.lanes.map(lane => ({
      lane: lane.name,
      description: lane.detail,
      available: lane.name === "Required" ? true : lane.available,
    })),
    conceptWeights: CONCEPTS.map(concept => ({
      concept,
      points: f.concept_weights[concept] ?? 0,
    })),
  };
}

function CaseBuilderForm({ existing, onBack }: { existing: DbCase | null; onBack: () => void }) {
  const isNew = !existing;
  const { user } = useAuth();
  const instructorId = user?.id ?? "";
  const aggregateQuery = useCaseBuilderAggregate(existing?.id ?? "", instructorId);
  const saveCaseBuilder = useSaveCaseBuilder(instructorId);
  const [form, setForm] = useState<CaseFormData>(emptyCaseForm);
  const [hydrated, setHydrated] = useState(isNew);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishErrors, setPublishErrors] = useState<PublishValidationErrors>({});
  const saveInFlight = useRef(false);
  const hydratedCaseId = useRef<string | null>(null);

  useEffect(() => {
    if (isNew) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the editor when switching from an existing case to a new case.
      setForm(emptyCaseForm());
      setPublishErrors({});
      setHydrated(true);
      return;
    }
    if (aggregateQuery.data && hydratedCaseId.current !== aggregateQuery.data.case.id) {
      setForm(dbToForm(aggregateQuery.data.case, aggregateQuery.data.lanes, aggregateQuery.data.conceptWeights));
      setPublishErrors({});
      hydratedCaseId.current = aggregateQuery.data.case.id;
      setHydrated(true);
    }
  }, [aggregateQuery.data, isNew]);

  const clearPublishError = (field: PublishField) => {
    setPublishErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const set = (k: string, v: unknown) => {
    setForm((f: CaseFormData) => ({ ...f, [k]: v }));
    const publishField = FORM_FIELD_TO_PUBLISH_FIELD[k];
    if (!publishField) return;
    const valid = publishField === "estimated_minutes"
      ? Number.isFinite(v) && Number(v) > 0
      : publishField === "reputation_reward"
        ? Number.isFinite(v) && Number(v) >= 0
        : String(v ?? "").trim().length > 0;
    if (valid) clearPublishError(publishField);
  };

  const setWeight = (concept: string, v: string) => {
    const nextWeights = { ...form.concept_weights, [concept]: parseInt(v) || 0 };
    setForm((f: CaseFormData) => ({ ...f, concept_weights: nextWeights }));
    if (!conceptWeightValidationError(nextWeights)) clearPublishError("concept_weights");
  };

  const setLane = (i: number, key: "detail" | "available", val: string | boolean) => {
    const lane = form.lanes[i];
    const lanes = form.lanes.map((current, index) => index === i ? { ...current, [key]: val } : current);
    setForm(current => ({ ...current, lanes }));
    const publishField = lane.name === "Required"
      ? "required_lane"
      : lane.name === "Extension"
        ? "extension_lane"
        : "challenge_lane";
    if ((key === "detail" && String(val).trim()) || (key === "available" && val === false)) {
      clearPublishError(publishField);
    }
  };

  const addInitRule = () => set("init_rules", [...form.init_rules, ""]);
  const setInitRule = (i: number, v: string) => { const r = [...form.init_rules]; r[i] = v; set("init_rules", r); };
  const removeInitRule = (i: number) => set("init_rules", form.init_rules.filter((_, idx) => idx !== i));

  const focusPublishField = (field: PublishField) => {
    requestAnimationFrame(() => {
      const element = document.getElementById(PUBLISH_FIELD_ELEMENT_IDS[field]);
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus({ preventScroll: true });
    });
  };

  const handleSave = (status: "draft" | "published") => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaveError(null);
    saveCaseBuilder.mutate(formToCaseBuilderPayload(form, status), {
      onSuccess: () => onBack(),
      onError: (error: Error) => setSaveError(`Case save failed: ${error.message}`),
      onSettled: () => { saveInFlight.current = false; },
    });
  };

  const handleSaveDraft = () => {
    setPublishErrors({});
    handleSave("draft");
  };

  const handlePublish = () => {
    const errors = validateCaseForPublish(form);
    setPublishErrors(errors);
    setSaveError(null);
    const firstInvalidField = Object.keys(errors)[0] as PublishField | undefined;
    if (firstInvalidField) {
      focusPublishField(firstInvalidField);
      return;
    }
    handleSave("published");
  };

  if (!isNew && aggregateQuery.isError) {
    return <div><TopBar title="Edit Case" subtitle="Unable to load case data" onBack={onBack} /><Card style={{ padding: "1rem", border: "1px solid var(--danger)", color: "var(--danger)" }}>Case load failed: {aggregateQuery.error.message}</Card></div>;
  }

  if (!isNew && (!hydrated || aggregateQuery.isLoading)) {
    return <div><TopBar title="Edit Case" subtitle="Loading case data…" onBack={onBack} /><Card style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading case fields…</Card></div>;
  }

  return (
    <div>
      <TopBar title={isNew ? "New Case" : "Edit Case"} subtitle={isNew ? "Create a new case file" : `${existing?.case_code ?? ""} — ${existing?.title ?? ""}`} onBack={onBack} />
      <p style={{ margin: "-0.75rem 0 1rem", color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.5 }}>
        Drafts can be saved incomplete. Fields marked Required to publish must be completed before publishing.
      </p>
      {Object.keys(publishErrors).length > 0 && (
        <Card role="alert" style={{ padding: "0.75rem 1rem", marginBottom: "1rem", border: "1px solid var(--danger)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: "0.85rem" }}>
          Complete the fields marked Required to publish.
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
        <div>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={FileText}>Case metadata</SectionLabel>
            <div style={{ marginTop: "0.85rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Field
                  label={<CaseBuilderFieldLabel required>Case Code</CaseBuilderFieldLabel>}
                  htmlFor="case-code"
                  error={publishErrors.case_code}
                  errorId="case-code-error"
                >
                  <Input
                    id="case-code"
                    placeholder="L1-06"
                    value={form.case_code}
                    aria-required="true"
                    aria-invalid={!!publishErrors.case_code}
                    aria-describedby={publishErrors.case_code ? "case-code-error" : undefined}
                    onChange={e => set("case_code", e.target.value)}
                  />
                </Field>
                <Field
                  label={<CaseBuilderFieldLabel required>Case Title</CaseBuilderFieldLabel>}
                  htmlFor="case-title"
                  error={publishErrors.title}
                  errorId="case-title-error"
                >
                  <Input
                    id="case-title"
                    placeholder="Descriptive project title"
                    value={form.title}
                    aria-required="true"
                    aria-invalid={!!publishErrors.title}
                    aria-describedby={publishErrors.title ? "case-title-error" : undefined}
                    onChange={e => set("title", e.target.value)}
                  />
                </Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <Field label={<CaseBuilderFieldLabel required>Min Clearance</CaseBuilderFieldLabel>} htmlFor="minimum-clearance">
                  <select id="minimum-clearance" aria-required="true" value={form.min_clearance} onChange={e => set("min_clearance", Number(e.target.value))} style={{ width: "100%", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.875rem", fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    {CASE_CLEARANCE_LEVELS.map(l => <option key={l.level} value={l.level}>CL-{l.level} — {l.title}</option>)}
                  </select>
                </Field>
                <Field
                  label={<CaseBuilderFieldLabel required>Reputation Reward</CaseBuilderFieldLabel>}
                  htmlFor="reputation-reward"
                  error={publishErrors.reputation_reward}
                  errorId="reputation-reward-error"
                >
                  <Input
                    id="reputation-reward"
                    type="number"
                    min={0}
                    value={form.reputation_reward}
                    aria-required="true"
                    aria-invalid={!!publishErrors.reputation_reward}
                    aria-describedby={publishErrors.reputation_reward ? "reputation-reward-error" : undefined}
                    onChange={e => set("reputation_reward", Number(e.target.value))}
                  />
                </Field>
                <Field
                  label={<CaseBuilderFieldLabel required>Estimated Minutes</CaseBuilderFieldLabel>}
                  htmlFor="estimated-minutes"
                  error={publishErrors.estimated_minutes}
                  errorId="estimated-minutes-error"
                >
                  <Input
                    id="estimated-minutes"
                    type="number"
                    min={1}
                    value={form.estimated_minutes}
                    aria-required="true"
                    aria-invalid={!!publishErrors.estimated_minutes}
                    aria-describedby={publishErrors.estimated_minutes ? "estimated-minutes-error" : undefined}
                    onChange={e => set("estimated_minutes", Number(e.target.value))}
                  />
                </Field>
              </div>
            </div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={FileText}>Client Brief & Mission</SectionLabel>
            <div style={{ marginTop: "0.75rem" }}>
              <Field
                label={<CaseBuilderFieldLabel required>Client Brief</CaseBuilderFieldLabel>}
                htmlFor="client-brief"
                error={publishErrors.client_brief}
                errorId="client-brief-error"
              >
                <Textarea
                  id="client-brief"
                  rows={3}
                  value={form.client_brief}
                  placeholder="Describe the client scenario..."
                  aria-required="true"
                  aria-invalid={!!publishErrors.client_brief}
                  aria-describedby={publishErrors.client_brief ? "client-brief-error" : undefined}
                  onChange={e => set("client_brief", e.target.value)}
                />
              </Field>
              <Field
                label={<CaseBuilderFieldLabel required>Mission</CaseBuilderFieldLabel>}
                htmlFor="case-mission"
                error={publishErrors.mission}
                errorId="case-mission-error"
              >
                <Textarea
                  id="case-mission"
                  rows={2}
                  value={form.mission}
                  placeholder="What the student needs to build..."
                  aria-required="true"
                  aria-invalid={!!publishErrors.mission}
                  aria-describedby={publishErrors.mission ? "case-mission-error" : undefined}
                  onChange={e => set("mission", e.target.value)}
                />
              </Field>
            </div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <SectionLabel icon={Target}>Difficulty lanes</SectionLabel>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.4rem 0 0.75rem" }}>Required is always on. Extension and Challenge are optional add-ons.</p>
            {form.lanes.map((lane, i) => {
              const requiredToPublish = lane.name === "Required" || lane.available;
              const publishField: PublishField = lane.name === "Required"
                ? "required_lane"
                : lane.name === "Extension"
                  ? "extension_lane"
                  : "challenge_lane";
              const fieldId = PUBLISH_FIELD_ELEMENT_IDS[publishField];
              const fieldError = publishErrors[publishField];
              return (
                <div key={lane.name} style={{ padding: "0.85rem", borderRadius: "10px", background: "var(--surface-2)", marginBottom: "0.5rem", opacity: !lane.available && lane.name !== "Required" ? 0.6 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                      <Badge tone={lane.name === "Required" ? "brand" : lane.name === "Extension" ? "accent" : "danger"}>{lane.name}</Badge>
                      <RequirementTag required={requiredToPublish} />
                    </div>
                    {lane.name !== "Required" && (
                      <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={lane.available} onChange={e => setLane(i, "available", e.target.checked)} />
                        Available
                      </label>
                    )}
                  </div>
                  <Textarea
                    id={fieldId}
                    rows={2}
                    value={lane.detail}
                    disabled={!requiredToPublish}
                    placeholder={`Describe the ${lane.name} lane requirements...`}
                    aria-label={`${lane.name} lane description`}
                    aria-required={requiredToPublish}
                    aria-invalid={!!fieldError}
                    aria-describedby={fieldError ? `${fieldId}-error` : undefined}
                    onChange={e => setLane(i, "detail", e.target.value)}
                  />
                  {fieldError && <p id={`${fieldId}-error`} style={{ fontSize: "0.75rem", color: "var(--danger)", margin: "0.35rem 0 0", lineHeight: 1.4 }}>{fieldError}</p>}
                </div>
              );
            })}
          </Card>
          <Card style={{ padding: "1.25rem" }}>
            <CaseBuilderSectionLabel icon={Wrench} required={false}>Tools allowed</CaseBuilderSectionLabel>
            <div style={{ marginTop: "0.75rem" }}>
              <Input aria-label="Tools allowed (Optional)" placeholder="repeat, variables, operators (+, <), say block" value={form.tools_allowed} onChange={e => set("tools_allowed", e.target.value)} />
            </div>
          </Card>
        </div>
        <div>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <CaseBuilderSectionLabel icon={ListChecks} required={false}>Initialization rules</CaseBuilderSectionLabel>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.4rem 0 0.75rem" }}>Exact starting conditions the volunteer checks during Implementation Review.</p>
            {form.init_rules.map((rule, i) => (
              <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.4rem" }}>
                <Input aria-label={`Initialization rule ${i + 1} (Optional)`} value={rule} placeholder={`Rule ${i + 1}...`} onChange={e => setInitRule(i, e.target.value)} style={{ flex: 1 }} />
                {form.init_rules.length > 1 && (
                  <button type="button" className="btn-core" aria-label={`Remove initialization rule ${i + 1}`} title="Remove rule" onClick={() => removeInitRule(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0.3rem" }}>
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            <Btn variant="ghost" size="sm" icon={Plus} onClick={addInitRule}>Add rule</Btn>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <CaseBuilderSectionLabel icon={TrendingUp} required>Concept weights</CaseBuilderSectionLabel>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.4rem 0 0.75rem" }}>Use values from 0 to 15. At least one concept must be above 0 to publish.</p>
            <div
              role="group"
              aria-label="Concept weights"
              aria-describedby={publishErrors.concept_weights ? "concept-weights-error" : undefined}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem 0.75rem" }}
            >
              {CONCEPTS.map((concept, index) => (
                <div key={concept} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                  <label htmlFor={`concept-weight-${index}`} style={{ fontSize: "0.82rem" }}>{concept}</label>
                  <input
                    id={`concept-weight-${index}`}
                    type="number"
                    min={0}
                    max={15}
                    value={form.concept_weights[concept]}
                    aria-invalid={!!publishErrors.concept_weights}
                    onChange={e => setWeight(concept, e.target.value)}
                    style={{ width: 52, padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.82rem", fontFamily: "'IBM Plex Sans',sans-serif", textAlign: "right" }}
                  />
                </div>
              ))}
            </div>
            {publishErrors.concept_weights && <p id="concept-weights-error" style={{ fontSize: "0.75rem", color: "var(--danger)", margin: "0.5rem 0 0", lineHeight: 1.4 }}>{publishErrors.concept_weights}</p>}
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <CaseBuilderSectionLabel icon={Lock} required>Predict & Prove prompt</CaseBuilderSectionLabel>
            <div style={{ marginTop: "0.75rem" }}>
              <Textarea
                id="predict-prove-prompt"
                rows={3}
                value={form.predict_prove_prompt}
                placeholder="What will your project output / do?"
                aria-label="Predict & Prove prompt"
                aria-required="true"
                aria-invalid={!!publishErrors.predict_prove_prompt}
                aria-describedby={publishErrors.predict_prove_prompt ? "predict-prove-prompt-error" : undefined}
                onChange={e => set("predict_prove_prompt", e.target.value)}
              />
              {publishErrors.predict_prove_prompt && <p id="predict-prove-prompt-error" style={{ fontSize: "0.75rem", color: "var(--danger)", margin: "0.35rem 0 0", lineHeight: 1.4 }}>{publishErrors.predict_prove_prompt}</p>}
            </div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1rem" }}>
            <CaseBuilderSectionLabel icon={Lightbulb} required>Reflection prompt</CaseBuilderSectionLabel>
            <div style={{ marginTop: "0.75rem" }}>
              <Textarea
                id="reflection-prompt"
                rows={2}
                value={form.reflection_prompt}
                placeholder="What actually happened?"
                aria-label="Reflection prompt"
                aria-required="true"
                aria-invalid={!!publishErrors.reflection_prompt}
                aria-describedby={publishErrors.reflection_prompt ? "reflection-prompt-error" : undefined}
                onChange={e => set("reflection_prompt", e.target.value)}
              />
              {publishErrors.reflection_prompt && <p id="reflection-prompt-error" style={{ fontSize: "0.75rem", color: "var(--danger)", margin: "0.35rem 0 0", lineHeight: 1.4 }}>{publishErrors.reflection_prompt}</p>}
            </div>
          </Card>
          <Card style={{ padding: "1.25rem", marginBottom: "1.25rem" }}>
            <CaseBuilderSectionLabel icon={ArrowRight} required={false}>Transfer hint</CaseBuilderSectionLabel>
            <div style={{ marginTop: "0.75rem" }}>
              <Textarea aria-label="Transfer hint (Optional)" rows={2} value={form.transfer_hint} placeholder="This pattern appears in real software when..." onChange={e => set("transfer_hint", e.target.value)} />
            </div>
          </Card>
          {saveError && <Card style={{ padding: "0.75rem 1rem", marginBottom: "0.75rem", border: "1px solid var(--danger)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: "0.85rem" }}>{saveError}</Card>}
          <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
            <Btn variant="subtle" onClick={handleSaveDraft} disabled={saveCaseBuilder.isPending}>Save as draft</Btn>
            <Btn variant="primary" onClick={handlePublish} disabled={saveCaseBuilder.isPending}>Publish case</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Session List View ──────────────────────────────────────────────

function SessionListView({ sessions, onNew, onMonitor, onSummary }: {
  sessions: DbSession[]; onNew: () => void; onMonitor: (s: DbSession) => void; onSummary: (s: DbSession) => void;
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
              {s.status === "closed" && <Btn variant="ghost" size="sm" onClick={() => onSummary(s)}>View Summary</Btn>}
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
  const instructorId = user?.id ?? "";
  const createSession = useCreateSession(instructorId);
  const publishedCases = cases.filter(
    c => c.status === "published" && c.created_by === instructorId,
  );
  const toggleCase = (id: string) => { if (selectedCases.includes(id)) setSelectedCases(selectedCases.filter(c => c !== id)); else setSelectedCases([...selectedCases, id]); };

  const handleGenerateCode = () => {
    setError(null);
    const code = generateSessionCode();
    setSessionCode(code);
    // No API call — session is not persisted until explicitly opened
  };

  const handleOpenSession = () => {
    if (!sessionCode || selectedCases.length === 0) return;
    setError(null);
    createSession.mutate(
      { sessionCode, caseIds: selectedCases, status: "open" },
      {
        onSuccess: () => onBack(),
        onError: (err) => {
          setError(err instanceof Error ? err.message : "Failed to create session");
        },
      }
    );
  };

  const isOpening = createSession.isPending;

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
                style={{ marginTop: sessionCode ? "0.25rem" : "0.5rem", width: "100%" }}
              >
                {sessionCode ? "Regenerate session code" : "Generate session code"}
              </Btn>
            </div>
          </Card>
          <Card style={{ padding: "1.25rem" }}>
            <SectionLabel icon={FileText}>Session lifecycle</SectionLabel>
            {[{ state: "open", label: "Open", body: "Code is live. Students can join." }, { state: "active", label: "Active", body: "Workshop is live — queues open." }, { state: "closing", label: "Closing", body: "New requests blocked." }, { state: "closed", label: "Closed", body: "Session ended." }].map((s, i) => (
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
              disabled={!sessionCode || selectedCases.length === 0 || isOpening}
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

function SessionMonitorView({ session, participants, participantsUnavailable, queueHealth, helpRequests, onBack, onCreateSession }: {
  session: DbSession | null; participants: { student_id: string; display_name?: string; role?: string }[];
  queueHealth: { state: string }[]; helpRequests: EnrichedHelpRequest[]; onBack: (() => void) | null;
  onCreateSession?: () => void;
  participantsUnavailable: boolean;
}) {
  const { user } = useAuth();
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(session?.status === "closed");
  const [isClosing, setIsClosing] = useState(false);
  const updateStatus = useUpdateSessionStatus(user?.id ?? "");

  const studentsPresent = participants.filter(p => p.role === "student").length;
  const volunteersActive = participants.filter(p => p.role === "volunteer").length;

  // Aggregate queue health by state
  const stateCounts: Record<string, number> = {};
  queueHealth.forEach(q => { stateCounts[q.state] = (stateCounts[q.state] || 0) + 1; });

  const pendingReviews = (stateCounts["awaiting_implementation_review"] || 0) + (stateCounts["awaiting_prediction_review"] || 0);
  const pendingHelp = helpRequests.length;
  const max = Math.max(...Object.values(stateCounts), 1);

  const helpItems = helpRequests.map(h => ({ id: h.id, student: h.student_name, caseTitle: h.case_title, waitMin: h.wait_minutes, reason: h.reason }));

  if (!session) return (
    <div>
      <TopBar title="Operations" subtitle="No active session" />
      <Card style={{ padding: "2rem", textAlign: "center" }}>
        <Calendar size={28} color="var(--brand)" style={{ marginBottom: "0.75rem" }} />
        <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>No active session</div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0 0 1rem" }}>
          Create a session when you are ready to invite students and begin monitoring.
        </p>
        {onCreateSession && <Btn variant="primary" icon={Plus} onClick={onCreateSession}>Create Session</Btn>}
      </Card>
    </div>
  );

  if (closed) return (
    <div>
      <TopBar title="Session Closed" subtitle="Summary generated" onBack={onBack ?? undefined} />
      <Card style={{ padding: "1.25rem", border: "1px solid var(--success)", background: "var(--success-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}><CheckCircle2 size={18} color="var(--success)" /><span style={{ fontWeight: 700 }}>Session closed successfully</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: "0.75rem" }}>
          {[["Students present", participantsUnavailable ? "—" : studentsPresent], ["Reviews pending", queueHealth.length], ["Help requests", pendingHelp]].map(([label, val]) => (
            <div key={label as string}><div style={{ fontSize: "0.72rem", color: "var(--success)", textTransform: "uppercase", marginBottom: "0.2rem" }}>{label as string}</div><div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: "1.15rem" }}>{String(val)}</div></div>
          ))}
        </div>
      </Card>
    </div>
  );

  const sessionTitle = session?.session_code ?? "No active session";

  return (
    <div>
      <TopBar title={closed ? "Session Summary" : "Session Monitor"} subtitle={sessionTitle}
        right={closed ? <Badge tone="neutral">Closed</Badge> : (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Badge tone="success">Session live</Badge>
          {isClosing ? (
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", color: "var(--text-muted)", fontSize: "0.78rem" }}>
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Closing…
            </div>
          ) : !closing ? (
            <Btn variant="subtle" icon={StopCircle} size="sm" onClick={() => setClosing(true)}>Close session</Btn>
          ) : (
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--danger)" }}>Confirm close?</span>
              <Btn variant="danger" size="sm" disabled={!session} onClick={() => {
                if (!session) return;
                setIsClosing(true);
                updateStatus.mutate({ sessionId: session.id, status: "closed" }, {
                  onSuccess: () => { setClosed(true); setIsClosing(false); },
                  onError: () => setIsClosing(false),
                });
              }}>Yes, close</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setClosing(false)}>Cancel</Btn>
            </div>
          )}
        </div>)}
        onBack={onBack ?? (() => {})}
      />
      {participantsUnavailable && (
        <Card role="alert" style={{ padding: "0.85rem", border: "1px solid var(--warning)", background: "var(--warning-soft)", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
            <AlertCircle size={15} color="var(--warning)" />Participant counts are unavailable because one or more profiles could not be loaded.
          </div>
        </Card>
      )}
      {closing && !closed && (
        <Card style={{ padding: "0.85rem", border: "1px solid var(--warning)", background: "var(--warning-soft)", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}><AlertCircle size={15} color="var(--warning)" />Closing is a two-step process. New review requests will be blocked.</div>
        </Card>
      )}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {[{ icon: Users, label: "Students", val: participantsUnavailable ? "—" : studentsPresent }, { icon: UserCheck, label: "Volunteers", val: participantsUnavailable ? "—" : volunteersActive }, { icon: Inbox, label: "Pending reviews", val: pendingReviews, tone: "var(--accent)" }, { icon: HelpCircle, label: "Help requests", val: pendingHelp, tone: "var(--danger)" }].map(k => (
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
  return (
    <div>
      <TopBar title="Analytics" subtitle="Workshop reporting" />
      <Card style={{ padding: "1.25rem" }}>
        <SectionLabel icon={BarChart3}>Analytics unavailable for workshop beta</SectionLabel>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "0.5rem 0 0" }}>
          Live cohort analytics are not enabled yet. No sample or fabricated workshop metrics are shown here.
        </p>
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
  const [caseBuilderOpen, setCaseBuilderOpen] = useState(false);
  const [sessionBuilderOpen, setSessionBuilderOpen] = useState(false);
  const [sessionMonitorOpen, setSessionMonitorOpen] = useState(false);
  const [monitoringSession, setMonitoringSession] = useState<DbSession | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { user } = useAuth();
  const instructorId = user?.id ?? "";

  // Live data
  const { data: cases, isLoading: casesLoading } = useCases(instructorId);
  const { data: sessions, isLoading: sessionsLoading } = useSessions(instructorId);
  const createCase = useCreateCase(instructorId);
  const updateCase = useUpdateCase(instructorId);
  const { data: activeSession } = useActiveSession(instructorId);
  const displayedSession = sessionMonitorOpen && monitoringSession ? monitoringSession : activeSession;
  const displayedSessionId = displayedSession?.id ?? "";
  const { data: participants, isError: participantsUnavailable } = useSessionParticipants(displayedSessionId, instructorId);
  const { data: queueHealth } = useSessionQueueHealth(displayedSessionId, instructorId);
  const { data: helpRequests } = useHelpRequests(displayedSessionId, instructorId);

  // Roster progress data - fetch all student progress for roster view
  // studentIds unused and removed to resolve compilation error
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

  const handleSetView = (v: string) => { setView(v); setEditingCase(null); setCaseBuilderOpen(false); setSessionBuilderOpen(false); setSessionMonitorOpen(false); };

  const renderMain = () => {
    if (loading && (view === "cases" || view === "sessions")) {
      return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--text-muted)", gap: "0.5rem" }}>
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Loading…
      </div>;
    }

    if (view === "cases") {
      if (caseBuilderOpen) return <CaseBuilderForm existing={null} onBack={() => setCaseBuilderOpen(false)} />;
      if (editingCase) return <CaseBuilderForm existing={editingCase} onBack={() => setEditingCase(null)} />;
      return (
        <>
          {errorMsg && (
            <Card style={{ padding: "0.75rem 1rem", marginBottom: "1rem", border: "1px solid var(--danger)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{errorMsg}</span>
              <Btn variant="ghost" size="sm" onClick={() => setErrorMsg(null)}>Dismiss</Btn>
            </Card>
          )}
          <CaseListView
            cases={cases ?? []}
            onNew={() => setCaseBuilderOpen(true)}
            onEdit={c => setEditingCase(c)}
            onView={c => setEditingCase(c)}
          onPublish={c => updateCase.mutate({ id: c.id, updates: { status: "published" } }, {
            onError: (err: Error) => setErrorMsg(`Publish failed: ${err.message}`),
          })}
          onDuplicate={c => {
            const form = dbToForm(c);
            delete form.id;
            const suffix = ` (copy ${Date.now().toString(36)})`;
            form.case_code = `${form.case_code}${suffix}`;
            form.title = `${form.title} (copy)`;
            const newCase = formToDbPartial(form);
            createCase.mutate(newCase, {
              onSuccess: () => setErrorMsg(null),
              onError: (err: Error) => setErrorMsg(`Duplicate failed: ${err.message}`),
            });
          }}
          onArchive={c => updateCase.mutate({ id: c.id, updates: { status: "archived" } }, {
            onError: (err: Error) => setErrorMsg(`Archive failed: ${err.message}`),
          })}
          onRestore={c => updateCase.mutate({ id: c.id, updates: { status: "draft" } }, {
            onError: (err: Error) => setErrorMsg(`Restore failed: ${err.message}`),
          })}
        />
        </>
      );
    }
    if (view === "sessions") {
      if (sessionBuilderOpen) return <SessionBuilderView cases={cases ?? []} onBack={() => setSessionBuilderOpen(false)} />;
      if (sessionMonitorOpen && monitoringSession) return <SessionMonitorView session={monitoringSession} participants={participants ?? []} participantsUnavailable={participantsUnavailable} queueHealth={queueHealth ?? []} helpRequests={helpRequests ?? []} onBack={() => setSessionMonitorOpen(false)} />;
      return (
        <SessionListView
          sessions={sessions ?? []}
          onNew={() => setSessionBuilderOpen(true)}
          onMonitor={s => { setMonitoringSession(s); setSessionMonitorOpen(true); }}
          onSummary={s => { setMonitoringSession(s); setSessionMonitorOpen(true); }}
        />
      );
    }
    if (view === "operations") return <SessionMonitorView session={activeSession ?? null} participants={participants ?? []} participantsUnavailable={participantsUnavailable} queueHealth={queueHealth ?? []} helpRequests={helpRequests ?? []} onBack={null} onCreateSession={() => { setView("sessions"); setSessionBuilderOpen(true); }} />;
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
