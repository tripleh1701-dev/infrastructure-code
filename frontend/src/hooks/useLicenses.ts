import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ensureDefaultWorkstream } from "./useWorkstreams";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface License {
  id: string;
  account_id: string;
  enterprise_id: string;
  product_id: string;
  service_id: string;
  start_date: string;
  end_date: string;
  number_of_users: number;
  contact_full_name: string;
  contact_email: string;
  contact_phone: string | null;
  contact_department: string | null;
  contact_designation: string | null;
  renewal_notify: boolean;
  notice_days: number;
  created_at: string;
  updated_at: string;
}

export interface LicenseWithDetails extends License {
  enterprise: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
}

export interface LicenseFormData {
  enterprise_id: string;
  product_id: string;
  service_id: string;
  start_date: string;
  end_date: string;
  number_of_users: number;
  contact_full_name: string;
  contact_email: string;
  contact_phone?: string;
  contact_department?: string;
  contact_designation?: string;
  renewal_notify: boolean;
  notice_days: number;
}

export function useLicenses(accountId?: string) {
  const queryClient = useQueryClient();

  const licensesQuery = useQuery({
    queryKey: ["licenses", accountId],
    queryFn: async () => {
      if (!accountId) return [];

      if (isExternalApi()) {
        // Fetch licenses and licensed entities (product/service names) in parallel
        const [licensesRes, entitiesRes] = await Promise.all([
          httpClient.get<any[]>('/api/licenses', { params: { accountId } }),
          httpClient.get<{ products: { id: string; name: string }[]; services: { id: string; name: string }[] }>('/api/licenses/licensed-entities', { params: { accountId } }),
        ]);
        if (licensesRes.error) throw new Error(licensesRes.error.message);
        
        // Build lookup maps for product/service names
        const productMap = new Map<string, { id: string; name: string }>();
        const serviceMap = new Map<string, { id: string; name: string }>();
        if (entitiesRes.data) {
          (entitiesRes.data.products || []).forEach((p: any) => productMap.set(p.id, p));
          (entitiesRes.data.services || []).forEach((s: any) => serviceMap.set(s.id, s));
        }

        // Map camelCase API response back to snake_case for UI consistency
        return (licensesRes.data || []).map((l: any) => {
          const productId = l.productId ?? l.product_id;
          const serviceId = l.serviceId ?? l.service_id;
          return {
            id: l.id,
            account_id: l.accountId ?? l.account_id,
            enterprise_id: l.enterpriseId ?? l.enterprise_id,
            product_id: productId,
            service_id: serviceId,
            start_date: l.startDate ?? l.start_date,
            end_date: l.endDate ?? l.end_date,
            number_of_users: l.numberOfUsers ?? l.number_of_users,
            contact_full_name: l.contactFullName ?? l.contact_full_name,
            contact_email: l.contactEmail ?? l.contact_email,
            contact_phone: l.contactPhone ?? l.contact_phone ?? null,
            contact_department: l.contactDepartment ?? l.contact_department ?? null,
            contact_designation: l.contactDesignation ?? l.contact_designation ?? null,
            renewal_notify: l.renewalNotify ?? l.renewal_notify,
            notice_days: l.noticeDays ?? l.notice_days,
            created_at: l.createdAt ?? l.created_at,
            updated_at: l.updatedAt ?? l.updated_at,
            enterprise: l.enterprise ?? null,
            product: productMap.get(productId) || null,
            service: serviceMap.get(serviceId) || null,
          };
        }) as LicenseWithDetails[];
      }

      const { data, error } = await supabase
        .from("account_licenses")
        .select(`
          *,
          enterprises (id, name),
          products (id, name),
          services (id, name)
        `)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((license) => ({
        ...license,
        enterprise: license.enterprises,
        product: license.products,
        service: license.services,
      })) as LicenseWithDetails[];
    },
    enabled: !!accountId,
  });

  const createLicense = useMutation({
    mutationFn: async (data: LicenseFormData & { account_id: string }) => {
      if (isExternalApi()) {
        const { error } = await httpClient.post('/api/licenses', {
          accountId: data.account_id,
          enterpriseId: data.enterprise_id,
          productId: data.product_id,
          serviceId: data.service_id,
          startDate: data.start_date,
          endDate: data.end_date,
          numberOfUsers: data.number_of_users,
          contactFullName: data.contact_full_name,
          contactEmail: data.contact_email,
          contactPhone: data.contact_phone || null,
          contactDepartment: data.contact_department || null,
          contactDesignation: data.contact_designation || null,
          renewalNotify: data.renewal_notify,
          noticeDays: data.notice_days,
        });
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from("account_licenses").insert({
        account_id: data.account_id,
        enterprise_id: data.enterprise_id,
        product_id: data.product_id,
        service_id: data.service_id,
        start_date: data.start_date,
        end_date: data.end_date,
        number_of_users: data.number_of_users,
        contact_full_name: data.contact_full_name,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone || null,
        contact_department: data.contact_department || null,
        contact_designation: data.contact_designation || null,
        renewal_notify: data.renewal_notify,
        notice_days: data.notice_days,
      });

      if (error) throw error;

      // Ensure Default workstream exists for this account+enterprise using centralized function
      const defaultWorkstreamId = await ensureDefaultWorkstream(data.account_id, data.enterprise_id);

      // Assign Default workstream to all technical users in this account that don't have any workstream yet
      if (defaultWorkstreamId) {
        const { data: technicalUsers } = await supabase
          .from("account_technical_users")
          .select("id")
          .eq("account_id", data.account_id)
          .eq("is_technical_user", true);

        if (technicalUsers && technicalUsers.length > 0) {
          for (const user of technicalUsers) {
            // Check if user already has workstreams assigned
            const { data: existingAssignments } = await supabase
              .from("user_workstreams")
              .select("id")
              .eq("user_id", user.id)
              .limit(1);

            if (!existingAssignments || existingAssignments.length === 0) {
              // Assign the Default workstream
              await supabase.from("user_workstreams").insert({
                user_id: user.id,
                workstream_id: defaultWorkstreamId,
              });
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licenses", accountId] });
      queryClient.invalidateQueries({ queryKey: ["workstreams"] });
      queryClient.invalidateQueries({ queryKey: ["accessControlUsers"] });
    },
  });

  const updateLicense = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LicenseFormData> }) => {
      if (isExternalApi()) {
        const { error } = await httpClient.put(`/api/licenses/${id}`, data);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase
        .from("account_licenses")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licenses", accountId] });
    },
  });

  const deleteLicense = useMutation({
    mutationFn: async (id: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/api/licenses/${id}`);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from("account_licenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licenses", accountId] });
    },
  });

  return {
    licenses: licensesQuery.data || [],
    isLoading: licensesQuery.isLoading,
    createLicense,
    updateLicense,
    deleteLicense,
    refetch: licensesQuery.refetch,
  };
}
