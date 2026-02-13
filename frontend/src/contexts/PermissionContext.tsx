import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";
import { useAccountContext } from "./AccountContext";
import { useEnterpriseContext } from "./EnterpriseContext";
import { useAuth } from "./AuthContext";

export interface PermissionTab {
  key: string;
  label: string;
  isVisible: boolean;
}

export interface MenuPermission {
  menuKey: string;
  menuLabel: string;
  isVisible: boolean;
  tabs: PermissionTab[];
  canCreate: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface PermissionContextType {
  permissions: MenuPermission[];
  isLoading: boolean;
  currentUserRoleId: string | null;
  currentUserRoleName: string | null;
  currentTechnicalUserId: string | null;
  hasMenuAccess: (menuKey: string) => boolean;
  hasTabAccess: (menuKey: string, tabKey: string) => boolean;
  canCreate: (menuKey: string) => boolean;
  canView: (menuKey: string) => boolean;
  canEdit: (menuKey: string) => boolean;
  canDelete: (menuKey: string) => boolean;
  getMenuPermission: (menuKey: string) => MenuPermission | undefined;
  refetchPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

// Default permissions for admin/fallback (all access)
const DEFAULT_ADMIN_PERMISSIONS: MenuPermission[] = [
  { menuKey: "overview", menuLabel: "Overview", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: true, canDelete: true },
  { menuKey: "inbox", menuLabel: "My Inbox", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: true, canDelete: true },
  { menuKey: "dashboard", menuLabel: "Dashboard", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: true, canDelete: true },
  { menuKey: "pipelines", menuLabel: "Pipelines", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: true, canDelete: true },
  { menuKey: "builds", menuLabel: "Builds", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: true, canDelete: true },
  { menuKey: "access-control", menuLabel: "Access Control", isVisible: true, tabs: [
    { key: "users", label: "Users", isVisible: true },
    { key: "groups", label: "Groups", isVisible: true },
    { key: "roles", label: "Roles", isVisible: true },
  ], canCreate: true, canView: true, canEdit: true, canDelete: true },
  { menuKey: "account-settings", menuLabel: "Account Settings", isVisible: true, tabs: [
    { key: "enterprise", label: "Enterprise", isVisible: true },
    { key: "accounts", label: "Accounts", isVisible: true },
    { key: "global-settings", label: "Global Settings", isVisible: true },
  ], canCreate: true, canView: true, canEdit: true, canDelete: true },
  { menuKey: "security", menuLabel: "Security & Governance", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: true, canDelete: true },
  { menuKey: "monitoring", menuLabel: "Monitoring", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: true, canDelete: true },
];

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<MenuPermission[]>(DEFAULT_ADMIN_PERMISSIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [currentUserRoleName, setCurrentUserRoleName] = useState<string | null>(null);
  const [currentTechnicalUserId, setCurrentTechnicalUserId] = useState<string | null>(null);
  
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { user, isAuthenticated } = useAuth();

  // ── External API: fetch permissions from NestJS ────────────────────────────
  const fetchPermissionsExternal = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!isAuthenticated || !user) {
        setPermissions(DEFAULT_ADMIN_PERMISSIONS);
        setCurrentUserRoleId(null);
        setCurrentUserRoleName(null);
        setCurrentTechnicalUserId(null);
        setIsLoading(false);
        return;
      }

      // NestJS endpoint resolves the full permission chain server-side:
      // User → technical_user → user_groups → group_roles → role_permissions
      // Returns merged permissions, role metadata, and technical user ID
      const params: Record<string, string> = {};
      if (selectedAccount?.id) params.accountId = selectedAccount.id;
      if (selectedEnterprise?.id) params.enterpriseId = selectedEnterprise.id;

      const { data, error } = await httpClient.get<{
        permissions: MenuPermission[];
        roleId: string | null;
        roleName: string | null;
        technicalUserId: string | null;
      }>("/api/users/me/permissions", { params });

      if (error) {
        console.error("Error fetching permissions from API:", error);
        setPermissions(DEFAULT_ADMIN_PERMISSIONS);
        setCurrentUserRoleId(null);
        setCurrentUserRoleName(null);
        setCurrentTechnicalUserId(null);
        setIsLoading(false);
        return;
      }

      if (data) {
        const perms = Array.isArray(data.permissions) ? data.permissions : [];
        setPermissions(perms.length > 0 ? perms : DEFAULT_ADMIN_PERMISSIONS);
        setCurrentUserRoleId(data.roleId ?? null);
        setCurrentUserRoleName(data.roleName ?? null);
        setCurrentTechnicalUserId(data.technicalUserId ?? null);
      }
    } catch (error) {
      console.error("Error fetching permissions from API:", error);
      setPermissions(DEFAULT_ADMIN_PERMISSIONS);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, selectedAccount?.id, selectedEnterprise?.id]);

  // ── Supabase: existing permission chain resolution ─────────────────────────
  const fetchPermissionsSupabase = useCallback(async () => {
    setIsLoading(true);
    
    try {
      if (!isAuthenticated || !user) {
        setPermissions(DEFAULT_ADMIN_PERMISSIONS);
        setCurrentUserRoleId(null);
        setCurrentUserRoleName(null);
        setCurrentTechnicalUserId(null);
        setIsLoading(false);
        return;
      }

      const userEmail = user.email;

      if (!userEmail) {
        setPermissions(DEFAULT_ADMIN_PERMISSIONS);
        setCurrentUserRoleId(null);
        setCurrentUserRoleName(null);
        setCurrentTechnicalUserId(null);
        setIsLoading(false);
        return;
      }

      // Find the technical user record matching the authenticated user's email
      let userQuery = supabase
        .from("account_technical_users")
        .select("id, assigned_role, email, account_id")
        .eq("email", userEmail)
        .eq("status", "active");

      if (selectedAccount?.id) {
        userQuery = userQuery.eq("account_id", selectedAccount.id);
      }

      let { data: users, error: userError } = await userQuery.limit(1);

      // If no user found in selected account, try any account (for cross-account users)
      if ((!users || users.length === 0) && selectedAccount?.id) {
        const { data: anyUsers, error: anyError } = await supabase
          .from("account_technical_users")
          .select("id, assigned_role, email, account_id")
          .eq("email", userEmail)
          .eq("status", "active")
          .limit(1);
        
        if (!anyError && anyUsers && anyUsers.length > 0) {
          users = anyUsers;
          userError = null;
        }
      }

      if (userError || !users || users.length === 0) {
        console.log("No technical user found for:", userEmail);
        setPermissions(DEFAULT_ADMIN_PERMISSIONS);
        setCurrentUserRoleId(null);
        setCurrentUserRoleName(null);
        setCurrentTechnicalUserId(null);
        setIsLoading(false);
        return;
      }

      const currentUser = users[0];
      setCurrentTechnicalUserId(currentUser.id);

      // Get all groups the user belongs to via user_groups junction table
      const { data: userGroupsData, error: userGroupsError } = await supabase
        .from("user_groups")
        .select("group_id")
        .eq("user_id", currentUser.id);

      if (userGroupsError) {
        console.error("Error fetching user groups:", userGroupsError);
      }

      const groupIds = (userGroupsData || []).map((ug) => ug.group_id);

      // Get all roles from the user's groups via group_roles junction table
      let roleIds: string[] = [];
      if (groupIds.length > 0) {
        const { data: groupRolesData, error: groupRolesError } = await supabase
          .from("group_roles")
          .select("role_id")
          .in("group_id", groupIds);

        if (groupRolesError) {
          console.error("Error fetching group roles:", groupRolesError);
        }

        roleIds = [...new Set((groupRolesData || []).map((gr) => gr.role_id))];
      }

      // If no roles found via groups, fall back to assigned_role (legacy support)
      if (roleIds.length === 0) {
        const roleName = currentUser.assigned_role;
        
        const { data: roles } = await supabase
          .from("roles")
          .select("id, name")
          .eq("name", roleName)
          .limit(1);

        if (roles && roles.length > 0) {
          roleIds = [roles[0].id];
          setCurrentUserRoleId(roles[0].id);
          setCurrentUserRoleName(roles[0].name);
        }
      } else {
        const { data: rolesData } = await supabase
          .from("roles")
          .select("id, name")
          .in("id", roleIds);

        if (rolesData && rolesData.length > 0) {
          setCurrentUserRoleId(rolesData[0].id);
          setCurrentUserRoleName(rolesData.map((r) => r.name).join(", "));
        }
      }

      // If still no roles, use admin permissions
      if (roleIds.length === 0) {
        setPermissions(DEFAULT_ADMIN_PERMISSIONS);
        setCurrentUserRoleId(null);
        setCurrentUserRoleName(null);
        setIsLoading(false);
        return;
      }

      // Fetch permissions for ALL roles and merge them
      const { data: rolePermissions, error: permError } = await supabase
        .from("role_permissions")
        .select("*")
        .in("role_id", roleIds);

      if (permError || !rolePermissions || rolePermissions.length === 0) {
        setPermissions(DEFAULT_ADMIN_PERMISSIONS);
        setIsLoading(false);
        return;
      }

      // Merge permissions from all roles (union of permissions)
      const permissionsMap: Record<string, MenuPermission> = {};

      rolePermissions.forEach((p) => {
        const existing = permissionsMap[p.menu_key];
        const tabs = (p.tabs as unknown as PermissionTab[]) || [];

        if (!existing) {
          permissionsMap[p.menu_key] = {
            menuKey: p.menu_key,
            menuLabel: p.menu_label,
            isVisible: p.is_visible ?? false,
            tabs: tabs,
            canCreate: p.can_create ?? false,
            canView: p.can_view ?? false,
            canEdit: p.can_edit ?? false,
            canDelete: p.can_delete ?? false,
          };
        } else {
          existing.isVisible = existing.isVisible || (p.is_visible ?? false);
          existing.canCreate = existing.canCreate || (p.can_create ?? false);
          existing.canView = existing.canView || (p.can_view ?? false);
          existing.canEdit = existing.canEdit || (p.can_edit ?? false);
          existing.canDelete = existing.canDelete || (p.can_delete ?? false);

          tabs.forEach((tab) => {
            const existingTab = existing.tabs.find((t) => t.key === tab.key);
            if (!existingTab) {
              existing.tabs.push(tab);
            } else if (tab.isVisible) {
              existingTab.isVisible = true;
            }
          });
        }
      });

      setPermissions(Object.values(permissionsMap));
    } catch (error) {
      console.error("Error fetching permissions:", error);
      setPermissions(DEFAULT_ADMIN_PERMISSIONS);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated, selectedAccount?.id, selectedEnterprise?.id]);

  // ── Unified dispatcher ─────────────────────────────────────────────────────
  const fetchCurrentUserPermissions = useCallback(async () => {
    if (isExternalApi()) {
      return fetchPermissionsExternal();
    }
    return fetchPermissionsSupabase();
  }, [fetchPermissionsExternal, fetchPermissionsSupabase]);

  useEffect(() => {
    fetchCurrentUserPermissions();
  }, [fetchCurrentUserPermissions]);

  const contextValue = useMemo(() => {
    const hasMenuAccess = (menuKey: string): boolean => {
      const perm = permissions.find((p) => p.menuKey === menuKey);
      return perm?.isVisible ?? false;
    };

    const hasTabAccess = (menuKey: string, tabKey: string): boolean => {
      const perm = permissions.find((p) => p.menuKey === menuKey);
      if (!perm?.isVisible) return false;
      
      const tab = perm.tabs.find((t) => t.key === tabKey);
      return tab?.isVisible ?? true;
    };

    const canCreate = (menuKey: string): boolean => {
      const perm = permissions.find((p) => p.menuKey === menuKey);
      return perm?.canCreate ?? false;
    };

    const canView = (menuKey: string): boolean => {
      const perm = permissions.find((p) => p.menuKey === menuKey);
      return perm?.canView ?? false;
    };

    const canEdit = (menuKey: string): boolean => {
      const perm = permissions.find((p) => p.menuKey === menuKey);
      return perm?.canEdit ?? false;
    };

    const canDelete = (menuKey: string): boolean => {
      const perm = permissions.find((p) => p.menuKey === menuKey);
      return perm?.canDelete ?? false;
    };

    const getMenuPermission = (menuKey: string): MenuPermission | undefined => {
      return permissions.find((p) => p.menuKey === menuKey);
    };

    return {
      permissions,
      isLoading,
      currentUserRoleId,
      currentUserRoleName,
      currentTechnicalUserId,
      hasMenuAccess,
      hasTabAccess,
      canCreate,
      canView,
      canEdit,
      canDelete,
      getMenuPermission,
      refetchPermissions: fetchCurrentUserPermissions,
    };
  }, [permissions, isLoading, currentUserRoleId, currentUserRoleName, currentTechnicalUserId, fetchCurrentUserPermissions]);

  return (
    <PermissionContext.Provider value={contextValue}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermissions must be used within a PermissionProvider");
  }
  return context;
}
