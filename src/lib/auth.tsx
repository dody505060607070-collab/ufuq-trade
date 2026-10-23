import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { oauthReturnPath } from "./oauth-return-path";

type AuthState = {
  session: Session | null;
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, user: null, isAdmin: false, loading: true });

export function AuthProvider({ children, onIdentityChange }: { children: ReactNode; onIdentityChange?: () => void }) {
  const [state, setState] = useState<AuthState>({ session: null, user: null, isAdmin: false, loading: true });

  useEffect(() => {
    let active = true;
    const load = async (session: Session | null) => {
      let isAdmin = false;
      if (session?.user) {
        const { data } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
        isAdmin = !!data;
      }
      if (active) setState({ session, user: session?.user ?? null, isAdmin, loading: false });
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void load(session);
      onIdentityChange?.();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [onIdentityChange]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function safeRedirect(value: unknown): string {
  const path = oauthReturnPath(value);
  return path === "/" ? "/dashboard" : path;
}
