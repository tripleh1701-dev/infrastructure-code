import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Users,
  Shield,
  UserPlus,
  MoreHorizontal,
  Mail,
  Calendar,
  CheckCircle,
  Clock,
  Pencil,
  Trash2,
  Building2,
  Wrench,
  X,
  RefreshCw,
  Activity,
  Key,
  Layers,
  AlertTriangle,
  Filter,
  Package,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccessControlUsers, AccessControlUser } from "@/hooks/useAccessControlUsers";
import { useGroups, Group } from "@/hooks/useGroups";
import { useRoles, Role } from "@/hooks/useRoles";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useLicenses } from "@/hooks/useLicenses";
import { AddUserDialog } from "@/components/access-control/AddUserDialog";
import { EditUserDialog } from "@/components/access-control/EditUserDialog";
import { DeleteUserDialog } from "@/components/access-control/DeleteUserDialog";
import { AddGroupDialog } from "@/components/access-control/AddGroupDialog";
import { EditGroupDialog } from "@/components/access-control/EditGroupDialog";
import { DeleteGroupDialog } from "@/components/access-control/DeleteGroupDialog";
import { AddRoleDialog } from "@/components/access-control/AddRoleDialog";
import { EditRoleDialog } from "@/components/access-control/EditRoleDialog";
import { DeleteRoleDialog } from "@/components/access-control/DeleteRoleDialog";
import { GroupCard } from "@/components/access-control/GroupCard";
import { GroupTableRow } from "@/components/access-control/GroupTableRow";
import { RoleCard } from "@/components/access-control/RoleCard";
import { RoleTableRow } from "@/components/access-control/RoleTableRow";
import { UserGroupRolesDisplay } from "@/components/access-control/UserGroupRolesDisplay";
import { format, differenceInDays } from "date-fns";
import { ViewToggle } from "@/components/ui/view-toggle";

// Helper to calculate end date urgency
const getEndDateUrgency = (endDate: string | null | undefined): { level: "critical" | "soon" | "upcoming" | null; daysLeft: number | null } => {
  if (!endDate) return { level: null, daysLeft: null };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  const daysLeft = differenceInDays(end, today);
  
  if (daysLeft < 0) return { level: null, daysLeft }; // Already expired
  if (daysLeft <= 7) return { level: "critical", daysLeft };
  if (daysLeft <= 14) return { level: "soon", daysLeft };
  if (daysLeft <= 30) return { level: "upcoming", daysLeft };
  
  return { level: null, daysLeft };
};

const getUrgencyBadge = (urgency: { level: "critical" | "soon" | "upcoming" | null; daysLeft: number | null }) => {
  if (!urgency.level || urgency.daysLeft === null) return null;
  
  const configs = {
    critical: {
      className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
      label: "Critical",
      animate: true,
    },
    soon: {
      className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
      label: "Soon",
      animate: false,
    },
    upcoming: {
      className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
      label: "Upcoming",
      animate: false,
    },
  };
  
  const config = configs[urgency.level];
  
  return {
    ...config,
    daysLeft: urgency.daysLeft,
    text: urgency.daysLeft === 0 ? "Today" : urgency.daysLeft === 1 ? "1 day" : `${urgency.daysLeft} days`,
  };
};
import { useViewPreference } from "@/hooks/useViewPreference";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { FilterContextIndicator } from "@/components/layout/FilterContextIndicator";
import { usePermissions } from "@/contexts/PermissionContext";
import { PermissionGate } from "@/components/auth/PermissionGate";

// Animation variants
const pageVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 }
  }
} as const;

const cardHoverVariants = {
  rest: { scale: 1, y: 0 },
  hover: { 
    scale: 1.02, 
    y: -4,
    transition: { type: "spring" as const, stiffness: 400, damping: 17 }
  }
} as const;

const statsCardVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 24,
      delay: i * 0.1
    }
  })
};

const getRoleColor = (role: string) => {
  switch (role.toLowerCase()) {
    case "admin":
      return "bg-primary text-primary-foreground";
    case "developer":
      return "bg-primary/10 text-primary border border-primary/30";
    case "devops":
      return "bg-primary/10 text-primary border border-primary/30";
    case "manager":
      return "bg-primary text-primary-foreground";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
};

const memberColors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500"];

export default function AccessControlPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [usersView, setUsersView] = useViewPreference("access-control-users", "table");
  const [rolesView, setRolesView] = useViewPreference("access-control-roles", "tile");
  const [groupsView, setGroupsView] = useViewPreference("access-control-groups", "tile");
  
  // Filter states for Groups and Roles
  const [groupWorkstreamFilter, setGroupWorkstreamFilter] = useState<string>("all");
  const [groupProductFilter, setGroupProductFilter] = useState<string>("all");
  const [groupServiceFilter, setGroupServiceFilter] = useState<string>("all");
  const [roleWorkstreamFilter, setRoleWorkstreamFilter] = useState<string>("all");
  const [roleProductFilter, setRoleProductFilter] = useState<string>("all");
  const [roleServiceFilter, setRoleServiceFilter] = useState<string>("all");
   
   // Filter state for Users tab
   const [userGroupFilter, setUserGroupFilter] = useState<string>("all");
   const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
   const [userTechnicalFilter, setUserTechnicalFilter] = useState<string>("all");
  
  // Get selected account and enterprise from context
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { hasTabAccess, canCreate } = usePermissions();
  
  // User dialogs
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<AccessControlUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AccessControlUser | null>(null);
  
  // Group dialogs
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  
  // Role dialogs
  const [showAddRole, setShowAddRole] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);

  // Pass accountId and enterpriseId to filter users, roles user counts, and groups member counts
  const accountId = selectedAccount?.id;
  const enterpriseId = selectedEnterprise?.id;
  const { data: users = [], isLoading: usersLoading } = useAccessControlUsers(accountId, enterpriseId);
  const { data: groups = [], isLoading: groupsLoading } = useGroups(accountId, enterpriseId);
  const { data: roles = [], isLoading: rolesLoading } = useRoles(accountId, enterpriseId);
  
  // Fetch workstreams and licenses for filter options
  const { workstreams } = useWorkstreams(accountId, enterpriseId);
  const { licenses } = useLicenses(accountId);
  
  // Derive unique products and services from licenses (filtered by enterprise if selected)
  const filterOptions = useMemo(() => {
    const filteredLicenses = enterpriseId 
      ? licenses.filter(l => l.enterprise_id === enterpriseId)
      : licenses;
    
    const productsMap = new Map<string, { id: string; name: string }>();
    const servicesMap = new Map<string, { id: string; name: string }>();
    
    filteredLicenses.forEach(license => {
      if (license.product) {
        productsMap.set(license.product.id, license.product);
      }
      if (license.service) {
        servicesMap.set(license.service.id, license.service);
      }
    });
    
    return {
      workstreams: workstreams.map(w => ({ id: w.id, name: w.name })),
      products: Array.from(productsMap.values()),
      services: Array.from(servicesMap.values()),
    };
  }, [workstreams, licenses, enterpriseId]);
 
   // Create group options for user filter
   const groupFilterOptions = useMemo(() => {
     return groups.map(g => ({ id: g.id, name: g.name }));
   }, [groups]);

  // Create a map of group IDs to their data for quick lookup
  const groupRolesMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; roles: typeof groups[0]['roles'] }>();
    groups.forEach(group => {
      map.set(group.id, { id: group.id, name: group.name, roles: group.roles });
      // Also index by name for legacy support
      map.set(group.name, { id: group.id, name: group.name, roles: group.roles });
    });
    return map;
  }, [groups]);

  // Stats calculation
  const stats = useMemo(() => {
    const activeUsers = users.filter(u => u.status === "active").length;
    const technicalUsers = users.filter(u => u.isTechnicalUser).length;
    const expiringUsers = users.filter(u => {
      const urgency = getEndDateUrgency(u.endDate);
      return urgency.level !== null;
    }).length;
    return { 
      totalUsers: users.length, 
      activeUsers, 
      technicalUsers,
      expiringUsers,
      totalGroups: groups.length, 
      totalRoles: roles.length 
    };
  }, [users, groups, roles]);

  const filteredUsers = users.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    const fullName = `${user.firstName} ${user.middleName || ""} ${user.lastName}`.toLowerCase();
    // Include group names from groups array in search
    const groupNames = (user.groups || []).map(g => g.groupName.toLowerCase()).join(' ');
     
     const matchesSearch = (
      fullName.includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      user.assignedRole.toLowerCase().includes(searchLower) ||
      user.assignedGroup.toLowerCase().includes(searchLower) ||
      groupNames.includes(searchLower)
    );
     
     // Group filter: check if user belongs to selected group
     const matchesGroupFilter = userGroupFilter === "all" || 
       (user.groups || []).some(g => g.groupId === userGroupFilter);
     
     // Status filter
     const matchesStatusFilter = userStatusFilter === "all" || user.status === userStatusFilter;
     
     // Technical user filter
     const matchesTechnicalFilter = userTechnicalFilter === "all" || 
       (userTechnicalFilter === "technical" ? user.isTechnicalUser : !user.isTechnicalUser);
     
     return matchesSearch && matchesGroupFilter && matchesStatusFilter && matchesTechnicalFilter;
  });

  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        group.name.toLowerCase().includes(searchLower) ||
        (group.description?.toLowerCase().includes(searchLower) ?? false);
      
      const matchesWorkstream = groupWorkstreamFilter === "all" || group.workstreamId === groupWorkstreamFilter;
      const matchesProduct = groupProductFilter === "all" || group.productId === groupProductFilter;
      const matchesService = groupServiceFilter === "all" || group.serviceId === groupServiceFilter;
      
      return matchesSearch && matchesWorkstream && matchesProduct && matchesService;
    });
  }, [groups, searchQuery, groupWorkstreamFilter, groupProductFilter, groupServiceFilter]);

  const filteredRoles = useMemo(() => {
    return roles.filter((role) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        role.name.toLowerCase().includes(searchLower) ||
        (role.description?.toLowerCase().includes(searchLower) ?? false);
      
      const matchesWorkstream = roleWorkstreamFilter === "all" || role.workstreamId === roleWorkstreamFilter;
      const matchesProduct = roleProductFilter === "all" || role.productId === roleProductFilter;
      const matchesService = roleServiceFilter === "all" || role.serviceId === roleServiceFilter;
      
      return matchesSearch && matchesWorkstream && matchesProduct && matchesService;
    });
  }, [roles, searchQuery, roleWorkstreamFilter, roleProductFilter, roleServiceFilter]);
  
  // Clear filters when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchQuery("");
     // Clear user group filter when switching tabs
     if (tab !== "users") {
       setUserGroupFilter("all");
     }
  };
  
  // Check if any filter is active
   const hasActiveUserFilters = userGroupFilter !== "all" || userStatusFilter !== "all" || userTechnicalFilter !== "all";
  const hasActiveGroupFilters = groupWorkstreamFilter !== "all" || groupProductFilter !== "all" || groupServiceFilter !== "all";
  const hasActiveRoleFilters = roleWorkstreamFilter !== "all" || roleProductFilter !== "all" || roleServiceFilter !== "all";
  
   const clearUserFilters = () => {
     setUserGroupFilter("all");
     setUserStatusFilter("all");
     setUserTechnicalFilter("all");
   };
   
  const clearGroupFilters = () => {
    setGroupWorkstreamFilter("all");
    setGroupProductFilter("all");
    setGroupServiceFilter("all");
  };
  
  const clearRoleFilters = () => {
    setRoleWorkstreamFilter("all");
    setRoleProductFilter("all");
    setRoleServiceFilter("all");
  };

  const handleAddNew = () => {
    switch (activeTab) {
      case "users":
        setShowAddUser(true);
        break;
      case "groups":
        setShowAddGroup(true);
        break;
      case "roles":
        setShowAddRole(true);
        break;
    }
  };

  const getAddButtonLabel = () => {
    switch (activeTab) {
      case "users":
        return "Add User";
      case "groups":
        return "Add Group";
      case "roles":
        return "Add Role";
      default:
        return "Add New";
    }
  };

  return (
    <TooltipProvider>
    <div className="min-h-screen min-h-dvh bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <Header title="Access Control" />

      <motion.div 
        className="p-content"
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Filter Context Indicator */}
        <FilterContextIndicator />
        
        {/* Enhanced Page Header with Stats */}
        <motion.div variants={itemVariants} className="mb-lg-fluid">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <motion.h1 
                className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
              >
                Access Control
              </motion.h1>
              <motion.p 
                className="text-muted-foreground mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Manage users, roles, and permissions
              </motion.p>
            </div>
            
            {/* Quick Stats Bar - Responsive */}
            <motion.div 
              className="responsive-flex"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {[
                { 
                  label: "Total Users", 
                  value: stats.totalUsers, 
                  icon: Users, 
                  color: "from-blue-500 to-blue-600",
                  bgColor: "bg-blue-50"
                },
                { 
                  label: "Active", 
                  value: stats.activeUsers, 
                  icon: Activity, 
                  color: "from-emerald-500 to-emerald-600",
                  bgColor: "bg-emerald-50"
                },
                { 
                  label: "Technical", 
                  value: stats.technicalUsers, 
                  icon: Wrench, 
                  color: "from-amber-500 to-amber-600",
                  bgColor: "bg-amber-50"
                },
                ...(stats.expiringUsers > 0 ? [{
                  label: "Expiring",
                  value: stats.expiringUsers,
                  icon: AlertTriangle,
                  color: "from-red-500 to-red-600",
                  bgColor: "bg-red-50"
                }] : []),
                { 
                  label: "Groups", 
                  value: stats.totalGroups, 
                  icon: UserPlus, 
                  color: "from-violet-500 to-violet-600",
                  bgColor: "bg-violet-50"
                },
                { 
                  label: "Roles", 
                  value: stats.totalRoles, 
                  icon: Key, 
                  color: "from-rose-500 to-rose-600",
                  bgColor: "bg-rose-50"
                },
              ].map((stat, i) => (
                <Tooltip key={stat.label}>
                  <TooltipTrigger asChild>
                    <motion.div
                      custom={i}
                      variants={statsCardVariants}
                      initial="hidden"
                      animate="visible"
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/50 backdrop-blur-sm cursor-default",
                        stat.bgColor,
                        "shadow-sm hover:shadow-md transition-shadow duration-300"
                      )}
                    >
                      <motion.div 
                        className={cn(
                          "w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white shadow-sm",
                          stat.color
                        )}
                        whileHover={{ rotate: 5 }}
                      >
                        <stat.icon className="w-4 h-4" />
                      </motion.div>
                      <div className="flex flex-col">
                        <span className="text-lg font-bold text-slate-800">{stat.value}</span>
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{stat.label}</span>
                      </div>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{stat.value} {stat.label.toLowerCase()}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* Tabs and Search */}
        <motion.div 
          variants={itemVariants}
          className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4"
        >
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="bg-white/80 backdrop-blur-sm border border-slate-200/60 p-1.5 rounded-xl shadow-lg shadow-slate-200/50">
              {[
                { value: "users", icon: Users, label: "Users" },
                { value: "groups", icon: UserPlus, label: "Groups" },
                { value: "roles", icon: Shield, label: "Roles" },
              ]
                .filter((tab) => hasTabAccess("access-control", tab.value))
                .map((tab) => (
                <TabsTrigger 
                  key={tab.value}
                  value={tab.value} 
                  className={cn(
                    "group relative gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-300",
                    "text-slate-500 hover:text-slate-700",
                    "data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#0171EC] data-[state=active]:to-[#0052cc]",
                    "data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-200/50",
                    "hover:bg-slate-50 data-[state=active]:hover:bg-gradient-to-r"
                  )}
                >
                  <motion.div
                    whileHover={{ scale: 1.15 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <tab.icon className="w-4 h-4" />
                  </motion.div>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            <motion.div 
              className="relative group"
              whileFocus={{ scale: 1.01 }}
            >
              <motion.div
                className="absolute left-3 top-1/2 -translate-y-1/2"
                animate={{ 
                  color: searchQuery ? "#0171EC" : "#64748b",
                  scale: searchQuery ? 1.1 : 1
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <Search className="w-4 h-4" />
              </motion.div>
              <Input
                type="search"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 w-64 bg-white/80 backdrop-blur-sm border-slate-200 h-11 rounded-xl transition-all duration-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 hover:border-slate-300 hover:shadow-sm"
              />
              <AnimatePresence>
              {searchQuery && (
                <motion.button
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 90 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors duration-200 p-1 rounded-full hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}
              </AnimatePresence>
            </motion.div>
            <ViewToggle 
              view={activeTab === "users" ? usersView : activeTab === "roles" ? rolesView : groupsView} 
              onViewChange={activeTab === "users" ? setUsersView : activeTab === "roles" ? setRolesView : setGroupsView} 
            />
            {canCreate("access-control") && (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button 
                  size="sm" 
                  className="gap-2 h-11 bg-gradient-to-r from-[#0171EC] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white transition-all duration-300 shadow-lg shadow-blue-200/50 hover:shadow-xl hover:shadow-blue-300/50 rounded-xl"
                  onClick={handleAddNew}
                >
                  <motion.div
                    whileHover={{ rotate: 90 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <Plus className="w-4 h-4" />
                  </motion.div>
                  {getAddButtonLabel()}
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Filter Bar for Groups */}
        <AnimatePresence>
            {activeTab === "users" && (
             <motion.div
               initial={{ opacity: 0, height: 0 }}
               animate={{ opacity: 1, height: "auto" }}
               exit={{ opacity: 0, height: 0 }}
               transition={{ duration: 0.2 }}
               className="mb-4"
             >
               <div className="flex flex-wrap items-center gap-3 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
                 <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                   <Filter className="w-4 h-4" />
                   <span>Filters:</span>
                 </div>
                 
                 {groupFilterOptions.length > 0 && (
                   <Select value={userGroupFilter} onValueChange={setUserGroupFilter}>
                     <SelectTrigger className="w-[180px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                       <UserPlus className="w-3.5 h-3.5 mr-2 text-violet-500" />
                       <SelectValue placeholder="Group" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">All Groups</SelectItem>
                       {groupFilterOptions.map((g) => (
                         <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 )}
                 
                 <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                   <SelectTrigger className="w-[140px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                     <Activity className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                     <SelectValue placeholder="Status" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">All Status</SelectItem>
                     <SelectItem value="active">Active</SelectItem>
                     <SelectItem value="inactive">Inactive</SelectItem>
                   </SelectContent>
                 </Select>
                 
                 <Select value={userTechnicalFilter} onValueChange={setUserTechnicalFilter}>
                   <SelectTrigger className="w-[160px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                     <Wrench className="w-3.5 h-3.5 mr-2 text-amber-500" />
                     <SelectValue placeholder="User Type" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">All Users</SelectItem>
                     <SelectItem value="technical">Technical Only</SelectItem>
                     <SelectItem value="regular">Regular Only</SelectItem>
                   </SelectContent>
                 </Select>
                 
                 {hasActiveUserFilters && (
                   <motion.div
                     initial={{ scale: 0 }}
                     animate={{ scale: 1 }}
                     exit={{ scale: 0 }}
                   >
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={clearUserFilters}
                       className="h-9 text-slate-500 hover:text-slate-700 gap-1.5"
                     >
                       <X className="w-3.5 h-3.5" />
                       Clear Filters
                     </Button>
                   </motion.div>
                 )}
               </div>
             </motion.div>
           )}
          {activeTab === "groups" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-4"
            >
              <div className="flex flex-wrap items-center gap-3 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <Filter className="w-4 h-4" />
                  <span>Filters:</span>
                </div>
                
                <Select value={groupWorkstreamFilter} onValueChange={setGroupWorkstreamFilter}>
                  <SelectTrigger className="w-[160px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                    <Layers className="w-3.5 h-3.5 mr-2 text-blue-500" />
                    <SelectValue placeholder="Workstream" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Workstreams</SelectItem>
                    {filterOptions.workstreams.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={groupProductFilter} onValueChange={setGroupProductFilter}>
                  <SelectTrigger className="w-[160px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                    <Package className="w-3.5 h-3.5 mr-2 text-purple-500" />
                    <SelectValue placeholder="Product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {filterOptions.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={groupServiceFilter} onValueChange={setGroupServiceFilter}>
                  <SelectTrigger className="w-[160px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                    <Server className="w-3.5 h-3.5 mr-2 text-amber-500" />
                    <SelectValue placeholder="Service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Services</SelectItem>
                    {filterOptions.services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {hasActiveGroupFilters && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearGroupFilters}
                      className="h-9 text-slate-500 hover:text-slate-700 gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear Filters
                    </Button>
                  </motion.div>
                )}
                
                <div className="ml-auto text-xs text-slate-500">
                  Showing {filteredGroups.length} of {groups.length} groups
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter Bar for Roles */}
        <AnimatePresence>
          {activeTab === "roles" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-4"
            >
              <div className="flex flex-wrap items-center gap-3 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <Filter className="w-4 h-4" />
                  <span>Filters:</span>
                </div>
                
                <Select value={roleWorkstreamFilter} onValueChange={setRoleWorkstreamFilter}>
                  <SelectTrigger className="w-[160px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                    <Layers className="w-3.5 h-3.5 mr-2 text-blue-500" />
                    <SelectValue placeholder="Workstream" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Workstreams</SelectItem>
                    {filterOptions.workstreams.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={roleProductFilter} onValueChange={setRoleProductFilter}>
                  <SelectTrigger className="w-[160px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                    <Package className="w-3.5 h-3.5 mr-2 text-purple-500" />
                    <SelectValue placeholder="Product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {filterOptions.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={roleServiceFilter} onValueChange={setRoleServiceFilter}>
                  <SelectTrigger className="w-[160px] h-9 bg-white border-slate-200 rounded-lg text-sm">
                    <Server className="w-3.5 h-3.5 mr-2 text-amber-500" />
                    <SelectValue placeholder="Service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Services</SelectItem>
                    {filterOptions.services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {hasActiveRoleFilters && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearRoleFilters}
                      className="h-9 text-slate-500 hover:text-slate-700 gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear Filters
                    </Button>
                  </motion.div>
                )}
                
                <div className="ml-auto text-xs text-slate-500">
                  Showing {filteredRoles.length} of {roles.length} roles
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Users Tab */}
        {activeTab === "users" && (
          <>
            {usersLoading ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-lg"
              >
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <motion.div 
                      key={i} 
                      className="flex items-center gap-4"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : filteredUsers.length === 0 ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-12 text-center shadow-lg"
              >
                <motion.div 
                  className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Users className="w-10 h-10 text-blue-500" />
                </motion.div>
                <h3 className="text-xl font-semibold text-slate-800 mb-2">
                  {searchQuery ? "No Results Found" : "No Users Yet"}
                </h3>
                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                  {searchQuery ? "Try adjusting your search to find what you're looking for." : "Create a user or add a Technical User in the Accounts section."}
                </p>
                {!searchQuery && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      onClick={() => setShowAddUser(true)} 
                      className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white shadow-lg shadow-blue-200/50"
                    >
                      <Plus className="w-4 h-4" />
                      Add Your First User
                    </Button>
                  </motion.div>
                )}
                {searchQuery && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      variant="outline" 
                      onClick={() => setSearchQuery("")} 
                      className="gap-2 border-slate-200 hover:bg-slate-50 rounded-xl"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Clear Search
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            ) : usersView === "table" ? (
              <motion.div
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
              >
                <div className="table-container">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50/50">
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Groups</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Roles</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Workstreams</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Technical</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Date</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">End Date</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((user, index) => (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border-b border-border hover:bg-muted/50 transition-colors group"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold bg-gradient-to-br from-primary to-primary/70">
                              {user.firstName[0]}{user.lastName[0]}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {user.firstName} {user.middleName ? `${user.middleName} ` : ""}{user.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {user.groups && user.groups.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.groups.slice(0, 2).map((g) => (
                                <span
                                  key={g.groupId}
                                  className="px-2 py-0.5 bg-muted border border-border rounded text-xs text-foreground"
                                >
                                  {g.groupName}
                                </span>
                              ))}
                              {user.groups.length > 2 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="px-2 py-0.5 bg-muted border border-border rounded text-xs text-muted-foreground cursor-default">
                                      +{user.groups.length - 2}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="space-y-1">
                                      {user.groups.slice(2).map((g) => (
                                        <div key={g.groupId} className="text-sm">{g.groupName}</div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 bg-muted border border-border rounded text-xs text-foreground">
                              {user.assignedGroup}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {(() => {
                            // Build groups with roles for the display component
                            const userGroupsWithRoles = (user.groups && user.groups.length > 0)
                              ? user.groups.map(g => {
                                  const groupData = groupRolesMap.get(g.groupId);
                                  return {
                                    groupId: g.groupId,
                                    groupName: g.groupName,
                                    roles: groupData?.roles || [],
                                  };
                                })
                              : user.assignedGroup ? [{
                                  groupId: '',
                                  groupName: user.assignedGroup,
                                  roles: groupRolesMap.get(user.assignedGroup)?.roles || [],
                                }] : [];
                            
                            return (
                              <UserGroupRolesDisplay 
                                groups={userGroupsWithRoles}
                                roles={[]}
                                compact
                              />
                            );
                          })()}
                        </td>
                        <td className="px-5 py-4">
                          {user.workstreams && user.workstreams.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {user.workstreams.slice(0, 2).map((ws) => (
                                <span
                                  key={ws.workstreamId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs"
                                >
                                  <Layers className="w-3 h-3" />
                                  {ws.workstreamName}
                                </span>
                              ))}
                              {user.workstreams.length > 2 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center px-2 py-0.5 bg-muted border border-border rounded text-xs text-muted-foreground cursor-default">
                                      +{user.workstreams.length - 2}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="space-y-1">
                                      {user.workstreams.slice(2).map((ws) => (
                                        <div key={ws.workstreamId} className="text-sm">{ws.workstreamName}</div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {user.accountName ? (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Building2 className="w-3.5 h-3.5" />
                              {user.accountName}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                            user.status === "active" 
                              ? "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800" 
                              : "bg-muted text-muted-foreground border border-border"
                          )}>
                            {user.status === "active" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {user.status === "active" ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          {user.isTechnicalUser ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                              <Wrench className="w-3 h-3" />
                              Yes
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(user.startDate), "MMM d, yyyy")}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {user.endDate ? (
                            (() => {
                              const urgency = getEndDateUrgency(user.endDate);
                              const badge = getUrgencyBadge(urgency);
                              return (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {format(new Date(user.endDate), "MMM d, yyyy")}
                                  </div>
                                  {badge && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <motion.span
                                          initial={{ scale: 0.9, opacity: 0 }}
                                          animate={{ 
                                            scale: 1, 
                                            opacity: 1,
                                            ...(badge.animate && {
                                              boxShadow: ["0 0 0 0 rgba(239, 68, 68, 0)", "0 0 0 4px rgba(239, 68, 68, 0.3)", "0 0 0 0 rgba(239, 68, 68, 0)"]
                                            })
                                          }}
                                          transition={badge.animate ? { 
                                            boxShadow: { repeat: Infinity, duration: 1.5 }
                                          } : undefined}
                                          className={cn(
                                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-default w-fit",
                                            badge.className
                                          )}
                                        >
                                          <AlertTriangle className="w-3 h-3" />
                                          {badge.text}
                                        </motion.span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Access ends {badge.text === "Today" ? "today" : `in ${badge.text}`}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingUser(user)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setDeletingUser(user)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </motion.tr>
                    ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                variants={itemVariants}
                className="responsive-grid-lg"
              >
                <AnimatePresence mode="popLayout">
                  {filteredUsers.map((user, index) => (
                    <motion.div
                      key={user.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      whileHover={{ y: -4, boxShadow: "0 10px 40px rgba(1,113,236,0.15)" }}
                      transition={{ 
                        type: "spring", 
                        stiffness: 300, 
                        damping: 25,
                        delay: index * 0.05
                      }}
                      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-5 transition-all duration-300 cursor-pointer group shadow-lg"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <motion.div 
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-200/50"
                            whileHover={{ scale: 1.1, rotate: 5 }}
                          >
                            {user.firstName[0]}{user.lastName[0]}
                          </motion.div>
                          <div>
                            <h3 className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                              {user.firstName} {user.lastName}
                            </h3>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200 rounded-lg">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl shadow-xl border-slate-200">
                            <DropdownMenuItem onClick={() => setEditingUser(user)} className="rounded-lg">
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => setDeletingUser(user)}
                              className="text-destructive focus:text-destructive rounded-lg"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {user.groups && user.groups.length > 0 ? (
                          <>
                            {user.groups.slice(0, 2).map((g) => (
                              <span
                                key={g.groupId}
                                className="px-2.5 py-1 bg-muted border border-border rounded-full text-xs font-medium text-foreground"
                              >
                                {g.groupName}
                              </span>
                            ))}
                            {user.groups.length > 2 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="px-2.5 py-1 bg-muted border border-border rounded-full text-xs font-medium text-muted-foreground cursor-default">
                                    +{user.groups.length - 2}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="space-y-1">
                                    {user.groups.slice(2).map((g) => (
                                      <div key={g.groupId} className="text-sm">{g.groupName}</div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </>
                        ) : (
                          <span className="px-2.5 py-1 bg-muted border border-border rounded-full text-xs font-medium text-foreground">
                            {user.assignedGroup}
                          </span>
                        )}
                        {user.isTechnicalUser && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-xs font-medium">
                            <Wrench className="w-3 h-3" />
                            Technical
                          </span>
                        )}
                      </div>
                      {/* Roles from Group */}
                      {(() => {
                        // Build groups with roles for the display component
                        const userGroupsWithRoles = (user.groups && user.groups.length > 0)
                          ? user.groups.map(g => {
                              const groupData = groupRolesMap.get(g.groupId);
                              return {
                                groupId: g.groupId,
                                groupName: g.groupName,
                                roles: groupData?.roles || [],
                              };
                            })
                          : user.assignedGroup ? [{
                              groupId: '',
                              groupName: user.assignedGroup,
                              roles: groupRolesMap.get(user.assignedGroup)?.roles || [],
                            }] : [];
                        
                        const hasRoles = userGroupsWithRoles.some(g => g.roles.length > 0);
                        if (hasRoles) {
                          return (
                            <div className="mb-3">
                              <UserGroupRolesDisplay 
                                groups={userGroupsWithRoles}
                                roles={[]}
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {/* Workstreams */}
                      {user.workstreams && user.workstreams.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {user.workstreams.slice(0, 2).map((ws) => (
                            <span
                              key={ws.workstreamId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs"
                            >
                              <Layers className="w-3 h-3" />
                              {ws.workstreamName}
                            </span>
                          ))}
                          {user.workstreams.length > 2 && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-muted border border-border rounded text-xs text-muted-foreground">
                              +{user.workstreams.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                      {/* End Date Expiring Badge */}
                      {(() => {
                        const urgency = getEndDateUrgency(user.endDate);
                        const badge = getUrgencyBadge(urgency);
                        if (badge) {
                          return (
                            <div className="mb-3">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ 
                                      scale: 1, 
                                      opacity: 1,
                                      ...(badge.animate && {
                                        boxShadow: ["0 0 0 0 rgba(239, 68, 68, 0)", "0 0 0 4px rgba(239, 68, 68, 0.3)", "0 0 0 0 rgba(239, 68, 68, 0)"]
                                      })
                                    }}
                                    transition={badge.animate ? { 
                                      boxShadow: { repeat: Infinity, duration: 1.5 }
                                    } : undefined}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                      badge.className
                                    )}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    Access ends {badge.text}
                                  </motion.div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>End date: {format(new Date(user.endDate!), "MMM d, yyyy")}</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium",
                          user.status === "active" 
                            ? "bg-emerald-100 text-emerald-700" 
                            : "bg-slate-100 text-slate-500"
                        )}>
                          {user.status === "active" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {user.status === "active" ? "Active" : "Inactive"}
                        </span>
                        {user.accountName && (
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <Building2 className="w-3.5 h-3.5" />
                            {user.accountName}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}

        {/* Roles Tab */}
        {activeTab === "roles" && (
          <>
            {rolesLoading ? (
              <motion.div 
                variants={itemVariants}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5"
              >
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-5 shadow-lg">
                    <Skeleton className="w-12 h-12 rounded-xl mb-4" />
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ))}
              </motion.div>
            ) : filteredRoles.length === 0 ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-12 text-center shadow-lg"
              >
                <motion.div 
                  className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center"
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Shield className="w-10 h-10 text-violet-500" />
                </motion.div>
                <h3 className="text-xl font-semibold text-slate-800 mb-2">
                  {searchQuery ? "No Results Found" : "No Roles Yet"}
                </h3>
                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                  {searchQuery ? "Try adjusting your search to find what you're looking for." : "Create a role to define user permissions."}
                </p>
                {!searchQuery && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      onClick={() => setShowAddRole(true)} 
                      className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white shadow-lg shadow-blue-200/50"
                    >
                      <Plus className="w-4 h-4" />
                      Add Your First Role
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            ) : rolesView === "table" ? (
              <motion.div
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
              >
                <div className="table-container">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50/50">
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Workstream</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Groups</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Users</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Perms</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRoles.map((role, index) => (
                        <RoleTableRow
                          key={role.id}
                          role={role}
                          index={index}
                          onEdit={setEditingRole}
                          onDelete={setDeletingRole}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                variants={itemVariants}
                className="responsive-grid"
              >
                <AnimatePresence mode="popLayout">
                  {filteredRoles.map((role, index) => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      index={index}
                      onEdit={setEditingRole}
                      onDelete={setDeletingRole}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}

        {/* Groups Tab */}
        {activeTab === "groups" && (
          <>
            {groupsLoading ? (
              <motion.div 
                variants={itemVariants}
                className="responsive-grid-lg"
              >
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-5 shadow-lg">
                    <Skeleton className="w-12 h-12 rounded-xl mb-4" />
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ))}
              </motion.div>
            ) : filteredGroups.length === 0 ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-12 text-center shadow-lg"
              >
                <motion.div 
                  className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <UserPlus className="w-10 h-10 text-emerald-500" />
                </motion.div>
                <h3 className="text-xl font-semibold text-slate-800 mb-2">
                  {searchQuery ? "No Results Found" : "No Groups Yet"}
                </h3>
                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                  {searchQuery ? "Try adjusting your search to find what you're looking for." : "Create a group to organize users."}
                </p>
                {!searchQuery && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button 
                      onClick={() => setShowAddGroup(true)} 
                      className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white shadow-lg shadow-blue-200/50"
                    >
                      <Plus className="w-4 h-4" />
                      Add Your First Group
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            ) : groupsView === "table" ? (
              <motion.div
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
              >
                <div className="table-container">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50/50">
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Group</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Workstream</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Service</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Roles</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Users</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredGroups.map((group, index) => (
                        <GroupTableRow
                          key={group.id}
                          group={group}
                          index={index}
                          onEdit={setEditingGroup}
                          onDelete={setDeletingGroup}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                variants={itemVariants}
                className="responsive-grid-lg"
              >
                <AnimatePresence mode="popLayout">
                  {filteredGroups.map((group, index) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      index={index}
                      onEdit={setEditingGroup}
                      onDelete={setDeletingGroup}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}
      </motion.div>

      {/* User Dialogs - conditionally render to avoid Radix ref loops */}
      {showAddUser && <AddUserDialog open={showAddUser} onOpenChange={setShowAddUser} />}
      {editingUser && <EditUserDialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)} user={editingUser} />}
      {deletingUser && <DeleteUserDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)} user={deletingUser} />}
      
      {/* Group Dialogs - conditionally render to avoid Radix ref loops */}
      {showAddGroup && <AddGroupDialog open={showAddGroup} onOpenChange={setShowAddGroup} />}
      {editingGroup && <EditGroupDialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)} group={editingGroup} />}
      {deletingGroup && <DeleteGroupDialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)} group={deletingGroup} />}
      
      {/* Role Dialogs - conditionally render to avoid Radix ref loops */}
      {showAddRole && <AddRoleDialog open={showAddRole} onOpenChange={setShowAddRole} />}
      {editingRole && <EditRoleDialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)} role={editingRole} />}
      {deletingRole && <DeleteRoleDialog open={!!deletingRole} onOpenChange={(open) => !open && setDeletingRole(null)} role={deletingRole} />}
    </div>
    </TooltipProvider>
  );
}
