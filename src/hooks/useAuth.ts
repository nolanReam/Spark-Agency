import { useState, useEffect, useCallback } from "react";
import { supabase } from "../api/client";
import type { Session, User } from "@supabase/supabase-js";
import {
  canonicalizeStudentUsername,
  getStudentAuthConfigurationError,
  getStudentAuthEmail,
  STUDENT_USERNAME_PATTERN,
} from "../lib/studentAuth";

export type UserRole = "student" | "volunteer" | "instructor" | "admin";

/** Extract the role from the Supabase JWT's app_metadata */
function roleFromSession(session: Session | null): UserRole {
  if (!session?.user?.app_metadata?.role) return "student";
  const r = session.user.app_metadata.role as string;
  if (["student", "volunteer", "instructor", "admin"].includes(r)) {
    return r as UserRole;
  }
  return "student";
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>("student");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setRole(roleFromSession(s));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setRole(roleFromSession(s));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const canonicalUsername = canonicalizeStudentUsername(username);
    const configuredEmail = getStudentAuthEmail(canonicalUsername);
    if (!configuredEmail) {
      return {
        data: { user: null, session: null },
        error: new Error(getStudentAuthConfigurationError() ?? "Student account access is temporarily unavailable."),
      };
    }

    let result = await supabase.auth.signInWithPassword({
      email: configuredEmail,
      password,
    });

    if (result.error?.code === "invalid_credentials") {
      result = await supabase.auth.signInWithPassword({
        email: `${canonicalUsername}@sparkagency.internal`,
        password,
      });
    }

    if (result.data?.session) {
      setRole(roleFromSession(result.data.session));
    }
    return result;
  }, []);

  const signInStaff = useCallback(async (emailOrLegacyUsername: string, password: string) => {
    const identifier = emailOrLegacyUsername.trim().toLowerCase();
    const email = identifier.includes("@")
      ? identifier
      : STUDENT_USERNAME_PATTERN.test(identifier)
        ? `${identifier}@sparkagency.internal`
        : null;

    if (!email) {
      return {
        data: { user: null, session: null },
        error: new Error("Invalid email or password."),
      };
    }

    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.data?.session) {
      setRole(roleFromSession(result.data.session));
    }
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole("student");
  }, []);

  return {
    session,
    user,
    role,
    setRole,
    loading,
    signIn,
    signInStaff,
    signOut,
    isAuthenticated: !!user,
    studentAuthConfigurationError: getStudentAuthConfigurationError(),
  };
}
