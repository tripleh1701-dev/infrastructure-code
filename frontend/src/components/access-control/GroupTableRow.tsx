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
  Layers,
  Package,
  Server,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Group } from "@/hooks/useGroups";

interface GroupTableRowProps {
  group: Group;
  index: number;
  onEdit: (group: Group) => void;
  onDelete: (group: Group) => void;
}

const memberColors = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-rose-500",
];

export function GroupTableRow({ group, index, onEdit, onDelete }: GroupTableRowProps) {
  return (
    <>
      <motion.tr
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        className="border-b border-slate-100 hover:bg-blue-50/30 transition-colors group"
      >
        {/* Group Name & Description */}
        <td className="px-5 py-4">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md"
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <Users className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <p className="font-semibold text-slate-800">{group.name}</p>
              <p className="text-xs text-slate-500 line-clamp-1 max-w-[200px]">
                {group.description || "No description"}
              </p>
            </div>
          </div>
        </td>

        {/* Workstream */}
        <td className="px-5 py-4">
          {group.workstreamName ? (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
            >
              <Layers className="w-3 h-3" />
              {group.workstreamName}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>

        {/* Product */}
        <td className="px-5 py-4">
          {group.productName ? (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
            >
              <Package className="w-3 h-3" />
              {group.productName}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>

        {/* Service */}
        <td className="px-5 py-4">
          {group.serviceName ? (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            >
              <Server className="w-3 h-3" />
              {group.serviceName}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>

        {/* Roles */}
        <td className="px-5 py-4">
          {group.roles.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {group.roles.slice(0, 2).map((role) => (
                <Tooltip key={role.roleId}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                      <Shield className="w-3 h-3" />
                      {role.roleName}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{role.roleName}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
              {group.roles.length > 2 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 cursor-default">
                      +{group.roles.length - 2}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      {group.roles.slice(2).map((role) => (
                        <div key={role.roleId} className="text-sm">
                          {role.roleName}
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          )}
        </td>

        {/* Users */}
        <td className="px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {Array.from({ length: Math.min(group.memberCount || 0, 3) }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-bold shadow-sm",
                    memberColors[i % memberColors.length]
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span className="text-sm text-slate-600">
              {group.memberCount || 0}
            </span>
          </div>
        </td>

        {/* Actions */}
        <td className="px-5 py-4">
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
              <DropdownMenuItem onClick={() => onEdit(group)} className="rounded-lg">
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(group)}
                className="text-destructive focus:text-destructive rounded-lg"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </motion.tr>
    </>
  );
}
