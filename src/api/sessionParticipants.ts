export interface SessionMonitorParticipant {
  session_id: string;
  student_id: string;
  display_name: string;
  role: "student" | "volunteer";
}

const INCOMPLETE_PARTICIPANT_DATA =
  "Participant profile data is incomplete or unavailable.";

function relatedUser(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    if (value.length !== 1) return null;
    return value[0] && typeof value[0] === "object"
      ? value[0] as Record<string, unknown>
      : null;
  }

  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

export function normalizeSessionParticipants(
  value: unknown,
  expectedSessionId: string,
): SessionMonitorParticipant[] {
  if (!Array.isArray(value)) throw new Error(INCOMPLETE_PARTICIPANT_DATA);

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error(INCOMPLETE_PARTICIPANT_DATA);
    }

    const row = item as Record<string, unknown>;
    const user = relatedUser(row.users);
    const role = user?.role;

    if (
      typeof row.session_id !== "string"
      || row.session_id !== expectedSessionId
      || typeof row.student_id !== "string"
      || !user
      || user.id !== row.student_id
      || typeof user.display_name !== "string"
      || user.display_name.trim() === ""
      || (role !== "student" && role !== "volunteer")
    ) {
      throw new Error(INCOMPLETE_PARTICIPANT_DATA);
    }

    return {
      session_id: row.session_id,
      student_id: row.student_id,
      display_name: user.display_name,
      role,
    };
  });
}
