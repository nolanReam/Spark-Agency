import { useState, useEffect, useCallback } from "react";
import { supabase } from "../api/client";
import type { Session, User } from "@supabase/supabase-js";

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
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${username}@sparkagency.internal`,
      password,
    });
    if (data?.session) {
      setRole(roleFromSession(data.session));
    }
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole("student");
  }, []);

  return { session, user, role, setRole, loading, signIn, signOut, isAuthenticated: !!user };
}
