import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Loader2, Lock, RotateCcw } from "lucide-react";
import { TopBar } from "../../components/layout";
import { Badge, Btn, Card, Field, Input, Textarea } from "../../components/ui";
import {
  useCompleteOrientationSection,
  useJuniorQualificationDefinition,
  useSaveQualificationEvidence,
  useStartJuniorQualification,
  useStudentProfile,
  useStudentQualificationAttempt,
  useSubmitQualification,
} from "../../api/hooks";
import {
  isOrientationComplete,
  isQualificationEvidenceComplete,
  ORIENTATION_SECTIONS,
  QUALIFICATION_CHECKS,
  SCRATCH_PROJECT_URL_PATTERN,
} from "./content";

function StarterProject({ url, behavior }: { url?: string; behavior?: string[] }) {
  if (!url) return null;

  return (
    <div style={{ padding: "0.9rem", margin: "0.8rem 0 1rem", borderRadius: 8, background: "var(--brand-soft)", border: "1px solid var(--brand)" }}>
      <a href={url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>
        Open the Spark Code starter project <ExternalLink size={12} />
      </a>
      <p style={{ margin: "0.55rem 0 0", fontSize: "0.82rem" }}>Remix it into your own Scratch account before you start.</p>
      {(behavior?.length ?? 0) > 0 && (
        <>
          <div style={{ marginTop: "0.65rem", fontSize: "0.8rem", fontWeight: 700 }}>Already in the starter:</div>
          <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.2rem", fontSize: "0.8rem", lineHeight: 1.5 }}>
            {behavior?.map(item => <li key={item}><code>{item}</code></li>)}
          </ul>
        </>
      )}
    </div>
  );
}

export function StudentTraining({ userId, sessionId }: { userId: string; sessionId: string }) {
  const profileQuery = useStudentProfile(userId);
  const definitionQuery = useJuniorQualificationDefinition();
  const attemptQuery = useStudentQualificationAttempt(userId);
  const completeSection = useCompleteOrientationSection(userId);
  const startQualification = useStartJuniorQualification(userId);
  const saveEvidence = useSaveQualificationEvidence(userId);
  const submitQualification = useSubmitQualification(userId);
  const [draft, setDraft] = useState<{
    ownerKey: string;
    projectUrl: string;
    changeSummary: string;
    testingSummary: string;
    checkResults: Record<string, boolean>;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refreshedPassFor = useRef<string | null>(null);

  const profile = profileQuery.data;
  const definition = definitionQuery.data;
  const attempt = attemptQuery.data;
  const completedSections = profile?.orientation_sections_completed ?? [];
  const orientationComplete = isOrientationComplete(completedSections)
    && profile?.orientation_completed_at != null;
  const editable = !attempt || attempt.status === "in_progress" || attempt.status === "needs_retry";

  const refetchProfile = profileQuery.refetch;
  useEffect(() => {
    if (attempt?.status === "passed" && refreshedPassFor.current !== userId) {
      refreshedPassFor.current = userId;
      void refetchProfile();
    }
  }, [attempt?.status, refetchProfile, userId]);

  const ownerKey = `${userId}:${attempt?.id ?? "new"}`;
  const evidence = draft?.ownerKey === ownerKey ? draft : {
    ownerKey,
    projectUrl: attempt?.project_url ?? "",
    changeSummary: attempt?.change_summary ?? "",
    testingSummary: attempt?.testing_summary ?? "",
    checkResults: attempt?.check_results ?? {},
  };
  const { projectUrl, changeSummary, testingSummary, checkResults } = evidence;
  const updateDraft = (patch: Partial<Omit<typeof evidence, "ownerKey">>) => {
    setDraft({ ...evidence, ...patch, ownerKey });
  };
  const evidenceComplete = isQualificationEvidenceComplete(evidence);
  const busy = saveEvidence.isPending || submitQualification.isPending;

  const save = async () => {
    if (!attempt) return null;
    setMessage(null);
    try {
      const saved = await saveEvidence.mutateAsync({
        attemptId: attempt.id,
        projectUrl,
        changeSummary,
        testingSummary,
        checkResults,
      });
      setMessage("Draft saved.");
      return saved;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your draft.");
      return null;
    }
  };

  const submit = async () => {
    if (!attempt || !evidenceComplete) return;
    const saved = await save();
    if (!saved) return;
    try {
      await submitQualification.mutateAsync({ attemptId: attempt.id });
      setMessage("Submitted! Your instructor can review it now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit your qualification.");
    }
  };

  if (profileQuery.isLoading || definitionQuery.isLoading || attemptQuery.isLoading) {
    return <div style={{ padding: "3rem", display: "flex", gap: "0.5rem", justifyContent: "center", color: "var(--text-muted)" }}><Loader2 size={18} /> Loading training…</div>;
  }

  if (profileQuery.isError || definitionQuery.isError || attemptQuery.isError || !profile || !definition) {
    return <Card role="alert" style={{ padding: "1rem", color: "var(--danger)", border: "1px solid var(--danger)" }}>Training could not be loaded. Ask your instructor to try again.</Card>;
  }

  return (
    <div>
      <TopBar title="Training" subtitle="Orientation → Junior Developer Qualification → CL1" />

      <Card style={{ padding: "1.1rem", marginBottom: "1rem", border: "1px solid var(--brand)", background: "var(--brand-soft)" }}>
        <div style={{ fontWeight: 800, marginBottom: "0.25rem" }}>Your next step</div>
        <div style={{ fontSize: "0.86rem", lineHeight: 1.5 }}>
          {!orientationComplete
            ? "Finish the three quick Orientation sections below."
            : !attempt
              ? "Orientation complete! Start your Junior Developer Qualification."
              : attempt.status === "passed"
                ? "You passed! Your CL1 Cases are now unlocked."
                : attempt.status === "awaiting_review"
                  ? "Your qualification is with your instructor for review."
                  : attempt.status === "needs_retry"
                    ? "Read your instructor’s note, make a fix, and submit again."
                    : "Finish the small Scratch task and submit your evidence."}
        </div>
      </Card>

      <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.05rem" }}>Orientation</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0.85rem", marginBottom: "1.5rem" }}>
        {ORIENTATION_SECTIONS.map(section => {
          const complete = completedSections.includes(section.code);
          return (
            <Card key={section.code} style={{ padding: "1rem", border: complete ? "1px solid var(--success)" : "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.45rem" }}>
                {complete ? <CheckCircle2 size={17} color="var(--success)" /> : <Circle size={17} color="var(--text-muted)" />}
                <strong>{section.title}</strong>
              </div>
              <p style={{ fontSize: "0.82rem", lineHeight: 1.5, color: "var(--text-muted)" }}>{section.intro}</p>
              <ul style={{ paddingLeft: "1.2rem", fontSize: "0.82rem", lineHeight: 1.55 }}>
                {section.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}
              </ul>
              <Btn
                variant={complete ? "success" : "primary"}
                size="sm"
                disabled={complete || completeSection.isPending}
                onClick={() => completeSection.mutate({ sectionCode: section.code })}
              >
                {complete ? "Completed" : "I finished this section"}
              </Btn>
            </Card>
          );
        })}
      </div>

      <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: "1.05rem" }}>Junior Developer Qualification</h2>
      {!orientationComplete ? (
        <Card style={{ padding: "1rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Lock size={16} /> Complete all three Orientation sections to unlock this task.
        </Card>
      ) : !attempt ? (
        <Card style={{ padding: "1.1rem" }}>
          <Badge tone="brand">One workshop segment</Badge>
          <h3 style={{ margin: "0.7rem 0 0.35rem" }}>{definition.title}</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.86rem" }}>{definition.description}</p>
          <p style={{ fontSize: "0.86rem", lineHeight: 1.55 }}>{definition.task_brief}</p>
          <StarterProject
            url={definition.requirements.starter_project_url}
            behavior={definition.requirements.starter_behavior}
          />
          <Btn
            onClick={() => startQualification.mutate({ qualificationId: definition.id, sessionId })}
            disabled={startQualification.isPending || !sessionId}
          >
            Start qualification
          </Btn>
        </Card>
      ) : attempt.status === "passed" ? (
        <Card style={{ padding: "1.2rem", border: "1px solid var(--success)", background: "var(--success-soft)" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontWeight: 800 }}><CheckCircle2 size={20} /> Qualification passed — CL1 earned</div>
          <p style={{ marginBottom: 0, fontSize: "0.86rem" }}>You can now begin CL1 Cases assigned to your session.</p>
        </Card>
      ) : (
        <Card style={{ padding: "1.2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", marginBottom: "0.75rem" }}>
            <strong>{definition.title}</strong>
            <Badge tone={attempt.status === "awaiting_review" ? "accent" : attempt.status === "needs_retry" ? "danger" : "brand"}>
              {attempt.status === "awaiting_review" ? "Submitted" : attempt.status === "needs_retry" ? "Retry needed" : "In progress"}
            </Badge>
          </div>

          {attempt.feedback && attempt.status !== "awaiting_review" && (
            <div role="alert" style={{ padding: "0.8rem", marginBottom: "1rem", borderRadius: 8, background: "var(--danger-soft)", border: "1px solid var(--danger)" }}>
              <strong><RotateCcw size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />Instructor note</strong>
              <div style={{ marginTop: "0.3rem", fontSize: "0.84rem" }}>{attempt.feedback}</div>
            </div>
          )}

          <StarterProject
            url={definition.requirements.starter_project_url}
            behavior={definition.requirements.starter_behavior}
          />

          <ol style={{ fontSize: "0.85rem", lineHeight: 1.6, paddingLeft: "1.25rem" }}>
            {(definition.requirements.student_steps ?? []).map(step => <li key={step}>{step}</li>)}
          </ol>

          <Field label="Scratch project link" hint="Share the project in Scratch, then paste its project URL." htmlFor="qualification-project-url" error={projectUrl && !SCRATCH_PROJECT_URL_PATTERN.test(projectUrl.trim()) ? "Use a link like https://scratch.mit.edu/projects/123456789/" : undefined}>
            <Input id="qualification-project-url" type="url" value={projectUrl} disabled={!editable} onChange={event => updateDraft({ projectUrl: event.target.value })} placeholder="https://scratch.mit.edu/projects/123456789/" />
          </Field>
          {projectUrl && SCRATCH_PROJECT_URL_PATTERN.test(projectUrl.trim()) && <a href={projectUrl} target="_blank" rel="noreferrer" style={{ fontSize: "0.78rem" }}>Open project <ExternalLink size={12} /></a>}
          <Field label="1. What did you change?" hint="One or two sentences is enough." htmlFor="qualification-change">
            <Textarea id="qualification-change" rows={3} maxLength={500} value={changeSummary} disabled={!editable} onChange={event => updateDraft({ changeSummary: event.target.value })} />
          </Field>
          <Field label="2. How did you know it worked?" hint="Tell us what you saw when you tested." htmlFor="qualification-test">
            <Textarea id="qualification-test" rows={3} maxLength={500} value={testingSummary} disabled={!editable} onChange={event => updateDraft({ testingSummary: event.target.value })} />
          </Field>

          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
            <legend style={{ fontWeight: 700, fontSize: "0.82rem", marginBottom: "0.4rem" }}>I ran these checks</legend>
            {QUALIFICATION_CHECKS.map(check => (
              <label key={check.code} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.83rem", marginTop: "0.45rem" }}>
                <input type="checkbox" checked={checkResults[check.code] ?? false} onChange={event => updateDraft({ checkResults: { ...checkResults, [check.code]: event.target.checked } })} />
                {check.label}
              </label>
            ))}
          </fieldset>

          {message && <div role="status" style={{ fontSize: "0.82rem", marginBottom: "0.75rem", color: message.includes("Could not") ? "var(--danger)" : "var(--text-muted)" }}>{message}</div>}
          {editable ? (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Btn variant="ghost" disabled={busy} onClick={() => void save()}>Save draft</Btn>
              <Btn disabled={busy || !evidenceComplete} onClick={() => void submit()}>Submit for review</Btn>
            </div>
          ) : (
            <p style={{ marginBottom: 0, color: "var(--text-muted)", fontSize: "0.84rem" }}>Your evidence is locked while your instructor reviews it.</p>
          )}
        </Card>
      )}
    </div>
  );
}
