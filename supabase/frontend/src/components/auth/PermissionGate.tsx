import { ReactNode } from "react";
import { usePermissions } from "@/contexts/PermissionContext";
import { motion } from "framer-motion";
import { ShieldX, Lock } from "lucide-react";

interface PermissionGateProps {
  /** The menu key to check access for (e.g., "access-control", "dashboard") */
  menuKey: string;
  /** Optional tab key within the menu to check access for */
  tabKey?: string;
  /** The type of permission to check */
  permission?: "view" | "create" | "edit" | "delete";
  /** Content to show when access is granted */
  children: ReactNode;
  /** Custom fallback component when access is denied */
  fallback?: ReactNode;
  /** Whether to show the default access denied message (default: true) */
  showDeniedMessage?: boolean;
  /** Whether to render nothing when access is denied (default: false) */
  hideWhenDenied?: boolean;
}

/**
 * PermissionGate component for role-based access control.
 * Wraps content and only renders it if the user has the required permissions.
 * 
 * @example
 * // Basic menu access check
 * <PermissionGate menuKey="access-control">
 *   <AccessControlPage />
 * </PermissionGate>
 * 
 * @example
 * // Check specific tab access
 * <PermissionGate menuKey="access-control" tabKey="roles">
 *   <RolesTab />
 * </PermissionGate>
 * 
 * @example
 * // Check specific permission (create, edit, delete)
 * <PermissionGate menuKey="access-control" permission="create">
 *   <AddUserButton />
 * </PermissionGate>
 * 
 * @example
 * // Hide element when no permission (no message)
 * <PermissionGate menuKey="access-control" permission="delete" hideWhenDenied>
 *   <DeleteButton />
 * </PermissionGate>
 */
export function PermissionGate({
  menuKey,
  tabKey,
  permission = "view",
  children,
  fallback,
  showDeniedMessage = true,
  hideWhenDenied = false,
}: PermissionGateProps) {
  const { 
    hasMenuAccess, 
    hasTabAccess, 
    canCreate, 
    canView, 
    canEdit, 
    canDelete,
    isLoading 
  } = usePermissions();

  // While loading, show nothing to prevent flashing
  if (isLoading) {
    return null;
  }

  // Check menu-level visibility first
  if (!hasMenuAccess(menuKey)) {
    if (hideWhenDenied) return null;
    if (fallback) return <>{fallback}</>;
    if (showDeniedMessage) return <AccessDeniedMessage menuKey={menuKey} />;
    return null;
  }

  // Check tab-level visibility if tabKey is provided
  if (tabKey && !hasTabAccess(menuKey, tabKey)) {
    if (hideWhenDenied) return null;
    if (fallback) return <>{fallback}</>;
    if (showDeniedMessage) return <AccessDeniedMessage menuKey={menuKey} tabKey={tabKey} />;
    return null;
  }

  // Check specific permission
  let hasPermission = true;
  switch (permission) {
    case "create":
      hasPermission = canCreate(menuKey);
      break;
    case "view":
      hasPermission = canView(menuKey);
      break;
    case "edit":
      hasPermission = canEdit(menuKey);
      break;
    case "delete":
      hasPermission = canDelete(menuKey);
      break;
  }

  if (!hasPermission) {
    if (hideWhenDenied) return null;
    if (fallback) return <>{fallback}</>;
    if (showDeniedMessage) return <AccessDeniedMessage menuKey={menuKey} permission={permission} />;
    return null;
  }

  return <>{children}</>;
}

interface AccessDeniedMessageProps {
  menuKey: string;
  tabKey?: string;
  permission?: string;
}

function AccessDeniedMessage({ menuKey, tabKey, permission }: AccessDeniedMessageProps) {
  const getTitle = () => {
    if (tabKey) return `Access to ${tabKey} is restricted`;
    if (permission && permission !== "view") return `${permission.charAt(0).toUpperCase() + permission.slice(1)} permission required`;
    return "Access Restricted";
  };

  const getMessage = () => {
    if (tabKey) {
      return `You don't have permission to access the ${tabKey} section of ${menuKey}.`;
    }
    if (permission && permission !== "view") {
      return `You don't have ${permission} permission for ${menuKey}. Contact your administrator if you need access.`;
    }
    return `You don't have permission to access ${menuKey}. Contact your administrator if you need access.`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6"
      >
        <ShieldX className="w-10 h-10 text-red-500 dark:text-red-400" />
      </motion.div>
      
      <motion.h3 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-xl font-semibold text-foreground mb-2"
      >
        {getTitle()}
      </motion.h3>
      
      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground max-w-md"
      >
        {getMessage()}
      </motion.p>
      
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center gap-2 mt-6 text-sm text-muted-foreground"
      >
        <Lock className="w-4 h-4" />
        <span>Role-based access control enforced</span>
      </motion.div>
    </motion.div>
  );
}

/**
 * Hook for checking permissions in component logic
 * Use this when you need to conditionally render or perform actions based on permissions
 */
export function usePermissionCheck(menuKey: string, tabKey?: string) {
  const { 
    hasMenuAccess, 
    hasTabAccess, 
    canCreate, 
    canView, 
    canEdit, 
    canDelete,
    getMenuPermission,
    isLoading 
  } = usePermissions();

  return {
    isLoading,
    hasAccess: hasMenuAccess(menuKey) && (tabKey ? hasTabAccess(menuKey, tabKey) : true),
    hasMenuAccess: hasMenuAccess(menuKey),
    hasTabAccess: tabKey ? hasTabAccess(menuKey, tabKey) : true,
    canCreate: canCreate(menuKey),
    canView: canView(menuKey),
    canEdit: canEdit(menuKey),
    canDelete: canDelete(menuKey),
    permission: getMenuPermission(menuKey),
  };
}
