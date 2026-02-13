import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Shield, Eye, Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRolePermissions, RolePermission } from "@/hooks/useRolePermissions";
import { GroupRole } from "@/hooks/useGroups";

interface GroupRolesPermissionsDisplayProps {
  roles: GroupRole[];
  className?: string;
}

function RolePermissionBadges({ permissions }: { permissions: RolePermission[] }) {
  const visiblePermissions = permissions.filter(p => p.isVisible);
  
  if (visiblePermissions.length === 0) {
    return <span className="text-xs text-muted-foreground">No permissions configured</span>;
  }

  const displayCount = 3;
  const shownPermissions = visiblePermissions.slice(0, displayCount);
  const remainingCount = visiblePermissions.length - displayCount;

  return (
    <div className="flex flex-wrap gap-1.5">
      {shownPermissions.map((perm) => (
        <Badge
          key={perm.id}
          variant="secondary"
          className="text-xs px-2 py-0.5 bg-primary/10 text-primary border-0"
        >
          {perm.menuLabel}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className="text-xs px-2 py-0.5">
          +{remainingCount} more
        </Badge>
      )}
    </div>
  );
}

function RolePermissionsExpanded({ permissions }: { permissions: RolePermission[] }) {
  const visiblePermissions = permissions.filter(p => p.isVisible);

  if (visiblePermissions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        No permissions configured for this role
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {visiblePermissions.map((perm) => (
        <div
          key={perm.id}
          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
        >
          <span className="font-medium text-sm">{perm.menuLabel}</span>
          <div className="flex items-center gap-1.5">
            {perm.canView && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 gap-1 text-xs">
                <Eye className="w-3 h-3" /> View
              </Badge>
            )}
            {perm.canCreate && (
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 gap-1 text-xs">
                <Plus className="w-3 h-3" /> Create
              </Badge>
            )}
            {perm.canEdit && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 gap-1 text-xs">
                <Pencil className="w-3 h-3" /> Edit
              </Badge>
            )}
            {perm.canDelete && (
              <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 gap-1 text-xs">
                <Trash2 className="w-3 h-3" /> Delete
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoleCard({ role }: { role: GroupRole }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: permissions = [], isLoading } = useRolePermissions(role.roleId);

  return (
    <motion.div
      className="border rounded-xl overflow-hidden bg-background"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{role.roleName}</p>
            {role.roleDescription && (
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {role.roleDescription}
              </p>
            )}
            {!isExpanded && !isLoading && (
              <div className="mt-1.5">
                <RolePermissionBadges permissions={permissions} />
              </div>
            )}
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t pt-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : (
                <RolePermissionsExpanded permissions={permissions} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function GroupRolesPermissionsDisplay({ roles, className }: GroupRolesPermissionsDisplayProps) {
  if (roles.length === 0) {
    return (
      <div className={cn("text-center py-6 text-muted-foreground", className)}>
        <Shield className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No roles assigned to this group</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-medium">Roles & Permissions in this Group</h4>
        <Badge variant="secondary" className="text-xs">
          {roles.length} role{roles.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      <div className="space-y-2">
        {roles.map((role) => (
          <RoleCard key={role.roleId} role={role} />
        ))}
      </div>
    </div>
  );
}
