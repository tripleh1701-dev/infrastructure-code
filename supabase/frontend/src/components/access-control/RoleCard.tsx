import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Shield,
  Users,
  Key,
  Eye,
  Layers,
  Package,
  Server,
  FolderTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Role } from "@/hooks/useRoles";
import { RoleScopesModal, MenuPermission } from "./RoleScopesModal";
import { useRolePermissions, useUpdateRolePermissions } from "@/hooks/useRolePermissions";
import { toast } from "sonner";

interface RoleCardProps {
  role: Role;
  index: number;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export function RoleCard({ role, index, onEdit, onDelete }: RoleCardProps) {
  const [showScopes, setShowScopes] = useState(false);
  const permissionsQuery = useRolePermissions(role.id);
  const updatePermissionsMutation = useUpdateRolePermissions();
  const permissions = permissionsQuery.data || [];

  // Count total CRUD permissions (canCreate + canView + canEdit + canDelete for each menu)
  const totalPermissionsCount = permissions.reduce((count, p) => {
    return count + 
      (p.canCreate ? 1 : 0) + 
      (p.canView ? 1 : 0) + 
      (p.canEdit ? 1 : 0) + 
      (p.canDelete ? 1 : 0);
  }, 0);

  const handleSavePermissions = async (updatedPermissions: MenuPermission[]) => {
    try {
      await updatePermissionsMutation.mutateAsync({
        roleId: role.id,
        permissions: updatedPermissions.map((p) => ({
          roleId: role.id,
          menuKey: p.menuKey,
          menuLabel: p.menuLabel,
          isVisible: p.isVisible,
          tabs: p.tabs,
          canCreate: p.canCreate,
          canView: p.canView,
          canEdit: p.canEdit,
          canDelete: p.canDelete,
        })),
      });
      toast.success("Role permissions updated successfully");
    } catch (error) {
      console.error("Failed to save permissions:", error);
    }
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        whileHover={{ y: -4, boxShadow: "0 10px 40px rgba(1,113,236,0.15)" }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 25,
          delay: index * 0.05,
        }}
        className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-5 transition-all duration-300 cursor-pointer group shadow-lg flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <motion.div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-200/50"
            whileHover={{ scale: 1.1, rotate: 5 }}
          >
            <Shield className="w-6 h-6 text-white" />
          </motion.div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowScopes(true)}
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all duration-200 rounded-lg"
                >
                  <Eye className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Scopes</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200 rounded-lg"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl shadow-xl border-slate-200">
                <DropdownMenuItem onClick={() => onEdit(role)} className="rounded-lg">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(role)}
                  className="text-destructive focus:text-destructive rounded-lg"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Name & Description */}
        <h3 className="font-semibold text-slate-800 group-hover:text-violet-600 transition-colors">
          {role.name}
        </h3>
        <p className="text-sm text-slate-500 mt-1 line-clamp-2 min-h-[40px]">
          {role.description || "No description"}
        </p>

        {/* Scope Badges */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {role.workstreams && role.workstreams.length > 0 ? (
            <>
              {role.workstreams.slice(0, 2).map((ws) => (
                <Badge
                  key={ws.id}
                  variant="secondary"
                  className="gap-1 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                >
                  <Layers className="w-3 h-3" />
                  {ws.name}
                </Badge>
              ))}
              {role.workstreams.length > 2 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 cursor-default"
                    >
                      +{role.workstreams.length - 2}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-medium text-xs text-muted-foreground mb-1">All Workstreams:</p>
                      <div className="flex flex-wrap gap-1">
                        {role.workstreams.map((ws) => (
                          <span
                            key={ws.id}
                            className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                          >
                            {ws.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          ) : role.workstream?.name ? (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
            >
              <Layers className="w-3 h-3" />
              {role.workstream.name}
            </Badge>
          ) : null}
          {role.product?.name && (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
            >
              <Package className="w-3 h-3" />
              {role.product.name}
            </Badge>
          )}
          {role.service?.name && (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            >
              <Server className="w-3 h-3" />
              {role.service.name}
            </Badge>
          )}
        </div>

        {/* Stats Footer */}
        <div className="flex items-center gap-4 mt-auto pt-4 border-t border-slate-100 text-sm">
          {role.groups && role.groups.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1.5 text-slate-600 cursor-default">
                  <FolderTree className="w-3.5 h-3.5 text-slate-400" />
                  {role.groupCount || 0} groups
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-medium text-xs text-muted-foreground mb-1">Assigned Groups:</p>
                  <div className="flex flex-wrap gap-1">
                    {role.groups.map((group) => (
                      <span
                        key={group.id}
                        className="inline-flex items-center px-2 py-0.5 bg-violet-100 text-violet-700 rounded text-xs"
                      >
                        {group.name}
                      </span>
                    ))}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-600">
              <FolderTree className="w-3.5 h-3.5 text-slate-400" />
              0 groups
            </span>
          )}
          <span className="flex items-center gap-1.5 text-slate-600">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            {role.userCount || 0} users
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <Key className="w-3.5 h-3.5 text-slate-400" />
            {totalPermissionsCount} perms
          </span>
        </div>
      </motion.div>

      {/* Role Scopes Modal - Only render when open to avoid ref composition issues */}
      {showScopes && (
        <RoleScopesModal
          open={showScopes}
          onOpenChange={setShowScopes}
          permissions={permissions.map((p) => ({
            menuKey: p.menuKey,
            menuLabel: p.menuLabel,
            isVisible: p.isVisible,
            tabs: p.tabs,
            canCreate: p.canCreate,
            canView: p.canView,
            canEdit: p.canEdit,
            canDelete: p.canDelete,
          }))}
          onSave={handleSavePermissions}
        />
      )}
    </>
  );
}
