import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";
import { useAuth } from "./AuthContext";
import { useAccountContext } from "./AccountContext";

const GLOBAL_ENTERPRISE_ID = "00000000-0000-0000-0000-000000000001";

interface EnterpriseProduct {
  id: string;
  name: string;
}

interface Enterprise {
  id: string;
  name: string;
  product?: EnterpriseProduct | null;
}

interface EnterpriseContextType {
  enterprises: Enterprise[];
  selectedEnterprise: Enterprise | null;
  setSelectedEnterprise: (enterprise: Enterprise) => void;
  isLoading: boolean;
  refetchEnterprises: () => Promise<void>;
  getEnterpriseDisplayName: (enterprise: Enterprise) => string;
  hasDuplicateNames: (enterpriseName: string) => boolean;
}

const EnterpriseContext = createContext<EnterpriseContextType | undefined>(undefined);

export function EnterpriseProvider({ children }: { children: ReactNode }) {
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const { isSuperAdmin, userAccounts, isAuthenticated } = useAuth();
  const { selectedAccount } = useAccountContext();

  // ── Shared: apply default selection & sorting ──────────────────────────────
  const applyDefaultSelection = (sorted: Enterprise[]) => {
    if (!selectedEnterprise && sorted.length > 0) {
      const global = sorted.find(e => e.id === GLOBAL_ENTERPRISE_ID) || sorted[0];
      setSelectedEnterprise(global);
    } else if (selectedEnterprise && sorted.length > 0) {
      const stillAccessible = sorted.find(e => e.id === selectedEnterprise.id);
      if (!stillAccessible) {
        const global = sorted.find(e => e.id === GLOBAL_ENTERPRISE_ID) || sorted[0];
        setSelectedEnterprise(global);
      }
    }
  };

  const sortEnterprises = (data: Enterprise[]): Enterprise[] => {
    return [...data].sort((a, b) => {
      if (a.id === GLOBAL_ENTERPRISE_ID) return -1;
      if (b.id === GLOBAL_ENTERPRISE_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  // ── External API: fetch enterprises from NestJS ────────────────────────────
  const fetchEnterprisesExternal = async () => {
    setIsLoading(true);
    try {
      // NestJS returns enterprises scoped to the user's access + selected account
      // Server handles Global enterprise inclusion, product linkage resolution,
      // and license-based filtering
      const params: Record<string, string> = {};
      if (selectedAccount?.id) {
        params.accountId = selectedAccount.id;
      }

      const { data, error } = await httpClient.get<Enterprise[]>("/api/enterprises", {
        params,
      });

      if (error) throw new Error(error.message);

      const sorted = sortEnterprises(Array.isArray(data) ? data : []);
      setEnterprises(sorted);
      applyDefaultSelection(sorted);
    } catch (error) {
      console.error("Error fetching enterprises from API:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Supabase: existing fetch logic ─────────────────────────────────────────
  const fetchEnterprisesSupabase = async () => {
    setIsLoading(true);
    try {
      let enterprisesData: { id: string; name: string }[] = [];

      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from("enterprises")
          .select("id, name")
          .order("created_at", { ascending: true });

        if (error) throw error;
        enterprisesData = data || [];
      } else if (selectedAccount) {
        const userEnterpriseIds = userAccounts
          .filter(ua => ua.accountId === selectedAccount.id && ua.enterpriseId)
          .map(ua => ua.enterpriseId as string);

        if (userEnterpriseIds.length > 0) {
          const { data, error } = await supabase
            .from("enterprises")
            .select("id, name")
            .in("id", userEnterpriseIds)
            .order("created_at", { ascending: true });

          if (error) throw error;
          enterprisesData = data || [];
        } else {
          const { data: licenses } = await supabase
            .from("account_licenses")
            .select("enterprise_id")
            .eq("account_id", selectedAccount.id);

          if (licenses && licenses.length > 0) {
            const licenseEnterpriseIds = [...new Set(licenses.map(l => l.enterprise_id))];
            
            const { data, error } = await supabase
              .from("enterprises")
              .select("id, name")
              .in("id", licenseEnterpriseIds)
              .order("created_at", { ascending: true });

            if (error) throw error;
            enterprisesData = data || [];
          }
        }

        // Always include Global enterprise if user has access to an account
        const hasGlobal = enterprisesData.some(e => e.id === GLOBAL_ENTERPRISE_ID);
        if (!hasGlobal) {
          const { data: globalEnt } = await supabase
            .from("enterprises")
            .select("id, name")
            .eq("id", GLOBAL_ENTERPRISE_ID)
            .single();

          if (globalEnt) {
            enterprisesData.unshift(globalEnt);
          }
        }
      }

      // Fetch product linkages separately
      const { data: productLinkages, error: productError } = await supabase
        .from("enterprise_products")
        .select(`
          enterprise_id,
          products (id, name)
        `);

      if (productError) throw productError;

      // Map enterprises with their linked product
      const transformedData: Enterprise[] = enterprisesData.map((e) => {
        const productLink = (productLinkages || []).find(
          (link) => link.enterprise_id === e.id
        );
        const product = productLink?.products
          ? { id: (productLink.products as any).id, name: (productLink.products as any).name }
          : null;
        
        return {
          id: e.id,
          name: e.name,
          product,
        };
      });

      const sorted = sortEnterprises(transformedData);
      setEnterprises(sorted);
      applyDefaultSelection(sorted);
    } catch (error) {
      console.error("Error fetching enterprises:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Unified dispatcher ─────────────────────────────────────────────────────
  const fetchEnterprises = async () => {
    if (isExternalApi()) {
      return fetchEnterprisesExternal();
    }
    return fetchEnterprisesSupabase();
  };

  // Check if an enterprise name has duplicates (multiple products)
  const hasDuplicateNames = (enterpriseName: string): boolean => {
    const count = enterprises.filter(e => e.name === enterpriseName).length;
    return count > 1;
  };

  // Get display name for an enterprise - includes product if there are duplicates
  const getEnterpriseDisplayName = (enterprise: Enterprise): string => {
    if (hasDuplicateNames(enterprise.name) && enterprise.product?.name) {
      return `${enterprise.name} - ${enterprise.product.name}`;
    }
    return enterprise.name;
  };

  useEffect(() => {
    if (isAuthenticated && selectedAccount) {
      fetchEnterprises();
    }
  }, [isAuthenticated, isSuperAdmin, selectedAccount?.id, userAccounts]);

  return (
    <EnterpriseContext.Provider
      value={{
        enterprises,
        selectedEnterprise,
        setSelectedEnterprise,
        isLoading,
        refetchEnterprises: fetchEnterprises,
        getEnterpriseDisplayName,
        hasDuplicateNames,
      }}
    >
      {children}
    </EnterpriseContext.Provider>
  );
}

export function useEnterpriseContext() {
  const context = useContext(EnterpriseContext);
  if (context === undefined) {
    throw new Error("useEnterpriseContext must be used within an EnterpriseProvider");
  }
  return context;
}

export { GLOBAL_ENTERPRISE_ID };
export type { Enterprise };
