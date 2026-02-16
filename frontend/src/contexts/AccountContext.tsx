import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";
import { useAuth } from "./AuthContext";

// Admin Platform ABC Account ID - the actual account created in the database
const ABC_ACCOUNT_ID = "a0000000-0000-0000-0000-000000000001";
// Fallback to find ABC by name if UUID doesn't match
const ABC_ACCOUNT_NAME = "ABC";

interface Account {
  id: string;
  name: string;
}

interface AccountContextType {
  accounts: Account[];
  selectedAccount: Account | null;
  setSelectedAccount: (account: Account) => void;
  isLoading: boolean;
  refetchAccounts: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { isSuperAdmin, userAccounts, isAuthenticated } = useAuth();

  // ── External API: fetch accounts from NestJS ───────────────────────────────
  const fetchAccountsExternal = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await httpClient.get<Account[]>("/api/accounts");

      if (error) throw new Error(error.message);

      let accountList = Array.isArray(data) ? data : [];

      // For non-super-admin users, filter accounts to only those the user has access to
      if (!isSuperAdmin && userAccounts.length > 0) {
        const accessibleIds = new Set(userAccounts.map(ua => ua.accountId));
        accountList = accountList.filter(a => accessibleIds.has(a.id));
      } else if (!isSuperAdmin && userAccounts.length === 0) {
        // User has no account access at all
        accountList = [];
      }

      setAccounts(accountList);

      if (!selectedAccount && accountList.length > 0) {
        if (isSuperAdmin) {
          // Super admin defaults to ABC account
          const abcAccountById = accountList.find(a => a.id === ABC_ACCOUNT_ID);
          const abcAccountByName = accountList.find(a => a.name === ABC_ACCOUNT_NAME);
          const defaultAccount = abcAccountById || abcAccountByName || accountList[0];
          setSelectedAccount({ id: defaultAccount.id, name: defaultAccount.name });
        } else {
          // Regular user defaults to their first accessible account
          setSelectedAccount({ id: accountList[0].id, name: accountList[0].name });
        }
      } else if (selectedAccount && accountList.length > 0) {
        const stillAccessible = accountList.find(a => a.id === selectedAccount.id);
        if (!stillAccessible) {
          setSelectedAccount({ id: accountList[0].id, name: accountList[0].name });
        }
      } else if (accountList.length === 0) {
        setAccounts([]);
        setSelectedAccount(null);
      }
    } catch (error) {
      console.error("Error fetching accounts from API:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Supabase: existing fetch logic ─────────────────────────────────────────
  const fetchAccountsSupabase = async () => {
    setIsLoading(true);
    try {
      if (isSuperAdmin) {
        // Super admin can see all accounts
        const { data, error } = await supabase
          .from("accounts")
          .select("id, name")
          .order("created_at", { ascending: true });

        if (error) throw error;
        setAccounts(data || []);

        // Set ABC account as default for super admin
        if (!selectedAccount && data && data.length > 0) {
          const abcAccountById = data.find(a => a.id === ABC_ACCOUNT_ID);
          const abcAccountByName = data.find(a => a.name === ABC_ACCOUNT_NAME);
          const defaultAccount = abcAccountById || abcAccountByName || data[0];
          setSelectedAccount({ id: defaultAccount.id, name: defaultAccount.name });
        }
      } else if (userAccounts.length > 0) {
        // Regular user - only show accounts they have access to
        const accessibleAccountIds = userAccounts.map(ua => ua.accountId);
        
        const { data, error } = await supabase
          .from("accounts")
          .select("id, name")
          .in("id", accessibleAccountIds)
          .order("created_at", { ascending: true });

        if (error) throw error;
        setAccounts(data || []);

        // Set first accessible account as default
        if (!selectedAccount && data && data.length > 0) {
          setSelectedAccount({ id: data[0].id, name: data[0].name });
        } else if (selectedAccount && data) {
          // Verify current selection is still accessible
          const stillAccessible = data.find(a => a.id === selectedAccount.id);
          if (!stillAccessible && data.length > 0) {
            setSelectedAccount({ id: data[0].id, name: data[0].name });
          }
        }
      } else {
        // No access - clear accounts
        setAccounts([]);
        setSelectedAccount(null);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Unified dispatcher ─────────────────────────────────────────────────────
  const fetchAccounts = async () => {
    if (isExternalApi()) {
      return fetchAccountsExternal();
    }
    return fetchAccountsSupabase();
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAccounts();
    }
  }, [isAuthenticated, isSuperAdmin, userAccounts]);

  return (
    <AccountContext.Provider
      value={{
        accounts,
        selectedAccount,
        setSelectedAccount,
        isLoading,
        refetchAccounts: fetchAccounts,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccountContext() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error("useAccountContext must be used within an AccountProvider");
  }
  return context;
}
