const STUDENT_AUTH_DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const STUDENT_USERNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$/;

export function canonicalizeStudentUsername(username: string) {
  return username.trim().toLowerCase();
}

export function getStudentAuthEmailDomain(): string | null {
  const domain = import.meta.env.VITE_STUDENT_AUTH_EMAIL_DOMAIN?.trim().toLowerCase();
  return domain && STUDENT_AUTH_DOMAIN_PATTERN.test(domain) ? domain : null;
}

export function getStudentAuthConfigurationError(): string | null {
  if (getStudentAuthEmailDomain()) return null;
  return import.meta.env.DEV
    ? "Missing or invalid VITE_STUDENT_AUTH_EMAIL_DOMAIN configuration."
    : "Student account access is temporarily unavailable.";
}

export function getStudentAuthEmail(username: string): string | null {
  const domain = getStudentAuthEmailDomain();
  if (!domain) return null;
  return `${canonicalizeStudentUsername(username)}@${domain}`;
}
