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
import { Role } from "@/hooks/useRoles";
import { RoleScopesModal, MenuPermission } from "./RoleScopesModal";
import { useRolePermissions, useUpdateRolePermissions } from "@/hooks/useRolePermissions";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface RoleTableRowProps {
  role: Role;
  index: number;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

export function RoleTableRow({ role, index, isSelected, onToggleSelect, onEdit, onDelete }: RoleTableRowProps) {
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
      <motion.tr
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        className={cn(
          "border-b border-slate-100 hover:bg-violet-50/30 transition-colors group",
          isSelected && "bg-violet-50/50"
        )}
      >
        {onToggleSelect && (
          <td className="px-3 py-4 w-10">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(role.id)}
              className="border-slate-300"
            />
          </td>
        )}
        {/* Role Name & Description */}
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-md"
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <Shield className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <p className="font-semibold text-slate-800">{role.name}</p>
              <p className="text-xs text-slate-500 line-clamp-1 max-w-[200px]">
                {role.description || "No description"}
              </p>
            </div>
          </div>
        </td>

        {/* Workstream */}
        <td className="px-5 py-4">
          {role.workstreams && role.workstreams.length > 0 ? (
            <div className="flex flex-wrap gap-1">
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
            </div>
          ) : role.workstream?.name ? (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
            >
              <Layers className="w-3 h-3" />
              {role.workstream.name}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>

        {/* Product */}
        <td className="px-5 py-4">
          {role.product?.name ? (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
            >
              <Package className="w-3 h-3" />
              {role.product.name}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>

        {/* Service */}
        <td className="px-5 py-4">
          {role.service?.name ? (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            >
              <Server className="w-3 h-3" />
              {role.service.name}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>

        {/* Groups */}
        <td className="px-5 py-4">
          {role.groups && role.groups.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-sm text-slate-600 cursor-default">
                  <FolderTree className="w-4 h-4 text-slate-400" />
                  {role.groupCount || 0}
                </div>
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
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <FolderTree className="w-4 h-4 text-slate-400" />
              0
            </div>
          )}
        </td>

        {/* Users */}
        <td className="px-5 py-4">
          <div className="flex items-center gap-1.5 text-sm text-slate-600">
            <Users className="w-4 h-4 text-slate-400" />
            {role.userCount || 0}
          </div>
        </td>

        {/* Permissions */}
        <td className="px-5 py-4">
          <div className="flex items-center gap-1.5 text-sm text-slate-600">
            <Key className="w-4 h-4 text-slate-400" />
            {totalPermissionsCount}
          </div>
        </td>

        {/* Actions */}
        <td className="px-5 py-4">
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowScopes(true)}
                  className="h-8 w-8 text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all"
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
                  className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
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
        </td>
      </motion.tr>

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
