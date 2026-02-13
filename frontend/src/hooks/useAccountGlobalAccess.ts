import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

const GLOBAL_ENTERPRISE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Hook to check if a given account has a license linked to the Global enterprise.
 * If so, the account should have access to view all enterprises and accounts.
 */
export function useAccountGlobalAccess(accountId: string | null | undefined) {
  const [hasGlobalAccess, setHasGlobalAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkGlobalAccess() {
      if (!accountId) {
        setHasGlobalAccess(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // External API mode: NestJS checks global access server-side
        if (isExternalApi()) {
          const { data, error } = await httpClient.get<{ hasGlobalAccess: boolean }>(`/api/accounts/${accountId}/global-access`);
          if (error) {
            console.error("Error checking global access:", error);
            setHasGlobalAccess(false);
          } else {
            setHasGlobalAccess(data?.hasGlobalAccess || false);
          }
          setIsLoading(false);
          return;
        }

        // Check if this account has any license linked to the Global enterprise
        const { data, error } = await supabase
          .from("account_licenses")
          .select("id")
          .eq("account_id", accountId)
          .eq("enterprise_id", GLOBAL_ENTERPRISE_ID)
          .limit(1);

        if (error) throw error;

        setHasGlobalAccess((data && data.length > 0) || false);
      } catch (error) {
        console.error("Error checking global access:", error);
        setHasGlobalAccess(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkGlobalAccess();
  }, [accountId]);

  return { hasGlobalAccess, isLoading };
}

export { GLOBAL_ENTERPRISE_ID };
