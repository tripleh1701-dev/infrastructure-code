import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

interface EnterpriseLicenseLink {
  enterprise_id: string;
  license_count: number;
  account_names: string[];
}

export function useEnterpriseLicenseLinks() {
  const [links, setLinks] = useState<EnterpriseLicenseLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLinks = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isExternalApi()) {
        // For external API, fetch licenses and aggregate
        const { data, error } = await httpClient.get<any[]>('/api/licenses');
        if (error) throw new Error(error.message);
        const licenseList = Array.isArray(data) ? data : [];
        const linkMap = new Map<string, { count: number; accounts: Set<string> }>();
        for (const lic of licenseList) {
          const eid = lic.enterprise_id || lic.enterpriseId;
          if (!eid) continue;
          if (!linkMap.has(eid)) linkMap.set(eid, { count: 0, accounts: new Set() });
          const entry = linkMap.get(eid)!;
          entry.count++;
          const accName = lic.account_name || lic.accountName || "";
          if (accName) entry.accounts.add(accName);
        }
        setLinks(Array.from(linkMap.entries()).map(([eid, v]) => ({
          enterprise_id: eid,
          license_count: v.count,
          account_names: Array.from(v.accounts),
        })));
        return;
      }

      // Supabase: query licenses grouped by enterprise, join accounts for names
      const { data: licenses, error } = await supabase
        .from("account_licenses")
        .select("enterprise_id, account_id, accounts(name)");

      if (error) throw error;

      const linkMap = new Map<string, { count: number; accounts: Set<string> }>();
      for (const lic of licenses || []) {
        const eid = lic.enterprise_id;
        if (!eid) continue;
        if (!linkMap.has(eid)) linkMap.set(eid, { count: 0, accounts: new Set() });
        const entry = linkMap.get(eid)!;
        entry.count++;
        const accName = (lic.accounts as any)?.name;
        if (accName) entry.accounts.add(accName);
      }

      setLinks(Array.from(linkMap.entries()).map(([eid, v]) => ({
        enterprise_id: eid,
        license_count: v.count,
        account_names: Array.from(v.accounts),
      })));
    } catch (error) {
      console.error("Error fetching enterprise-license links:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const isEnterpriseLinked = useCallback((enterpriseId: string) => {
    return links.some(l => l.enterprise_id === enterpriseId);
  }, [links]);

  const getLinkDetails = useCallback((enterpriseId: string) => {
    return links.find(l => l.enterprise_id === enterpriseId) || null;
  }, [links]);

  return { links, isLoading, isEnterpriseLinked, getLinkDetails, refetch: fetchLinks };
}
