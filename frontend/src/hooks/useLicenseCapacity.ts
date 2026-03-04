import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface LicenseCapacity {
  totalAllowed: number;
  currentActiveUsers: number;
  remaining: number;
  isAtCapacity: boolean;
  hasLicenses: boolean;
  licenses: Array<{
    licenseId: string;
    enterpriseName: string;
    productName: string;
    numberOfUsers: number;
    endDate: string;
  }>;
}

/**
 * Hook to compute the aggregate license capacity for an account.
 * 
 * Logic:
 *  1. Fetch all active (non-expired) licenses for the account
 *  2. Sum `number_of_users` across all active licenses → totalAllowed
 *  3. Count active users in `account_technical_users` → currentActiveUsers
 *  4. remaining = totalAllowed - currentActiveUsers
 */
export function useLicenseCapacity(accountId?: string | null) {
  return useQuery({
    queryKey: ["license-capacity", accountId],
    queryFn: async (): Promise<LicenseCapacity> => {
      if (!accountId) {
        return {
          totalAllowed: 0,
          currentActiveUsers: 0,
          remaining: 0,
          isAtCapacity: true,
          hasLicenses: false,
          licenses: [],
        };
      }

      // External API mode: backend computes capacity server-side.
      // Fallback to client-side aggregate if endpoint is not deployed yet.
      if (isExternalApi()) {
        const capacityRes = await httpClient.get<LicenseCapacity>(`/licenses/capacity`, {
          params: { accountId },
        });

        if (!capacityRes.error && capacityRes.data) {
          return capacityRes.data;
        }

        const shouldFallback = capacityRes.error?.status === 404 || capacityRes.error?.status === 504;
        if (!shouldFallback) {
          throw new Error(capacityRes.error?.message || "Failed to fetch license capacity");
        }

        const [licensesRes, usersRes] = await Promise.all([
          httpClient.get<any[]>(`/licenses`, { params: { accountId } }),
          httpClient.get<any[]>(`/users`, { params: { accountId } }),
        ]);

        if (licensesRes.error) throw new Error(licensesRes.error.message);
        if (usersRes.error) throw new Error(usersRes.error.message);

        const today = new Date().toISOString().split("T")[0];
        const activeLicenses = (licensesRes.data || []).filter((lic: any) => {
          const endDate = lic.endDate || lic.end_date;
          return typeof endDate === "string" && endDate >= today;
        });

        const currentActiveUsers = (usersRes.data || []).filter(
          (u: any) => (u.status || "").toLowerCase() === "active"
        ).length;

        const totalAllowed = activeLicenses.reduce(
          (sum: number, lic: any) => sum + Number(lic.numberOfUsers ?? lic.number_of_users ?? 0),
          0
        );

        const remaining = Math.max(0, totalAllowed - currentActiveUsers);

        return {
          totalAllowed,
          currentActiveUsers,
          remaining,
          isAtCapacity: remaining <= 0,
          hasLicenses: activeLicenses.length > 0,
          licenses: activeLicenses.map((lic: any) => ({
            licenseId: lic.id,
            enterpriseName: lic.enterpriseName || lic.enterprise?.name || "Unknown",
            productName: lic.productName || lic.product?.name || "Unknown",
            numberOfUsers: Number(lic.numberOfUsers ?? lic.number_of_users ?? 0),
            endDate: lic.endDate || lic.end_date,
          })),
        };
      }

      const today = new Date().toISOString().split("T")[0];

      // Fetch active licenses and active user count in parallel
      const [licensesResult, usersResult] = await Promise.all([
        supabase
          .from("account_licenses")
          .select(`
            id,
            number_of_users,
            end_date,
            enterprises (id, name),
            products (id, name)
          `)
          .eq("account_id", accountId)
          .gte("end_date", today),
        supabase
          .from("account_technical_users")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
          .eq("status", "active"),
      ]);

      if (licensesResult.error) throw licensesResult.error;
      if (usersResult.error) throw usersResult.error;

      const activeLicenses = licensesResult.data || [];
      const currentActiveUsers = usersResult.count || 0;

      const totalAllowed = activeLicenses.reduce(
        (sum, lic) => sum + (lic.number_of_users || 0),
        0
      );

      const remaining = Math.max(0, totalAllowed - currentActiveUsers);

      return {
        totalAllowed,
        currentActiveUsers,
        remaining,
        isAtCapacity: remaining <= 0,
        hasLicenses: activeLicenses.length > 0,
        licenses: activeLicenses.map((lic: any) => ({
          licenseId: lic.id,
          enterpriseName: lic.enterprises?.name || "Unknown",
          productName: lic.products?.name || "Unknown",
          numberOfUsers: lic.number_of_users,
          endDate: lic.end_date,
        })),
      };
    },
    enabled: !!accountId,
    staleTime: 30_000, // 30s — capacity changes rarely
  });
}
