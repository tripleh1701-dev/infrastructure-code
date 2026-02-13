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
  Users,
  MoreHorizontal,
  Pencil,
  Trash2,
  Layers,
  Package,
  Server,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Group } from "@/hooks/useGroups";

interface GroupCardProps {
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

export function GroupCard({ group, index, onEdit, onDelete }: GroupCardProps) {
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
        <div className="flex items-start justify-between mb-3">
          <motion.div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200/50"
            whileHover={{ scale: 1.1, rotate: 5 }}
          >
            <Users className="w-6 h-6 text-white" />
          </motion.div>
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
            <DropdownMenuContent
              align="end"
              className="rounded-xl shadow-xl border-slate-200"
            >
              <DropdownMenuItem
                onClick={() => onEdit(group)}
                className="rounded-lg"
              >
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
        </div>

        {/* Name & Description */}
        <h3 className="font-semibold text-slate-800 group-hover:text-emerald-600 transition-colors">
          {group.name}
        </h3>
        <p className="text-sm text-slate-500 mt-1 line-clamp-2 min-h-[40px]">
          {group.description || "No description"}
        </p>

        {/* Scope Badges */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {group.workstreamName && (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
            >
              <Layers className="w-3 h-3" />
              {group.workstreamName}
            </Badge>
          )}
          {group.productName && (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
            >
              <Package className="w-3 h-3" />
              {group.productName}
            </Badge>
          )}
          {group.serviceName && (
            <Badge
              variant="secondary"
              className="gap-1 text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            >
              <Server className="w-3 h-3" />
              {group.serviceName}
            </Badge>
          )}
        </div>

        {/* Roles Section */}
        {group.roles.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
              Assigned Roles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.roles.slice(0, 3).map((role) => (
                <Tooltip key={role.roleId}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                      <Shield className="w-3 h-3" />
                      {role.roleName}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{role.roleName}</p>
                    {role.roleDescription && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {role.roleDescription}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
              {group.roles.length > 3 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground cursor-default">
                      +{group.roles.length - 3} more
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      {group.roles.slice(3).map((role) => (
                        <div key={role.roleId} className="text-sm">
                          {role.roleName}
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        )}

        {/* Users Footer */}
        <div className="flex items-center gap-3 mt-auto pt-4 border-t border-slate-100">
          <div className="flex -space-x-2">
            {Array.from({ length: Math.min(group.memberCount || 0, 4) }).map(
              (_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-bold shadow-sm",
                    memberColors[i % memberColors.length]
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </motion.div>
              )
            )}
          </div>
          <span className="text-sm text-slate-600">
            {group.memberCount || 0} user
            {(group.memberCount || 0) !== 1 ? "s" : ""}
          </span>
        </div>
      </motion.div>
    </>
  );
}
