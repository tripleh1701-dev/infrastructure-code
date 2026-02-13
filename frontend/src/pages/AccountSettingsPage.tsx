import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Building2,
  Settings,
  Globe,
  Plus,
  MapPin,
  Shield,
  Cloud,
  Server,
  Edit,
  Trash2,
  Mail,
  Sparkles,
  Zap,
  Bell,
  ChevronDown,
  ChevronRight,
  FileText,
  AlertTriangle,
  Search,
  X,
  RefreshCw,
  LayoutGrid,
  List,
  Filter,
  TrendingUp,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddEnterpriseForm } from "@/components/enterprise/AddEnterpriseForm";
import { EditEnterpriseForm } from "@/components/enterprise/EditEnterpriseForm";
import { EnterpriseSummary } from "@/components/enterprise/EnterpriseSummary";
import { ProductsServicesManager } from "@/components/enterprise/ProductsServicesManager";
import { useEnterprises } from "@/hooks/useEnterprises";
import { AddAccountForm } from "@/components/account/AddAccountForm";
import { EditAccountForm } from "@/components/account/EditAccountForm";
import { DeleteAccountDialog } from "@/components/account/DeleteAccountDialog";
import { useAccounts, AccountWithDetails } from "@/hooks/useAccounts";
import { AccountTableRow } from "@/components/account/AccountTableRow";
import { AccountCard } from "@/components/account/AccountCard";
import { LicenseWithDetails } from "@/hooks/useLicenses";
import { LicenseDialogs } from "@/components/account/LicenseDialogs";
import { ViewToggle } from "@/components/ui/view-toggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { FilterContextIndicator } from "@/components/layout/FilterContextIndicator";
import { WorkstreamSummary } from "@/components/workstream/WorkstreamSummary";
import { useAccountGlobalAccess } from "@/hooks/useAccountGlobalAccess";
import { ProvisioningStatusBanner } from "@/components/account/ProvisioningStatusBanner";

interface EnterpriseWithDetails {
  id: string;
  name: string;
  created_at: string;
  product: {
    id: string;
    name: string;
  } | null;
  services: {
    id: string;
    name: string;
  }[];
}

type EnterpriseView = "list" | "add" | "edit" | "manage";

// Animation variants for consistent motion (using 'as const' for type safety)
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
  rest: { scale: 1, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
  hover: { 
    scale: 1.02, 
    boxShadow: "0 10px 40px rgba(1,113,236,0.15)",
    transition: { type: "spring" as const, stiffness: 400, damping: 17 }
  }
} as const;

const pulseVariants = {
  pulse: {
    scale: [1, 1.05, 1] as number[],
    transition: { duration: 2, repeat: Infinity }
  }
};

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

export default function AccountSettingsPage() {
  // Context for multi-tenant filtering
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  
  // Check if selected account has Global enterprise license (grants access to all data)
  const { hasGlobalAccess } = useAccountGlobalAccess(selectedAccount?.id);

  const [activeTab, setActiveTab] = useState("enterprise");
  const [enterpriseView, setEnterpriseView] = useState<EnterpriseView>("list");
  const [editingEnterprise, setEditingEnterprise] = useState<EnterpriseWithDetails | null>(null);
  const [showAddEnterprise, setShowAddEnterprise] = useState(false);
  const [showEditEnterprise, setShowEditEnterprise] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountWithDetails | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<AccountWithDetails | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);
  const [addingLicenseAccountId, setAddingLicenseAccountId] = useState<string | null>(null);
  const [editingLicense, setEditingLicense] = useState<LicenseWithDetails | null>(null);
  const [deletingLicense, setDeletingLicense] = useState<LicenseWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cloudTypeFilter, setCloudTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { enterprises, isLoading: enterprisesLoading, refetch: refetchEnterprises } = useEnterprises();
  const { accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useAccounts();
  const [accountsView, setAccountsView] = useViewPreference("accounts", "table");
  const [enterpriseListView, setEnterpriseListView] = useViewPreference("enterprises", "tile");

  // Filter accounts based on selected account from breadcrumb, search, and filters
  // If selected account has Global enterprise license, show ALL accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      // If account has Global access, skip account-level filtering (show all accounts)
      // Otherwise, filter by selected account from breadcrumb (if selected)
      if (!hasGlobalAccess && selectedAccount && account.id !== selectedAccount.id) {
        return false;
      }

      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        searchQuery === "" ||
        account.name.toLowerCase().includes(searchLower) ||
        account.master_account_name.toLowerCase().includes(searchLower) ||
        account.addresses?.some(addr => 
          addr.city.toLowerCase().includes(searchLower) ||
          addr.country.toLowerCase().includes(searchLower)
        );

      const matchesCloudType = 
        cloudTypeFilter === "all" || 
        account.cloud_type === cloudTypeFilter;

      const matchesStatus = 
        statusFilter === "all" || 
        account.status === statusFilter;

      return matchesSearch && matchesCloudType && matchesStatus;
    });
  }, [accounts, selectedAccount, hasGlobalAccess, searchQuery, cloudTypeFilter, statusFilter]);

  const hasActiveFilters = searchQuery !== "" || cloudTypeFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setCloudTypeFilter("all");
    setStatusFilter("all");
  };

  const handleEnterpriseSuccess = () => {
    setShowAddEnterprise(false);
    setShowEditEnterprise(false);
    setEditingEnterprise(null);
    setEnterpriseView("list");
    refetchEnterprises();
  };

  const handleEdit = (enterprise: EnterpriseWithDetails) => {
    setEditingEnterprise(enterprise);
    setShowEditEnterprise(true);
  };

  const handleCloseForm = () => {
    setEnterpriseView("list");
    setEditingEnterprise(null);
  };

  const handleAccountSuccess = () => {
    refetchAccounts();
  };

  const getCloudTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      public: "Public Cloud",
      private: "Private Cloud",
      hybrid: "Hybrid Cloud",
    };
    return labels[type] || type;
  };

  // Filter enterprises based on selected enterprise from breadcrumb
  // If selected account has Global enterprise license, show ALL enterprises
  const filteredEnterprises = useMemo(() => {
    // If account has Global access, show all enterprises
    if (hasGlobalAccess) return enterprises;
    // Otherwise filter by selected enterprise from breadcrumb
    if (!selectedEnterprise) return enterprises;
    return enterprises.filter((e) => e.id === selectedEnterprise.id);
  }, [enterprises, selectedEnterprise, hasGlobalAccess]);

  // Stats calculation - use filtered data
  const stats = useMemo(() => {
    const activeAccounts = filteredAccounts.filter(a => a.status === "active").length;
    const totalLicenses = filteredAccounts.reduce((sum, a) => sum + (a.license_count || 0), 0);
    const expiringLicenses = filteredAccounts.reduce((sum, a) => sum + (a.expiring_license_count || 0), 0);
    return { activeAccounts, totalLicenses, expiringLicenses };
  }, [filteredAccounts]);

  return (
    <TooltipProvider>
    <div className="min-h-screen min-h-dvh bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <Header title="Account Settings" />

      <motion.div 
        className="p-content"
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
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
                Account Settings
              </motion.h1>
              <motion.p 
                className="text-slate-500 mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Manage enterprises, accounts, and global configuration
              </motion.p>
              <div className="mt-3">
                <FilterContextIndicator />
              </div>
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
                  label: "Enterprises", 
                  value: filteredEnterprises.length, 
                  icon: Globe, 
                  color: "from-blue-500 to-blue-600",
                  bgColor: "bg-blue-50"
                },
                { 
                  label: "Active Accounts", 
                  value: stats.activeAccounts, 
                  icon: Building2, 
                  color: "from-emerald-500 to-emerald-600",
                  bgColor: "bg-emerald-50"
                },
                { 
                  label: "Total Licenses", 
                  value: stats.totalLicenses, 
                  icon: FileText, 
                  color: "from-violet-500 to-violet-600",
                  bgColor: "bg-violet-50"
                },
                { 
                  label: "Expiring Soon", 
                  value: stats.expiringLicenses, 
                  icon: AlertTriangle, 
                  color: stats.expiringLicenses > 0 ? "from-amber-500 to-amber-600" : "from-slate-400 to-slate-500",
                  bgColor: stats.expiringLicenses > 0 ? "bg-amber-50" : "bg-slate-50",
                  pulse: stats.expiringLicenses > 0
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
                        animate={stat.pulse ? "pulse" : undefined}
                        variants={pulseVariants}
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <motion.div 
            variants={itemVariants}
            className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4"
          >
            <TabsList className="bg-white/80 backdrop-blur-sm border border-slate-200/60 p-1.5 rounded-xl shadow-lg shadow-slate-200/50">
              {[
                { value: "enterprise", icon: Globe, label: "Enterprise", rotate: false },
                { value: "accounts", icon: Building2, label: "Accounts", rotate: false },
                { value: "settings", icon: Settings, label: "Global Settings", rotate: true },
              ].map((tab) => (
                <TabsTrigger 
                  key={tab.value}
                  value={tab.value} 
                  className={cn(
                    "group gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-300",
                    "text-slate-500 hover:text-slate-700",
                    "data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#0171EC] data-[state=active]:to-[#0052cc]",
                    "data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-200/50",
                    "hover:bg-slate-50 data-[state=active]:hover:bg-gradient-to-r"
                  )}
                >
                  <motion.div
                    whileHover={{ scale: 1.15, rotate: tab.rotate ? 45 : 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <tab.icon className="w-4 h-4" />
                  </motion.div>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <AnimatePresence mode="wait">
            {activeTab === "enterprise" && enterpriseView === "list" && (
              <motion.div 
                initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="flex flex-wrap items-center gap-3"
              >
                <ViewToggle view={enterpriseListView} onViewChange={setEnterpriseListView} />
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="gap-2 bg-white/80 backdrop-blur-sm border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-blue-200 hover:text-blue-600 transition-all duration-300 shadow-sm hover:shadow-md"
                    onClick={() => setEnterpriseView("manage")}
                  >
                    <Shield className="w-4 h-4" />
                    Manage Products & Services
                  </Button>
                </motion.div>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    size="sm" 
                    className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white transition-all duration-300 shadow-lg shadow-blue-200/50 hover:shadow-xl hover:shadow-blue-300/50"
                    onClick={() => setShowAddEnterprise(true)}
                  >
                    <motion.div
                      whileHover={{ rotate: 90 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <Plus className="w-4 h-4" />
                    </motion.div>
                    Add Enterprise
                  </Button>
                </motion.div>
              </motion.div>
            )}
            {activeTab === "accounts" && (
              <motion.div 
                initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="flex flex-wrap items-center gap-3"
              >
                <ViewToggle view={accountsView} onViewChange={setAccountsView} />
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    size="sm" 
                    className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white transition-all duration-300 shadow-lg shadow-blue-200/50 hover:shadow-xl hover:shadow-blue-300/50"
                    onClick={() => setShowAddAccount(true)}
                  >
                    <motion.div
                      whileHover={{ rotate: 90 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <Plus className="w-4 h-4" />
                    </motion.div>
                    Add Account
                  </Button>
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>
          </motion.div>

          {/* Accounts Tab */}
          <TabsContent value="accounts" className="space-y-4">
            <AddAccountForm 
              open={showAddAccount} 
              onOpenChange={setShowAddAccount}
              onSuccess={handleAccountSuccess}
            />
            {editingAccount && (
              <EditAccountForm
                account={editingAccount}
                open={!!editingAccount}
                onOpenChange={(open) => !open && setEditingAccount(null)}
                onSuccess={handleAccountSuccess}
              />
            )}
            {deletingAccount && (
              <DeleteAccountDialog
                account={deletingAccount}
                open={!!deletingAccount}
                onOpenChange={(open) => !open && setDeletingAccount(null)}
                onSuccess={handleAccountSuccess}
              />
            )}

            {/* Provisioning Status Banner */}
            <ProvisioningStatusBanner />

            {/* Enhanced Search and Filters */}
            <motion.div 
              variants={itemVariants}
              className="flex flex-col sm:flex-row gap-3"
            >
              <motion.div 
                className="relative flex-1 group"
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
                  placeholder="Search accounts, locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 bg-white/80 backdrop-blur-sm border-slate-200 h-11 rounded-xl transition-all duration-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 hover:border-slate-300 hover:shadow-sm"
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
              
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Select value={cloudTypeFilter} onValueChange={setCloudTypeFilter}>
                  <SelectTrigger className="w-full sm:w-[170px] bg-white/80 backdrop-blur-sm border-slate-200 h-11 rounded-xl transition-all duration-300 hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 hover:shadow-sm">
                    <Cloud className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue placeholder="Cloud Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                    <SelectItem value="all" className="rounded-lg">All Types</SelectItem>
                    <SelectItem value="public" className="rounded-lg">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Public Cloud
                      </span>
                    </SelectItem>
                    <SelectItem value="private" className="rounded-lg">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-violet-500" />
                        Private Cloud
                      </span>
                    </SelectItem>
                    <SelectItem value="hybrid" className="rounded-lg">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Hybrid Cloud
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </motion.div>
              
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[150px] bg-white/80 backdrop-blur-sm border-slate-200 h-11 rounded-xl transition-all duration-300 hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 hover:shadow-sm">
                    <Activity className="w-4 h-4 mr-2 text-slate-500" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                    <SelectItem value="all" className="rounded-lg">All Status</SelectItem>
                    <SelectItem value="active" className="rounded-lg">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Active
                      </span>
                    </SelectItem>
                    <SelectItem value="inactive" className="rounded-lg">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Inactive
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </motion.div>
              
              <AnimatePresence>
              {hasActiveFilters && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: -10 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                >
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearFilters} 
                    className="gap-1.5 h-11 px-4 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300"
                  >
                    <motion.div
                      whileHover={{ rotate: 90 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <X className="w-4 h-4" />
                    </motion.div>
                    Clear Filters
                  </Button>
                </motion.div>
              )}
              </AnimatePresence>
            </motion.div>
            
            {accountsLoading ? (
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
                      <Skeleton className="w-10 h-10 rounded-xl" />
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
            ) : accounts.length === 0 ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-12 text-center shadow-lg"
              >
                <motion.div 
                  className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center"
                  animate={{ 
                    scale: [1, 1.05, 1],
                    rotate: [0, 2, -2, 0]
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Building2 className="w-10 h-10 text-blue-500" />
                </motion.div>
                <h3 className="text-xl font-semibold text-slate-800 mb-2">No Accounts Yet</h3>
                <p className="text-slate-500 mb-6 max-w-md mx-auto">
                  Get started by creating your first account to manage cloud resources and licenses.
                </p>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    onClick={() => setShowAddAccount(true)} 
                    className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white shadow-lg shadow-blue-200/50"
                  >
                    <Plus className="w-4 h-4" />
                    Add Your First Account
                  </Button>
                </motion.div>
              </motion.div>
            ) : filteredAccounts.length === 0 ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-12 text-center shadow-lg"
              >
                <motion.div 
                  className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Search className="w-10 h-10 text-slate-400" />
                </motion.div>
                <h3 className="text-xl font-semibold text-slate-800 mb-2">No Results Found</h3>
                <p className="text-slate-500 mb-6">
                  Try adjusting your search or filters to find what you're looking for.
                </p>
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button 
                    variant="outline" 
                    onClick={clearFilters} 
                    className="gap-2 border-slate-200 hover:bg-slate-50 rounded-xl"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Clear All Filters
                  </Button>
                </motion.div>
              </motion.div>
            ) : accountsView === "table" ? (
              <motion.div
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
              >
                <div className="table-container">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-50/50">
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-10"></th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cloud Type</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Licenses</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAccounts.map((account, index) => (
                        <AccountTableRow
                          key={account.id}
                          account={account}
                          index={index}
                          isExpanded={expandedAccountId === account.id}
                          onToggleExpand={() => setExpandedAccountId(
                            expandedAccountId === account.id ? null : account.id
                          )}
                          onEdit={() => setEditingAccount(account)}
                          onDelete={() => setDeletingAccount(account)}
                          onAddLicense={() => setAddingLicenseAccountId(account.id)}
                          onEditLicense={(license) => setEditingLicense(license)}
                          onDeleteLicense={(license) => setDeletingLicense(license)}
                          getCloudTypeLabel={getCloudTypeLabel}
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
                  {filteredAccounts.map((account, index) => (
                    <motion.div
                      key={account.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ 
                        type: "spring", 
                        stiffness: 300, 
                        damping: 25,
                        delay: index * 0.05
                      }}
                    >
                      <AccountCard
                        account={account}
                        index={index}
                        onEdit={() => setEditingAccount(account)}
                        onDelete={() => setDeletingAccount(account)}
                        onAddLicense={() => setAddingLicenseAccountId(account.id)}
                        onClick={() => setExpandedAccountId(
                          expandedAccountId === account.id ? null : account.id
                        )}
                        getCloudTypeLabel={getCloudTypeLabel}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            {/* License Dialogs */}
            <LicenseDialogs
              addingAccountId={addingLicenseAccountId}
              editingLicense={editingLicense}
              deletingLicense={deletingLicense}
              accounts={accounts}
              onCloseAdd={() => setAddingLicenseAccountId(null)}
              onCloseEdit={() => setEditingLicense(null)}
              onCloseDelete={() => setDeletingLicense(null)}
              onSuccess={refetchAccounts}
            />
          </TabsContent>

          {/* Enterprise Tab */}
          <TabsContent value="enterprise" className="space-y-4">
            {enterpriseView === "manage" && (
              <ProductsServicesManager onClose={handleCloseForm} onUpdate={refetchEnterprises} />
            )}
            {(enterpriseView === "list" || enterpriseView === "add" || enterpriseView === "edit") && (
              <EnterpriseSummary 
                enterprises={filteredEnterprises} 
                isLoading={enterprisesLoading} 
                onEdit={handleEdit}
                onRefresh={refetchEnterprises}
                view={enterpriseListView}
              />
            )}
          </TabsContent>

          {/* Enterprise Dialogs */}
          <AddEnterpriseForm
            open={showAddEnterprise}
            onOpenChange={setShowAddEnterprise}
            onSuccess={handleEnterpriseSuccess}
          />
          {editingEnterprise && (
            <EditEnterpriseForm
              enterprise={editingEnterprise}
              open={showEditEnterprise}
              onOpenChange={(open) => {
                setShowEditEnterprise(open);
                if (!open) setEditingEnterprise(null);
              }}
              onSuccess={handleEnterpriseSuccess}
            />
          )}

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {/* Workstream Summary Section */}
            <WorkstreamSummary />

            <motion.div 
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 lg:grid-cols-2 gap-md-fluid"
            >
              {/* AI & Automation Card */}
              <motion.div
                variants={cardHoverVariants}
                initial="rest"
                whileHover="hover"
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
              >
                <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-transparent">
                  <motion.div 
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-200/50"
                    whileHover={{ rotate: 360, scale: 1.1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Sparkles className="w-6 h-6 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-lg">AI & Automation</h3>
                    <p className="text-sm text-slate-500">Intelligent features for your workflows</p>
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  {[
                    { icon: Sparkles, label: "AI Suggestions", description: "Get intelligent pipeline recommendations", enabled: true, gradient: "from-blue-500 to-blue-600" },
                    { icon: Zap, label: "Auto-deploy", description: "Automatically trigger on main branch", enabled: false, gradient: "from-amber-500 to-amber-600" },
                    { icon: TrendingUp, label: "Smart Scaling", description: "AI-powered resource optimization", enabled: true, gradient: "from-violet-500 to-violet-600" },
                  ].map((setting, index) => (
                    <motion.div 
                      key={index} 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ x: 4, backgroundColor: "rgb(248 250 252)" }}
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-50/50 transition-all duration-300 cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <motion.div 
                          className={cn(
                            "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-sm",
                            setting.gradient
                          )}
                          whileHover={{ scale: 1.1, rotate: 5 }}
                        >
                          <setting.icon className="w-5 h-5" />
                        </motion.div>
                        <div>
                          <p className="font-medium text-slate-800">{setting.label}</p>
                          <p className="text-sm text-slate-500">{setting.description}</p>
                        </div>
                      </div>
                      <Switch defaultChecked={setting.enabled} className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-blue-500 data-[state=checked]:to-blue-600" />
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Notifications Card */}
              <motion.div
                variants={cardHoverVariants}
                initial="rest"
                whileHover="hover"
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
              >
                <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/50 to-transparent">
                  <motion.div 
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200/50"
                    animate={{ 
                      rotate: [0, 15, -15, 0],
                    }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                  >
                    <Bell className="w-6 h-6 text-white" />
                  </motion.div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-lg">Notifications</h3>
                    <p className="text-sm text-slate-500">Manage your alert preferences</p>
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  {[
                    { icon: Mail, label: "Email Notifications", description: "Receive email alerts for important updates", enabled: true, gradient: "from-emerald-500 to-emerald-600" },
                    { icon: Shield, label: "Security Alerts", description: "Get notified about security events", enabled: true, gradient: "from-red-500 to-red-600" },
                    { icon: AlertTriangle, label: "License Expiry", description: "Alerts before licenses expire", enabled: true, gradient: "from-amber-500 to-amber-600" },
                  ].map((setting, index) => (
                    <motion.div 
                      key={index} 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ x: 4, backgroundColor: "rgb(248 250 252)" }}
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-50/50 transition-all duration-300 cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <motion.div 
                          className={cn(
                            "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-sm",
                            setting.gradient
                          )}
                          whileHover={{ scale: 1.1, rotate: 5 }}
                        >
                          <setting.icon className="w-5 h-5" />
                        </motion.div>
                        <div>
                          <p className="font-medium text-slate-800">{setting.label}</p>
                          <p className="text-sm text-slate-500">{setting.description}</p>
                        </div>
                      </div>
                      <Switch defaultChecked={setting.enabled} className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-emerald-500 data-[state=checked]:to-emerald-600" />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
    </TooltipProvider>
  );
}
