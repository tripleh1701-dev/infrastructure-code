import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GroupRole } from "@/hooks/useGroups";

export interface GroupWithRoles {
  groupId: string;
  groupName: string;
  roles: GroupRole[];
}

interface UserGroupRolesDisplayProps {
  // Support both single group (legacy) and multiple groups
  groups?: GroupWithRoles[];
  // Legacy props for single group
  groupName?: string;
  roles: GroupRole[];
  compact?: boolean;
  className?: string;
}

export function UserGroupRolesDisplay({ groups, groupName, roles, compact = false, className }: UserGroupRolesDisplayProps) {
  // If groups array is provided, aggregate all roles from all groups
  const allRoles = groups 
    ? groups.flatMap(g => g.roles)
    : roles;
  
  // Deduplicate roles by roleId
  const uniqueRoles = allRoles.reduce((acc, role) => {
    if (!acc.find(r => r.roleId === role.roleId)) {
      acc.push(role);
    }
    return acc;
  }, [] as GroupRole[]);

  const displayGroups = groups || (groupName ? [{ groupId: '', groupName, roles }] : []);
  const groupCount = displayGroups.length;

  if (uniqueRoles.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground cursor-default">
            No roles
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{groupCount === 1 ? `Group "${displayGroups[0]?.groupName}"` : `${groupCount} groups`} have no roles assigned</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (compact) {
    // Compact inline display with tooltip for table view
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-primary cursor-default hover:underline">
            <Shield className="w-3 h-3" />
            {uniqueRoles.length} role{uniqueRoles.length !== 1 ? 's' : ''}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs p-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Roles from {groupCount === 1 ? `"${displayGroups[0]?.groupName}"` : `${groupCount} groups`}:
            </p>
            {uniqueRoles.map((role) => (
              <div key={role.roleId} className="flex items-center gap-2">
                <Shield className="w-3 h-3 text-primary" />
                <span className="text-sm">{role.roleName}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Compact inline display for tile view - max 2 roles with +N indicator
  const displayCount = 2;
  const shownRoles = uniqueRoles.slice(0, displayCount);
  const remainingCount = uniqueRoles.length - displayCount;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
          <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          {shownRoles.map((role) => (
            <Badge
              key={role.roleId}
              variant="secondary"
              className="text-xs px-2 py-0.5 bg-primary/10 text-primary border-0"
            >
              {role.roleName}
            </Badge>
          ))}
          {remainingCount > 0 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0.5">
              +{remainingCount}
            </Badge>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs p-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Roles from {groupCount === 1 ? `"${displayGroups[0]?.groupName}"` : `${groupCount} groups`}:
          </p>
          {uniqueRoles.map((role) => (
            <div key={role.roleId} className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-primary" />
              <span className="text-sm">{role.roleName}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
