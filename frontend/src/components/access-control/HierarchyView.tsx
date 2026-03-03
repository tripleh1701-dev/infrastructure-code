import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Shield, UserPlus, ChevronDown, ChevronRight,
  Network, User, ArrowRight, Layers, Search, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AccessControlUser } from "@/hooks/useAccessControlUsers";
import { Group } from "@/hooks/useGroups";
import { Role } from "@/hooks/useRoles";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface HierarchyViewProps {
  users: AccessControlUser[];
  groups: Group[];
  roles: Role[];
  isLoading: boolean;
}

// ─── Colour helpers ────────────────────────────────────────
const roleColor = "from-violet-500 to-purple-600";
const groupColor = "from-blue-500 to-cyan-600";
const userColor = "from-emerald-500 to-teal-600";

// ─── Expandable node ───────────────────────────────────────
function ExpandableNode({
  icon: Icon,
  label,
  count,
  gradient,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  label: string;
  count?: number;
  gradient: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full group"
      >
        <div
          className={cn(
            "w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md",
            gradient,
          )}
        >
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm text-foreground truncate">
          {label}
        </span>
        {count !== undefined && (
          <Badge variant="secondary" className="ml-auto mr-2 text-xs tabular-nums">
            {count}
          </Badge>
        )}
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="ml-[18px] pl-6 border-l-2 border-dashed border-muted-foreground/20 mt-2 space-y-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LeafNode({
  icon: Icon,
  label,
  sublabel,
  gradient,
}: {
  icon: React.ElementType;
  label: string;
  sublabel?: string;
  gradient: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div
        className={cn(
          "w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm",
          gradient,
        )}
      >
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        {sublabel && (
          <p className="text-xs text-muted-foreground truncate">{sublabel}</p>
        )}
      </div>
    </div>
  );
}

// ─── Role → Group → User (top-down) ───────────────────────
function RoleDownView({
  roles,
  groups,
  users,
}: {
  roles: Role[];
  groups: Group[];
  users: AccessControlUser[];
}) {
  const groupMap = useMemo(() => {
    const m = new Map<string, Group>();
    groups.forEach((g) => m.set(g.id, g));
    return m;
  }, [groups]);

  const usersByGroup = useMemo(() => {
    const m = new Map<string, AccessControlUser[]>();
    users.forEach((u) => {
      (u.groups || []).forEach((ug) => {
        const list = m.get(ug.groupId) || [];
        list.push(u);
        m.set(ug.groupId, list);
      });
    });
    return m;
  }, [users]);

  // Build role → groups mapping from group.roles
  const groupsByRole = useMemo(() => {
    const m = new Map<string, Group[]>();
    groups.forEach((g) => {
      (g.roles || []).forEach((r) => {
        const list = m.get(r.roleId) || [];
        list.push(g);
        m.set(r.roleId, list);
      });
    });
    return m;
  }, [groups]);

  if (roles.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>No roles found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {roles.map((role) => {
        const linkedGroups = groupsByRole.get(role.id) || [];
        return (
          <motion.div
            key={role.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-4 shadow-sm"
          >
            <ExpandableNode
              icon={Shield}
              label={role.name}
              count={linkedGroups.length}
              gradient={roleColor}
              defaultOpen={linkedGroups.length <= 5}
            >
              {linkedGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">No groups assigned</p>
              ) : (
                linkedGroups.map((group) => {
                  const members = usersByGroup.get(group.id) || [];
                  return (
                    <ExpandableNode
                      key={group.id}
                      icon={UserPlus}
                      label={group.name}
                      count={members.length}
                      gradient={groupColor}
                    >
                      {members.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">No members</p>
                      ) : (
                        members.map((u) => (
                          <LeafNode
                            key={u.id}
                            icon={User}
                            label={`${u.firstName} ${u.lastName}`}
                            sublabel={u.email}
                            gradient={userColor}
                          />
                        ))
                      )}
                    </ExpandableNode>
                  );
                })
              )}
            </ExpandableNode>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── User → Group → Role (bottom-up) ──────────────────────
function UserUpView({
  roles,
  groups,
  users,
}: {
  roles: Role[];
  groups: Group[];
  users: AccessControlUser[];
}) {
  const groupMap = useMemo(() => {
    const m = new Map<string, Group>();
    groups.forEach((g) => m.set(g.id, g));
    return m;
  }, [groups]);

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p>No users found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {users.map((user) => {
        const userGroups = user.groups || [];
        return (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl p-4 shadow-sm"
          >
            <ExpandableNode
              icon={User}
              label={`${user.firstName} ${user.lastName}`}
              count={userGroups.length}
              gradient={userColor}
              defaultOpen={userGroups.length <= 5}
            >
              {userGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-1">No groups assigned</p>
              ) : (
                userGroups.map((ug) => {
                  const group = groupMap.get(ug.groupId);
                  const groupRoles = group?.roles || [];
                  return (
                    <ExpandableNode
                      key={ug.id}
                      icon={UserPlus}
                      label={ug.groupName}
                      count={groupRoles.length}
                      gradient={groupColor}
                    >
                      {groupRoles.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">No roles linked</p>
                      ) : (
                        groupRoles.map((r) => (
                          <LeafNode
                            key={r.roleId}
                            icon={Shield}
                            label={r.roleName}
                            sublabel={r.roleDescription || undefined}
                            gradient={roleColor}
                          />
                        ))
                      )}
                    </ExpandableNode>
                  );
                })
              )}
            </ExpandableNode>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── Summary stats bar ─────────────────────────────────────
function StatsBar({ users, groups, roles }: { users: AccessControlUser[]; groups: Group[]; roles: Role[] }) {
  const stats = [
    { icon: User, label: "Users", value: users.length, gradient: userColor },
    { icon: UserPlus, label: "Groups", value: groups.length, gradient: groupColor },
    { icon: Shield, label: "Roles", value: roles.length, gradient: roleColor },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-sm"
        >
          <div
            className={cn(
              "w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md",
              s.gradient,
            )}
          >
            <s.icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground tabular-nums">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SVG connection lines overlay ──────────────────────────
function ConnectionLines({
  containerRef,
  nodeRefs,
  userGroupEdges,
  groupRoleEdges,
  highlighted,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  nodeRefs: React.RefObject<Map<string, HTMLDivElement>>;
  userGroupEdges: { userId: string; groupId: string }[];
  groupRoleEdges: { groupId: string; roleId: string }[];
  highlighted: { userIds: Set<string>; groupIds: Set<string>; roleIds: Set<string> } | null;
}) {
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number; color: string; active: boolean }[]>([]);

  const computeLines = useCallback(() => {
    const container = containerRef.current;
    const refs = nodeRefs.current;
    if (!container || !refs) return;

    const cRect = container.getBoundingClientRect();
    const newLines: typeof lines = [];

    const getCenter = (id: string) => {
      const el = refs.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - cRect.left, y: r.top + r.height / 2 - cRect.top, right: r.right - cRect.left, left: r.left - cRect.left };
    };

    // User → Group lines
    userGroupEdges.forEach((e) => {
      const u = getCenter(`user-${e.userId}`);
      const g = getCenter(`group-${e.groupId}`);
      if (!u || !g) return;
      const active = !highlighted || (highlighted.userIds.has(e.userId) && highlighted.groupIds.has(e.groupId));
      newLines.push({ x1: u.right, y1: u.y, x2: g.left, y2: g.y, color: "hsl(var(--primary))", active });
    });

    // Group → Role lines
    groupRoleEdges.forEach((e) => {
      const g = getCenter(`group-${e.groupId}`);
      const r = getCenter(`role-${e.roleId}`);
      if (!g || !r) return;
      const active = !highlighted || (highlighted.groupIds.has(e.groupId) && highlighted.roleIds.has(e.roleId));
      newLines.push({ x1: g.right, y1: g.y, x2: r.left, y2: r.y, color: "hsl(var(--primary))", active });
    });

    setLines(newLines);
  }, [containerRef, nodeRefs, userGroupEdges, groupRoleEdges, highlighted]);

  useEffect(() => {
    computeLines();
    window.addEventListener("resize", computeLines);
    return () => window.removeEventListener("resize", computeLines);
  }, [computeLines]);

  // Recompute after a short delay to let layout settle
  useEffect(() => {
    const timer = setTimeout(computeLines, 100);
    return () => clearTimeout(timer);
  }, [computeLines]);

  if (lines.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="line-gradient-ug" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(152, 60%, 50%)" />
          <stop offset="100%" stopColor="hsl(210, 80%, 55%)" />
        </linearGradient>
        <linearGradient id="line-gradient-gr" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(210, 80%, 55%)" />
          <stop offset="100%" stopColor="hsl(270, 60%, 55%)" />
        </linearGradient>
      </defs>
      {lines.map((l, i) => {
        const isUG = i < userGroupEdges.length;
        const dx = l.x2 - l.x1;
        const cp = dx * 0.4;
        const path = `M ${l.x1} ${l.y1} C ${l.x1 + cp} ${l.y1}, ${l.x2 - cp} ${l.y2}, ${l.x2} ${l.y2}`;
        // Approximate cubic bezier length
        const approxLen = Math.sqrt(dx * dx + (l.y2 - l.y1) ** 2) * 1.2;
        return (
          <g key={i}>
            {/* Glow layer for active lines */}
            {l.active && (
              <path
                d={path}
                fill="none"
                stroke={`url(#${isUG ? "line-gradient-ug" : "line-gradient-gr"})`}
                strokeWidth={6}
                opacity={0.15}
                strokeLinecap="round"
                strokeDasharray={approxLen}
                strokeDashoffset={approxLen}
                style={{
                  animation: `drawLine 0.6s ease-out ${i * 0.08}s forwards`,
                }}
              />
            )}
            <path
              d={path}
              fill="none"
              stroke={`url(#${isUG ? "line-gradient-ug" : "line-gradient-gr"})`}
              strokeWidth={l.active ? 2.5 : 1}
              opacity={l.active ? 0.8 : 0.1}
              strokeLinecap="round"
              strokeDasharray={l.active ? approxLen : "none"}
              strokeDashoffset={l.active ? approxLen : 0}
              style={l.active ? {
                animation: `drawLine 0.5s ease-out ${i * 0.08}s forwards`,
              } : undefined}
              className={l.active ? "" : "transition-opacity duration-300"}
            />
            {/* Animated dot traveling along active lines */}
            {l.active && (
              <circle r="3" fill={isUG ? "hsl(152, 60%, 50%)" : "hsl(270, 60%, 55%)"} opacity="0.9">
                <animateMotion
                  dur="1.5s"
                  repeatCount="indefinite"
                  begin={`${i * 0.08}s`}
                  path={path}
                />
              </circle>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Flow diagram (horizontal lanes) with click-to-highlight ──
function FlowDiagram({ users, groups, roles }: { users: AccessControlUser[]; groups: Group[]; roles: Role[] }) {
  const [selection, setSelection] = useState<{ type: "user" | "group" | "role"; id: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setNodeRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) {
      nodeRefs.current.set(key, el);
    } else {
      nodeRefs.current.delete(key);
    }
  }, []);

  const q = searchQuery.toLowerCase().trim();

  // Filter items by search query
  const filteredUsers = useMemo(() => {
    const list = q
      ? users.filter((u) => `${u.firstName} ${u.middleName || ''} ${u.lastName} ${u.email}`.toLowerCase().includes(q))
      : users;
    return list.slice(0, 8);
  }, [users, q]);

  const filteredGroups = useMemo(() => {
    const list = q
      ? groups.filter((g) => g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q))
      : groups;
    return list.slice(0, 6);
  }, [groups, q]);

  const filteredRoles = useMemo(() => {
    const list = q
      ? roles.filter((r) => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
      : roles;
    return list.slice(0, 6);
  }, [roles, q]);

  const totalFiltered = filteredUsers.length + filteredGroups.length + filteredRoles.length;

  // Build relationship maps
  const userGroupEdges = useMemo(() => {
    const edges: { userId: string; groupId: string }[] = [];
    users.forEach((u) => {
      (u.groups || []).forEach((g) => edges.push({ userId: u.id, groupId: g.groupId }));
    });
    return edges;
  }, [users]);

  const groupRoleEdges = useMemo(() => {
    const edges: { groupId: string; roleId: string }[] = [];
    groups.forEach((g) => {
      (g.roles || []).forEach((r) => edges.push({ groupId: g.id, roleId: r.roleId }));
    });
    return edges;
  }, [groups]);

  const visibleUserIds = new Set(filteredUsers.map((u) => u.id));
  const visibleGroupIds = new Set(filteredGroups.map((g) => g.id));
  const visibleRoleIds = new Set(filteredRoles.map((r) => r.id));

  const visibleUGEdges = useMemo(
    () => userGroupEdges.filter((e) => visibleUserIds.has(e.userId) && visibleGroupIds.has(e.groupId)),
    [userGroupEdges, visibleUserIds, visibleGroupIds],
  );
  const visibleGREdges = useMemo(
    () => groupRoleEdges.filter((e) => visibleGroupIds.has(e.groupId) && visibleRoleIds.has(e.roleId)),
    [groupRoleEdges, visibleGroupIds, visibleRoleIds],
  );

  // Compute highlighted IDs based on selection
  const highlighted = useMemo(() => {
    const userIds = new Set<string>();
    const groupIds = new Set<string>();
    const roleIds = new Set<string>();

    if (!selection) return null;

    if (selection.type === "user") {
      userIds.add(selection.id);
      userGroupEdges.filter((e) => e.userId === selection.id).forEach((e) => groupIds.add(e.groupId));
      groupRoleEdges.filter((e) => groupIds.has(e.groupId)).forEach((e) => roleIds.add(e.roleId));
    } else if (selection.type === "group") {
      groupIds.add(selection.id);
      userGroupEdges.filter((e) => e.groupId === selection.id).forEach((e) => userIds.add(e.userId));
      groupRoleEdges.filter((e) => e.groupId === selection.id).forEach((e) => roleIds.add(e.roleId));
    } else if (selection.type === "role") {
      roleIds.add(selection.id);
      groupRoleEdges.filter((e) => e.roleId === selection.id).forEach((e) => groupIds.add(e.groupId));
      userGroupEdges.filter((e) => groupIds.has(e.groupId)).forEach((e) => userIds.add(e.userId));
    }

    return { userIds, groupIds, roleIds };
  }, [selection, userGroupEdges, groupRoleEdges]);

  const isHighlighted = (type: "user" | "group" | "role", id: string) => {
    if (!highlighted) return true;
    if (type === "user") return highlighted.userIds.has(id);
    if (type === "group") return highlighted.groupIds.has(id);
    return highlighted.roleIds.has(id);
  };

  const handleClick = (type: "user" | "group" | "role", id: string) => {
    if (selection?.type === type && selection?.id === id) {
      setSelection(null);
    } else {
      setSelection({ type, id });
    }
  };

  const itemClasses = (type: "user" | "group" | "role", id: string) =>
    cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg text-xs cursor-pointer transition-all duration-200 relative z-10",
      isHighlighted(type, id)
        ? "bg-muted/50 ring-2 ring-primary/30 shadow-sm"
        : "bg-muted/20 opacity-30",
      selection?.type === type && selection?.id === id && "ring-2 ring-primary shadow-md scale-[1.02]",
    );

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-x-auto relative" ref={containerRef}>
      {/* Search input */}
      <div className="relative mb-4 z-10">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users, groups, or roles…"
          className="pl-9 pr-9 h-9 text-sm bg-muted/30 border-border"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {q && totalFiltered === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm relative z-10">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No results for "{searchQuery}"</p>
        </div>
      )}
      {selection && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-4 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg relative z-10"
        >
          <p className="text-xs text-foreground">
            Showing connections for the selected {selection.type}. Click again to deselect.
          </p>
          <button
            onClick={() => setSelection(null)}
            className="text-xs text-primary hover:underline font-medium"
          >
            Clear
          </button>
        </motion.div>
      )}

      <ConnectionLines
        containerRef={containerRef}
        nodeRefs={nodeRefs}
        userGroupEdges={visibleUGEdges}
        groupRoleEdges={visibleGREdges}
        highlighted={highlighted}
      />

      <div className="flex items-start gap-8 min-w-[700px] relative">
        {/* Users Column */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 mb-4">
            <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center", userColor)}>
              <Users className="w-4 h-4 text-white" />
            </div>
            <h4 className="font-semibold text-sm text-foreground">Users</h4>
            <Badge variant="secondary" className="text-xs">{users.length}</Badge>
          </div>
          <div className="space-y-2">
            {filteredUsers.map((u) => (
              <HoverCard openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <motion.div
                    key={u.id}
                    ref={(el) => setNodeRef(`user-${u.id}`, el)}
                    className={itemClasses("user", u.id)}
                    onClick={() => handleClick("user", u.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={cn("w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center", userColor)}>
                      <User className="w-3 h-3 text-white" />
                    </div>
                    <span className="truncate font-medium text-foreground">{u.firstName} {u.lastName}</span>
                  </motion.div>
                </HoverCardTrigger>
                <HoverCardContent side="right" className="w-64 p-3 z-50">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center", userColor)}>
                        <User className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{u.firstName} {u.middleName ? u.middleName + ' ' : ''}{u.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="border-t border-border pt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant={u.status === "active" ? "default" : "secondary"} className="text-[10px] h-4">{u.status}</Badge>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Groups</span>
                        <span className="font-medium text-foreground">{(u.groups || []).length}</span>
                      </div>
                      {(u.groups || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {(u.groups || []).slice(0, 4).map((g) => (
                            <Badge key={g.groupId} variant="outline" className="text-[10px] h-4">{g.groupName}</Badge>
                          ))}
                          {(u.groups || []).length > 4 && (
                            <Badge variant="outline" className="text-[10px] h-4">+{(u.groups || []).length - 4}</Badge>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Workstreams</span>
                        <span className="font-medium text-foreground">{(u.workstreams || []).length}</span>
                      </div>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            ))}
            {(q ? users.filter((u) => `${u.firstName} ${u.middleName || ''} ${u.lastName} ${u.email}`.toLowerCase().includes(q)).length : users.length) > 8 && (
              <p className="text-xs text-muted-foreground text-center">+{(q ? users.filter((u) => `${u.firstName} ${u.middleName || ''} ${u.lastName} ${u.email}`.toLowerCase().includes(q)).length : users.length) - 8} more</p>
            )}
          </div>
        </div>

        {/* Arrow label */}
        <div className="flex flex-col items-center justify-center pt-16 relative z-10">
          <p className="text-[10px] text-muted-foreground">member of</p>
        </div>

        {/* Groups Column */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 mb-4">
            <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center", groupColor)}>
              <UserPlus className="w-4 h-4 text-white" />
            </div>
            <h4 className="font-semibold text-sm text-foreground">Groups</h4>
            <Badge variant="secondary" className="text-xs">{groups.length}</Badge>
          </div>
          <div className="space-y-2">
            {filteredGroups.map((g) => (
              <HoverCard openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <motion.div
                    key={g.id}
                    ref={(el) => setNodeRef(`group-${g.id}`, el)}
                    className={itemClasses("group", g.id)}
                    onClick={() => handleClick("group", g.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={cn("w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center", groupColor)}>
                      <UserPlus className="w-3 h-3 text-white" />
                    </div>
                    <span className="truncate font-medium text-foreground">{g.name}</span>
                    <Badge variant="outline" className="ml-auto text-[10px]">{g.memberCount ?? 0}</Badge>
                  </motion.div>
                </HoverCardTrigger>
                <HoverCardContent side="right" className="w-64 p-3 z-50">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center", groupColor)}>
                        <UserPlus className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{g.name}</p>
                    </div>
                    {g.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{g.description}</p>
                    )}
                    <div className="border-t border-border pt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Members</span>
                        <span className="font-medium text-foreground">{g.memberCount ?? 0}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Roles</span>
                        <span className="font-medium text-foreground">{(g.roles || []).length}</span>
                      </div>
                      {(g.roles || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {(g.roles || []).slice(0, 4).map((r) => (
                            <Badge key={r.roleId} variant="outline" className="text-[10px] h-4">{r.roleName}</Badge>
                          ))}
                          {(g.roles || []).length > 4 && (
                            <Badge variant="outline" className="text-[10px] h-4">+{(g.roles || []).length - 4}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            ))}
            {(q ? groups.filter((g) => g.name.toLowerCase().includes(q)).length : groups.length) > 6 && (
              <p className="text-xs text-muted-foreground text-center">+{(q ? groups.filter((g) => g.name.toLowerCase().includes(q)).length : groups.length) - 6} more</p>
            )}
          </div>
        </div>

        {/* Arrow label */}
        <div className="flex flex-col items-center justify-center pt-16 relative z-10">
          <p className="text-[10px] text-muted-foreground">has role</p>
        </div>

        {/* Roles Column */}
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 mb-4">
            <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center", roleColor)}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <h4 className="font-semibold text-sm text-foreground">Roles</h4>
            <Badge variant="secondary" className="text-xs">{roles.length}</Badge>
          </div>
          <div className="space-y-2">
            {filteredRoles.map((r) => (
              <HoverCard openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <motion.div
                    key={r.id}
                    ref={(el) => setNodeRef(`role-${r.id}`, el)}
                    className={itemClasses("role", r.id)}
                    onClick={() => handleClick("role", r.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={cn("w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center", roleColor)}>
                      <Shield className="w-3 h-3 text-white" />
                    </div>
                    <span className="truncate font-medium text-foreground">{r.name}</span>
                  </motion.div>
                </HoverCardTrigger>
                <HoverCardContent side="left" className="w-64 p-3 z-50">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center", roleColor)}>
                        <Shield className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                    )}
                    <div className="border-t border-border pt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Permissions</span>
                        <span className="font-medium text-foreground">{r.permissions ?? 0}</span>
                      </div>
                      {(() => {
                        const linkedGroups = groups.filter((g) => (g.roles || []).some((gr) => gr.roleId === r.id));
                        return (
                          <>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Groups</span>
                              <span className="font-medium text-foreground">{linkedGroups.length}</span>
                            </div>
                            {linkedGroups.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {linkedGroups.slice(0, 4).map((g) => (
                                  <Badge key={g.id} variant="outline" className="text-[10px] h-4">{g.name}</Badge>
                                ))}
                                {linkedGroups.length > 4 && (
                                  <Badge variant="outline" className="text-[10px] h-4">+{linkedGroups.length - 4}</Badge>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            ))}
            {(q ? roles.filter((r) => r.name.toLowerCase().includes(q)).length : roles.length) > 6 && (
              <p className="text-xs text-muted-foreground text-center">+{(q ? roles.filter((r) => r.name.toLowerCase().includes(q)).length : roles.length) - 6} more</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────
export function HierarchyView({ users, groups, roles, isLoading }: HierarchyViewProps) {
  const [viewMode, setViewMode] = useState<string>("flow");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <StatsBar users={users} groups={groups} roles={roles} />

      <Tabs value={viewMode} onValueChange={setViewMode} className="mb-4">
        <TabsList className="bg-white/80 backdrop-blur-sm border border-slate-200/60 p-1 rounded-xl">
          <TabsTrigger value="flow" className="gap-1.5 text-xs rounded-lg">
            <Layers className="w-3.5 h-3.5" /> Flow Diagram
          </TabsTrigger>
          <TabsTrigger value="top-down" className="gap-1.5 text-xs rounded-lg">
            <ChevronDown className="w-3.5 h-3.5" /> Role → Group → User
          </TabsTrigger>
          <TabsTrigger value="bottom-up" className="gap-1.5 text-xs rounded-lg">
            <ChevronDown className="w-3.5 h-3.5 rotate-180" /> User → Group → Role
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <ScrollArea className="max-h-[calc(100vh-380px)]">
        {viewMode === "flow" && <FlowDiagram users={users} groups={groups} roles={roles} />}
        {viewMode === "top-down" && <RoleDownView roles={roles} groups={groups} users={users} />}
        {viewMode === "bottom-up" && <UserUpView roles={roles} groups={groups} users={users} />}
      </ScrollArea>
    </div>
  );
}
