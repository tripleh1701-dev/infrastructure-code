import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { cognitoAuth, CognitoAuthUser, CognitoTokens } from "@/lib/auth/cognito-client";
import { supabase } from "@/integrations/supabase/client";
import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";

// TESTING MODE - Set to false in production!
const BYPASS_AUTH = false;

// Mock user for testing
const MOCK_USER: CognitoAuthUser = {
  sub: "e0000000-0000-0000-0000-000000000001",
  email: "admin@adminplatform.com",
  emailVerified: true,
  accountId: null,
  enterpriseId: null,
  role: "super_admin",
  groups: [],
  rawAttributes: {},
};

export interface UserAccountAccess {
  accountId: string;
  accountName: string;
  enterpriseId: string | null;
  enterpriseName: string | null;
}

interface AuthContextType {
  user: CognitoAuthUser | null;
  tokens: CognitoTokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  userAccounts: UserAccountAccess[];
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<{ error: Error | null }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ error: Error | null }>;
  refetchUserAccounts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CognitoAuthUser | null>(BYPASS_AUTH ? MOCK_USER : null);
  const [tokens, setTokens] = useState<CognitoTokens | null>(null);
  const [isLoading, setIsLoading] = useState(!BYPASS_AUTH);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userAccounts, setUserAccounts] = useState<UserAccountAccess[]>([]);

  // ── External API: fetch user access from NestJS ────────────────────────────
  const fetchUserAccountsExternal = useCallback(async (userEmail: string | undefined) => {
    if (!userEmail) {
      setUserAccounts([]);
      setIsSuperAdmin(false);
      return;
    }

    try {
      // NestJS endpoint returns the user's accessible accounts/enterprises
      // along with super_admin flag — server resolves this from the JWT subject
      const { data, error } = await httpClient.get<{
        isSuperAdmin: boolean;
        accounts: UserAccountAccess[];
      }>("/api/users/me/access");

      if (error) {
        console.error("Error fetching user access from API:", error);
        setUserAccounts([]);
        setIsSuperAdmin(false);
        return;
      }

      if (data) {
        setIsSuperAdmin(data.isSuperAdmin ?? false);
        setUserAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      }
    } catch (err) {
      console.error("Error fetching user access from API:", err);
      setUserAccounts([]);
      setIsSuperAdmin(false);
    }
  }, []);

  // ── Supabase: fetch user access from account_technical_users ───────────────
  const fetchUserAccountsSupabase = useCallback(async (userEmail: string | undefined) => {
    if (!userEmail) {
      setUserAccounts([]);
      setIsSuperAdmin(false);
      return;
    }

    try {
      // Get the user's technical user records to determine account access
      const { data: technicalUsers, error } = await supabase
        .from("account_technical_users")
        .select(`
          id,
          account_id,
          enterprise_id,
          accounts!account_technical_users_account_id_fkey (
            id,
            name
          ),
          enterprises (
            id,
            name
          )
        `)
        .eq("email", userEmail)
        .eq("status", "active");

      if (error) {
        console.error("Error fetching user accounts:", error);
        setUserAccounts([]);
        return;
      }

      // Check if user is super_admin (admin@adminplatform.com)
      const isAdmin = userEmail.toLowerCase() === "admin@adminplatform.com";
      setIsSuperAdmin(isAdmin);

      if (isAdmin) {
        // Super admin can see all accounts
        const { data: allAccounts } = await supabase
          .from("accounts")
          .select("id, name")
          .order("created_at", { ascending: true });

        if (allAccounts) {
          const allAccountAccess: UserAccountAccess[] = allAccounts.map((acc) => ({
            accountId: acc.id,
            accountName: acc.name,
            enterpriseId: null,
            enterpriseName: null,
          }));
          setUserAccounts(allAccountAccess);
        }
      } else {
        // Regular user - only show accounts they're assigned to
        const accountAccess: UserAccountAccess[] = (technicalUsers || []).map((tu: any) => ({
          accountId: tu.account_id,
          accountName: tu.accounts?.name || "Unknown",
          enterpriseId: tu.enterprise_id,
          enterpriseName: tu.enterprises?.name || null,
        }));

        // Deduplicate by accountId
        const uniqueAccounts = accountAccess.filter(
          (acc, index, self) => index === self.findIndex((a) => a.accountId === acc.accountId)
        );

        setUserAccounts(uniqueAccounts);
      }
    } catch (err) {
      console.error("Error fetching user accounts:", err);
      setUserAccounts([]);
    }
  }, []);

  // ── Unified dispatcher ─────────────────────────────────────────────────────
  const fetchUserAccounts = useCallback(
    async (userEmail: string | undefined) => {
      if (isExternalApi()) {
        return fetchUserAccountsExternal(userEmail);
      }
      return fetchUserAccountsSupabase(userEmail);
    },
    [fetchUserAccountsExternal, fetchUserAccountsSupabase]
  );

  useEffect(() => {
    // Skip auth setup in bypass mode
    if (BYPASS_AUTH) {
      console.warn(" AUTH BYPASS MODE ENABLED - For testing only!");
      fetchUserAccounts(MOCK_USER.email);
      return;
    }

    // ── Supabase mode ──────────────────────────────────────────────────────
    if (!isExternalApi()) {
      // Use Supabase Auth when not in external API mode
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (session?.user) {
            const supaUser: CognitoAuthUser = {
              sub: session.user.id,
              email: session.user.email || "",
              emailVerified: !!session.user.email_confirmed_at,
              accountId: null,
              enterpriseId: null,
              role: null,
              groups: [],
              rawAttributes: {},
            };
            setUser(supaUser);
            setTokens(null);
            setIsLoading(false);

            if (supaUser.email) {
              setTimeout(() => {
                fetchUserAccounts(supaUser.email);
              }, 0);
            }
          } else {
            setUser(null);
            setTokens(null);
            setIsLoading(false);
            setUserAccounts([]);
            setIsSuperAdmin(false);
          }
        }
      );

      // Check existing session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          setIsLoading(false);
        }
        // onAuthStateChange will handle the rest
      });

      return () => subscription.unsubscribe();
    }

    // ── External (Cognito) mode ────────────────────────────────────────────
    const { unsubscribe } = cognitoAuth.onAuthStateChange((event, authUser, authTokens) => {
      setUser(authUser);
      setTokens(authTokens);
      setIsLoading(false);

      // Sync auth token to HTTP client for external API calls
      if (authTokens) {
        httpClient.setAuthToken(authTokens.idToken);
      } else {
        httpClient.setAuthToken(null);
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (authUser?.email) {
          setTimeout(() => {
            fetchUserAccounts(authUser.email);
          }, 0);
        }
      } else if (event === "SIGNED_OUT" || event === "SESSION_EXPIRED") {
        setUserAccounts([]);
        setIsSuperAdmin(false);
      }
    });

    // Attempt to restore existing session
    cognitoAuth.getSession().then(({ data, error }) => {
      if (error || !data) {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchUserAccounts]);

  const signIn = async (email: string, password: string) => {
    if (BYPASS_AUTH) return { error: null };
    if (!isExternalApi()) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? new Error(error.message) : null };
    }
    const { error } = await cognitoAuth.signIn(email, password);
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    if (BYPASS_AUTH) return { error: null };
    if (!isExternalApi()) {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error: error ? new Error(error.message) : null };
    }
    const { error } = await cognitoAuth.signUp(email, password);
    return { error };
  };

  const signOut = async () => {
    if (BYPASS_AUTH) return;
    setUserAccounts([]);
    setIsSuperAdmin(false);
    if (!isExternalApi()) {
      await supabase.auth.signOut();
      return;
    }
    cognitoAuth.signOut();
  };

  const resetPassword = async (email: string) => {
    if (BYPASS_AUTH) return { error: null };
    if (!isExternalApi()) {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      return { error: error ? new Error(error.message) : null };
    }
    const { error } = await cognitoAuth.forgotPassword(email);
    return { error };
  };

  const confirmResetPassword = async (email: string, code: string, newPassword: string) => {
    if (BYPASS_AUTH) return { error: null };
    if (!isExternalApi()) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error: error ? new Error(error.message) : null };
    }
    const { error } = await cognitoAuth.confirmForgotPassword(email, code, newPassword);
    return { error };
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    if (BYPASS_AUTH) return { error: null };
    if (!isExternalApi()) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error: error ? new Error(error.message) : null };
    }
    const { error } = await cognitoAuth.changePassword(oldPassword, newPassword);
    return { error };
  };

  const refetchUserAccounts = useCallback(async () => {
    if (user?.email) {
      await fetchUserAccounts(user.email);
    }
  }, [user?.email, fetchUserAccounts]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        isLoading,
        isAuthenticated: BYPASS_AUTH ? true : !!user,
        isSuperAdmin,
        userAccounts,
        signIn,
        signUp,
        signOut,
        resetPassword,
        confirmResetPassword,
        changePassword,
        refetchUserAccounts,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}