import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

export interface Account {
  id: string;
  name: string;
  master_account_name: string;
  cloud_type: "public" | "private" | "hybrid";
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AccountAddress {
  id: string;
  account_id: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  created_at: string;
}

export interface AccountTechnicalUser {
  id: string;
  account_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string;
  status: string;
  start_date: string;
  end_date: string | null;
  assigned_group: string;
  assigned_role: string;
  created_at: string;
  updated_at: string;
}

export interface AccountWithDetails extends Account {
  addresses: AccountAddress[];
  technical_users: AccountTechnicalUser[];
  license_count?: number;
  expiring_license_count?: number;
}

export interface CreateAccountInput {
  name: string;
  master_account_name: string;
  cloud_type: "public" | "private" | "hybrid";
  addresses: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    country: string;
    postal_code: string;
  }[];
  technical_user: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    email: string;
    status: "active" | "inactive";
    start_date: string;
    end_date?: string;
    assigned_group: string;
    assigned_role: string;
  };
}

export interface UpdateAccountInput extends CreateAccountInput {
  id: string;
}

export function useAccounts() {
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading, refetch } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      // External API mode: NestJS handles all relational joins server-side
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<any[]>('/api/accounts');
        if (error) throw new Error(error.message);
        // Map camelCase API response to snake_case expected by UI
        return (data || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          master_account_name: a.masterAccountName || a.master_account_name || '',
          cloud_type: a.cloudType || a.cloud_type || 'public',
          status: a.status || 'active',
          created_at: a.createdAt || a.created_at || new Date().toISOString(),
          updated_at: a.updatedAt || a.updated_at || new Date().toISOString(),
          addresses: Array.isArray(a.addresses) ? a.addresses.map((addr: any) => ({
            id: addr.id,
            account_id: addr.accountId || addr.account_id || a.id,
            line1: addr.line1,
            line2: addr.line2 || null,
            city: addr.city,
            state: addr.state,
            country: addr.country,
            postal_code: addr.postalCode || addr.postal_code || '',
            created_at: addr.createdAt || addr.created_at || new Date().toISOString(),
          })) : [],
          technical_users: Array.isArray(a.technical_users) ? a.technical_users : 
            (a.technicalUser ? [{
              id: a.technicalUser.id,
              account_id: a.id,
              first_name: a.technicalUser.firstName,
              middle_name: a.technicalUser.middleName || null,
              last_name: a.technicalUser.lastName,
              email: a.technicalUser.email,
              status: a.technicalUser.status || 'active',
              start_date: a.technicalUser.startDate,
              end_date: a.technicalUser.endDate || null,
              assigned_group: a.technicalUser.assignedGroup,
              assigned_role: a.technicalUser.assignedRole,
              created_at: a.technicalUser.createdAt || new Date().toISOString(),
              updated_at: a.technicalUser.updatedAt || new Date().toISOString(),
            }] : []),
          license_count: a.licenseCount || a.license_count || 0,
          expiring_license_count: a.expiringLicenseCount || a.expiring_license_count || 0,
        })) as AccountWithDetails[];
      }

      const { data: accountsData, error: accountsError } = await supabase
        .from("accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (accountsError) throw accountsError;

      const accountsWithDetails: AccountWithDetails[] = await Promise.all(
        (accountsData || []).map(async (account) => {
          const [addressesResult, technicalUsersResult, licensesResult] = await Promise.all([
            supabase
              .from("account_addresses")
              .select("*")
              .eq("account_id", account.id),
            supabase
              .from("account_technical_users")
              .select("*")
              .eq("account_id", account.id),
            supabase
              .from("account_licenses")
              .select("id, end_date")
              .eq("account_id", account.id),
          ]);

          const licenses = licensesResult.data || [];
          const now = new Date();
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(now.getDate() + 30);

          const expiringCount = licenses.filter((l) => {
            const endDate = new Date(l.end_date);
            return endDate > now && endDate <= thirtyDaysFromNow;
          }).length;

          return {
            ...account,
            addresses: addressesResult.data || [],
            technical_users: technicalUsersResult.data || [],
            license_count: licenses.length,
            expiring_license_count: expiringCount,
          } as AccountWithDetails;
        })
      );

      return accountsWithDetails;
    },
  });

  const createAccount = useMutation({
    mutationFn: async (input: CreateAccountInput) => {
      if (isExternalApi()) {
        // Map snake_case frontend payload to camelCase expected by backend DTO
        const apiPayload: any = {
          name: input.name,
          masterAccountName: input.master_account_name,
          cloudType: input.cloud_type,
          addresses: input.addresses.map(addr => ({
            line1: addr.line1,
            line2: addr.line2,
            city: addr.city,
            state: addr.state,
            postalCode: addr.postal_code,
            country: addr.country,
          })),
          technicalUser: {
            firstName: input.technical_user.first_name,
            middleName: input.technical_user.middle_name,
            lastName: input.technical_user.last_name,
            email: input.technical_user.email,
            assignedRole: input.technical_user.assigned_role,
            assignedGroup: input.technical_user.assigned_group,
            startDate: input.technical_user.start_date,
            endDate: input.technical_user.end_date || undefined,
          },
        };
        const { data, error } = await httpClient.post<Account>('/api/accounts', apiPayload);
        if (error) throw new Error(error.message);
        return data!;
      }

      // Create the account
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .insert({
          name: input.name,
          master_account_name: input.master_account_name,
          cloud_type: input.cloud_type,
        })
        .select()
        .single();

      if (accountError) throw accountError;

      // Create addresses
      const addressesToInsert = input.addresses.map((addr) => ({
        account_id: account.id,
        line1: addr.line1,
        line2: addr.line2 || null,
        city: addr.city,
        state: addr.state,
        country: addr.country,
        postal_code: addr.postal_code,
      }));

      const { error: addressError } = await supabase
        .from("account_addresses")
        .insert(addressesToInsert);

      if (addressError) throw addressError;

      // Create technical user (automatically marked as technical user since created from Accounts)
      const { data: technicalUser, error: userError } = await supabase
        .from("account_technical_users")
        .insert({
          account_id: account.id,
          first_name: input.technical_user.first_name,
          middle_name: input.technical_user.middle_name || null,
          last_name: input.technical_user.last_name,
          email: input.technical_user.email,
          status: input.technical_user.status,
          start_date: input.technical_user.start_date,
          end_date: input.technical_user.end_date || null,
          assigned_group: input.technical_user.assigned_group,
          assigned_role: input.technical_user.assigned_role,
          is_technical_user: true,
        })
        .select()
        .single();

      if (userError) throw userError;

      // Look up the group by name to get its ID and create user_groups assignment
      if (input.technical_user.assigned_group && technicalUser) {
        const { data: groupData } = await supabase
          .from("groups")
          .select("id")
          .eq("name", input.technical_user.assigned_group)
          .maybeSingle();

        if (groupData) {
          // Insert into user_groups junction table for proper role inheritance
          await supabase
            .from("user_groups")
            .insert({
              user_id: technicalUser.id,
              group_id: groupData.id,
            });
        }
      }

      return account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({
        title: "Account Created",
        description: "The account has been created successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const updateAccount = useMutation({
    mutationFn: async (input: UpdateAccountInput) => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.put<Account>(`/api/accounts/${input.id}`, input);
        if (error) throw new Error(error.message);
        return input.id;
      }

      // Update the account
      const { error: accountError } = await supabase
        .from("accounts")
        .update({
          name: input.name,
          master_account_name: input.master_account_name,
          cloud_type: input.cloud_type,
        })
        .eq("id", input.id);

      if (accountError) throw accountError;

      // Delete existing addresses and recreate
      await supabase.from("account_addresses").delete().eq("account_id", input.id);

      const addressesToInsert = input.addresses.map((addr) => ({
        account_id: input.id,
        line1: addr.line1,
        line2: addr.line2 || null,
        city: addr.city,
        state: addr.state,
        country: addr.country,
        postal_code: addr.postal_code,
      }));

      const { error: addressError } = await supabase
        .from("account_addresses")
        .insert(addressesToInsert);

      if (addressError) throw addressError;

      // Get existing technical users to clean up their user_groups entries
      const { data: existingUsers } = await supabase
        .from("account_technical_users")
        .select("id")
        .eq("account_id", input.id);

      // Delete user_groups entries for existing technical users
      if (existingUsers && existingUsers.length > 0) {
        const userIds = existingUsers.map((u) => u.id);
        await supabase.from("user_groups").delete().in("user_id", userIds);
      }

      // Delete existing technical users and recreate (preserve is_technical_user flag)
      await supabase.from("account_technical_users").delete().eq("account_id", input.id);

      const { data: newUser, error: userError } = await supabase
        .from("account_technical_users")
        .insert({
          account_id: input.id,
          first_name: input.technical_user.first_name,
          middle_name: input.technical_user.middle_name || null,
          last_name: input.technical_user.last_name,
          email: input.technical_user.email,
          status: input.technical_user.status,
          start_date: input.technical_user.start_date,
          end_date: input.technical_user.end_date || null,
          assigned_group: input.technical_user.assigned_group,
          assigned_role: input.technical_user.assigned_role,
          is_technical_user: true,
        })
        .select()
        .single();

      if (userError) throw userError;

      // Look up the group by name and create user_groups assignment
      if (input.technical_user.assigned_group && newUser) {
        const { data: groupData } = await supabase
          .from("groups")
          .select("id")
          .eq("name", input.technical_user.assigned_group)
          .maybeSingle();

        if (groupData) {
          await supabase
            .from("user_groups")
            .insert({
              user_id: newUser.id,
              group_id: groupData.id,
            });
        }
      }

      return input.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({
        title: "Account Updated",
        description: "The account has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account",
        variant: "destructive",
      });
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (accountId: string) => {
      if (isExternalApi()) {
        const { error } = await httpClient.delete(`/api/accounts/${accountId}`);
        if (error) throw new Error(error.message);
        return accountId;
      }

      const { error } = await supabase.from("accounts").delete().eq("id", accountId);
      if (error) throw error;
      return accountId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      toast({
        title: "Account Deleted",
        description: "The account has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    },
  });

  return {
    accounts,
    isLoading,
    refetch,
    createAccount,
    updateAccount,
    deleteAccount,
  };
}
