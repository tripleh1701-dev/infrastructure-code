import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  Key,
  Link2,
  Globe,
  Webhook,
  Plus,
  Search,
  Settings,
  CheckCircle,
  Lock,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  Activity,
  AlertTriangle,
  ExternalLink,
  Filter,
  Shield,
  Zap,
  Loader2,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ViewToggle } from "@/components/ui/view-toggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import { FilterContextIndicator } from "@/components/layout/FilterContextIndicator";
import { AddCredentialDialog } from "@/components/security/AddCredentialDialog";
import { EditCredentialDialog } from "@/components/security/EditCredentialDialog";
import { RotateCredentialDialog } from "@/components/security/RotateCredentialDialog";
import { DeleteCredentialDialog } from "@/components/security/DeleteCredentialDialog";
import { AddConnectorDialog } from "@/components/security/AddConnectorDialog";
import { EditConnectorDialog } from "@/components/security/EditConnectorDialog";
import { DeleteConnectorDialog } from "@/components/security/DeleteConnectorDialog";
import type { Credential } from "@/hooks/useCredentials";
import { useCredentials } from "@/hooks/useCredentials";
import { useConnectors, type ConnectorRecord } from "@/hooks/useConnectors";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { formatDistanceToNow, differenceInDays, isPast, format } from "date-fns";

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

// Auth type display mapping
const authTypeDisplayMap: Record<string, string> = {
  oauth: "OAuth2",
  oauth2: "OAuth2",
  api_key: "API Key",
  basic: "Basic",
  basic_auth: "Basic Auth",
  pat: "PAT",
  username_api_key: "Username & API Key",
  username_token: "Username & Token",
  github_app: "GitHub App",
};

// Connector type removed - using ConnectorRecord from useConnectors hook

interface Environment {
  id: string;
  name: string;
  type: "production" | "staging" | "development";
  url: string;
  status: "healthy" | "degraded" | "offline";
}

const environments: Environment[] = [
  { id: "1", name: "Production", type: "production", url: "https://prod.sap-cpi.com", status: "healthy" },
  { id: "2", name: "Staging", type: "staging", url: "https://staging.sap-cpi.com", status: "healthy" },
  { id: "3", name: "Development", type: "development", url: "https://dev.sap-cpi.com", status: "healthy" },
  { id: "4", name: "Test Environment", type: "development", url: "https://test.sap-cpi.com", status: "degraded" },
];

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: "active" | "inactive";
  lastTriggered: string;
}

const webhooks: WebhookItem[] = [
  { id: "1", name: "Build Notifications", url: "https://hooks.slack.com/...", events: ["build.success", "build.failed"], status: "active", lastTriggered: "10 minutes ago" },
  { id: "2", name: "Deploy Alerts", url: "https://api.pagerduty.com/...", events: ["deploy.success", "deploy.failed"], status: "active", lastTriggered: "2 hours ago" },
  { id: "3", name: "Analytics Export", url: "https://analytics.company.com/...", events: ["build.success"], status: "inactive", lastTriggered: "3 days ago" },
];

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState("credentials");
  const [searchQuery, setSearchQuery] = useState("");
  const [credentialsView, setCredentialsView] = useViewPreference("security-credentials", "table");
  const [connectorsView, setConnectorsView] = useViewPreference("security-connectors", "tile");
  const [environmentsView, setEnvironmentsView] = useViewPreference("security-environments", "table");
  const [webhooksView, setWebhooksView] = useViewPreference("security-webhooks", "table");
  
  // Context
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  
  // Fetch credentials from database
  const { credentials, isLoading: credentialsLoading, deleteCredential, refetch: refetchCredentials } = useCredentials(
    selectedAccount?.id,
    selectedEnterprise?.id
  );

  // Fetch connectors from database
  const { connectors, isLoading: connectorsLoading, createConnector, deleteConnector, updateConnector, refetch: refetchConnectors } = useConnectors(
    selectedAccount?.id,
    selectedEnterprise?.id
  );
  
  // Dialog states
  const [addCredentialOpen, setAddCredentialOpen] = useState(false);
  const [editCredentialOpen, setEditCredentialOpen] = useState(false);
  const [rotateCredentialOpen, setRotateCredentialOpen] = useState(false);
  const [deleteCredentialOpen, setDeleteCredentialOpen] = useState(false);
  const [addConnectorOpen, setAddConnectorOpen] = useState(false);
  const [editConnectorOpen, setEditConnectorOpen] = useState(false);
  const [deleteConnectorOpen, setDeleteConnectorOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorRecord | null>(null);
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);
  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(null);
  
  // Fetch workstreams for filtering
  const { workstreams } = useWorkstreams(selectedAccount?.id, selectedEnterprise?.id);
  
  // Filter states
  const [credentialTypeFilter, setCredentialTypeFilter] = useState<string>("all");
  const [credentialStatusFilter, setCredentialStatusFilter] = useState<string>("all");
  const [credentialWorkstreamFilter, setCredentialWorkstreamFilter] = useState<string>("all");
  const [connectorStatusFilter, setConnectorStatusFilter] = useState<string>("all");
  const [connectorTypeFilter, setConnectorTypeFilter] = useState<string>("all");
  const [environmentTypeFilter, setEnvironmentTypeFilter] = useState<string>("all");
  const [webhookStatusFilter, setWebhookStatusFilter] = useState<string>("all");

  // Stats calculation - now using real credentials data
  const stats = useMemo(() => {
    const today = new Date();
    const activeCredentials = credentials.filter(c => c.status === "active").length;
    const expiredCredentials = credentials.filter(c => c.status === "expired" || c.status === "revoked").length;
    const pendingCredentials = credentials.filter(c => c.status === "pending").length;
    const expiringCredentials = credentials.filter(c => {
      if (!c.expires_at) return false;
      const expiryDate = new Date(c.expires_at);
      const daysUntilExpiry = differenceInDays(expiryDate, today);
      return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
    }).length;
    const connectedServices = connectors.filter(c => c.status === "connected").length;
    const disconnectedServices = connectors.filter(c => c.status === "disconnected").length;
    const healthyConnectors = connectors.filter(c => c.health === "healthy").length;
    const warningConnectors = connectors.filter(c => c.health === "warning").length;
    const totalSyncs = connectors.reduce((sum, c) => sum + c.sync_count, 0);
    const healthyEnvironments = environments.filter(e => e.status === "healthy").length;
    const activeWebhooks = webhooks.filter(w => w.status === "active").length;
    return { 
      activeCredentials, expiredCredentials, pendingCredentials, expiringCredentials, 
      connectedServices, disconnectedServices, healthyConnectors, warningConnectors, totalSyncs,
      healthyEnvironments, activeWebhooks 
    };
  }, [credentials, connectors]);

  // Filtered data - now filtering real credentials
  const filteredCredentials = useMemo(() => {
    return credentials.filter((cred) => {
      const searchLower = searchQuery.toLowerCase();
      const displayType = authTypeDisplayMap[cred.auth_type] || cred.auth_type;
      
      // Include workstream names in search
      const workstreamNames = cred.workstreams?.map(ws => ws.name.toLowerCase()).join(" ") || "";
      
      const matchesSearch = cred.name.toLowerCase().includes(searchLower) ||
        displayType.toLowerCase().includes(searchLower) ||
        cred.connector.toLowerCase().includes(searchLower) ||
        cred.category.toLowerCase().includes(searchLower) ||
        workstreamNames.includes(searchLower);
      
      const matchesType = credentialTypeFilter === "all" || displayType === credentialTypeFilter;
      const matchesStatus = credentialStatusFilter === "all" || cred.status === credentialStatusFilter;
      
      // Workstream filter - check if any of the credential's workstreams match
      const matchesWorkstream = credentialWorkstreamFilter === "all" || 
        cred.workstreams?.some(ws => ws.id === credentialWorkstreamFilter);
      
      return matchesSearch && matchesType && matchesStatus && matchesWorkstream;
    });
  }, [credentials, searchQuery, credentialTypeFilter, credentialStatusFilter, credentialWorkstreamFilter]);

  // Helper to format last used time
  const formatLastUsed = (lastUsedAt: string | null) => {
    if (!lastUsedAt) return "Never";
    try {
      return formatDistanceToNow(new Date(lastUsedAt), { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  // Helper to get expiry status
  const getExpiryStatus = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    
    const expiryDate = new Date(expiresAt);
    const today = new Date();
    
    if (isPast(expiryDate)) {
      return { label: "Expired", color: "bg-red-100 text-red-700", urgent: true };
    }
    
    const daysUntilExpiry = differenceInDays(expiryDate, today);
    
    if (daysUntilExpiry <= 7) {
      return { label: `${daysUntilExpiry}d left`, color: "bg-red-100 text-red-700", urgent: true };
    } else if (daysUntilExpiry <= 14) {
      return { label: `${daysUntilExpiry}d left`, color: "bg-amber-100 text-amber-700", urgent: true };
    } else if (daysUntilExpiry <= 30) {
      return { label: `${daysUntilExpiry}d left`, color: "bg-amber-100 text-amber-700", urgent: false };
    }
    
    // For dates more than 30 days away, show the formatted date
    return { 
      label: format(expiryDate, "MMM d, yyyy"), 
      color: "bg-slate-100 text-slate-600", 
      urgent: false 
    };
  };

  // Handle delete credential
  const handleDeleteCredential = (credential: Credential) => {
    setSelectedCredential(credential);
    setDeleteCredentialOpen(true);
  };

  // Handle edit credential
  const handleEditCredential = (credential: Credential) => {
    setSelectedCredential(credential);
    setEditCredentialOpen(true);
  };

  // Handle rotate credential
  const handleRotateCredential = (credential: Credential) => {
    setSelectedCredential(credential);
    setRotateCredentialOpen(true);
  };

  // Handle edit connector
  const handleEditConnector = (connector: ConnectorRecord) => {
    setSelectedConnector(connector);
    setEditConnectorOpen(true);
  };

  // Handle delete connector
  const handleDeleteConnector = (connector: ConnectorRecord) => {
    setSelectedConnector(connector);
    setDeleteConnectorOpen(true);
  };

  // Handle test connector connectivity from summary
  const handleTestConnectorFromList = async (connector: ConnectorRecord) => {
    if (!connector.url || !connector.credential_id) {
      toast.error("Connector is missing URL or credential configuration");
      return;
    }
    setTestingConnectorId(connector.id);
    try {
      const { data, error } = await supabase.functions.invoke("test-connector-connectivity", {
        body: {
          connector: connector.connector_tool,
          url: connector.url,
          credentialId: connector.credential_id,
        },
      });
      if (error) throw error;
      const newHealth = data?.success ? "healthy" : "error";
      await (supabase.from("connectors" as any).update({ health: newHealth }).eq("id", connector.id) as any);
      refetchConnectors();
      if (data?.success) {
        toast.success(data.message || "Connection successful");
      } else {
        toast.error(data?.message || "Connection failed");
      }
    } catch (err) {
      console.error("Connectivity test failed:", err);
      await (supabase.from("connectors" as any).update({ health: "error" }).eq("id", connector.id) as any);
      refetchConnectors();
      toast.error("Failed to test connectivity");
    } finally {
      setTestingConnectorId(null);
    }
  };

  const filteredConnectors = useMemo(() => {
    return connectors.filter((conn) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = conn.name.toLowerCase().includes(searchLower) ||
        conn.connector_type.toLowerCase().includes(searchLower) ||
        (conn.description?.toLowerCase().includes(searchLower) ?? false);
      const matchesStatus = connectorStatusFilter === "all" || conn.status === connectorStatusFilter;
      const matchesType = connectorTypeFilter === "all" || conn.connector_type === connectorTypeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [connectors, searchQuery, connectorStatusFilter, connectorTypeFilter]);

  // Get unique connector types for filter dropdown
  const connectorTypes = useMemo(() => {
    return [...new Set(connectors.map(c => c.connector_type))].sort();
  }, [connectors]);

  // Helper to format last sync time
  const formatLastSync = (lastSyncAt: string | null) => {
    if (!lastSyncAt) return "Never";
    try {
      return formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  const filteredEnvironments = useMemo(() => {
    return environments.filter((env) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = env.name.toLowerCase().includes(searchLower) ||
        env.url.toLowerCase().includes(searchLower);
      const matchesType = environmentTypeFilter === "all" || env.type === environmentTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [searchQuery, environmentTypeFilter]);

  const filteredWebhooks = useMemo(() => {
    return webhooks.filter((hook) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = hook.name.toLowerCase().includes(searchLower) ||
        hook.url.toLowerCase().includes(searchLower) ||
        hook.events.some(e => e.toLowerCase().includes(searchLower));
      const matchesStatus = webhookStatusFilter === "all" || hook.status === webhookStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, webhookStatusFilter]);

  // Check if filters are active
  const hasActiveCredentialFilters = credentialTypeFilter !== "all" || credentialStatusFilter !== "all" || credentialWorkstreamFilter !== "all";
  const hasActiveConnectorFilters = connectorStatusFilter !== "all" || connectorTypeFilter !== "all";
  const hasActiveEnvironmentFilters = environmentTypeFilter !== "all";
  const hasActiveWebhookFilters = webhookStatusFilter !== "all";

  const clearFilters = () => {
    setCredentialTypeFilter("all");
    setCredentialStatusFilter("all");
    setCredentialWorkstreamFilter("all");
    setConnectorStatusFilter("all");
    setConnectorTypeFilter("all");
    setEnvironmentTypeFilter("all");
    setWebhookStatusFilter("all");
    setSearchQuery("");
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchQuery("");
  };

  const getAddButtonLabel = () => {
    switch (activeTab) {
      case "credentials": return "Add Credential";
      case "connectors": return "Add Connector";
      case "environments": return "Add Environment";
      case "webhooks": return "Add Webhook";
      default: return "Add New";
    }
  };

  const handleAddButtonClick = () => {
    switch (activeTab) {
      case "credentials":
        setAddCredentialOpen(true);
        break;
      case "connectors":
        setAddConnectorOpen(true);
        break;
      // Future: add other dialogs for environments, webhooks
      default:
        break;
    }
  };

  return (
    <TooltipProvider>
    <div className="min-h-screen min-h-dvh bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <Header title="Security & Governance" />

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
                Security & Governance
              </motion.h1>
              <motion.p 
                className="text-muted-foreground mt-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Manage credentials, connectors, environments, and webhooks
              </motion.p>
            </div>
            
            {/* Quick Stats Bar */}
            <motion.div 
              className="responsive-flex"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {[
                { 
                  label: "Active Credentials", 
                  value: stats.activeCredentials, 
                  icon: Key, 
                  color: "from-emerald-500 to-emerald-600",
                  bgColor: "bg-emerald-50"
                },
                { 
                  label: "Expiring Soon", 
                  value: stats.expiringCredentials, 
                  icon: AlertTriangle, 
                  color: stats.expiringCredentials > 0 ? "from-amber-500 to-amber-600" : "from-slate-400 to-slate-500",
                  bgColor: stats.expiringCredentials > 0 ? "bg-amber-50" : "bg-slate-50",
                  pulse: stats.expiringCredentials > 0
                },
                { 
                  label: "Connected", 
                  value: stats.connectedServices, 
                  icon: Link2, 
                  color: "from-blue-500 to-blue-600",
                  bgColor: "bg-blue-50"
                },
                { 
                  label: "Healthy Envs", 
                  value: stats.healthyEnvironments, 
                  icon: Globe, 
                  color: "from-violet-500 to-violet-600",
                  bgColor: "bg-violet-50"
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
                        animate={stat.pulse ? { scale: [1, 1.05, 1] } : undefined}
                        transition={stat.pulse ? { duration: 2, repeat: Infinity } : undefined}
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

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <motion.div 
            variants={itemVariants}
            className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4"
          >
            <TabsList className="bg-white/80 backdrop-blur-sm border border-slate-200/60 p-1.5 rounded-xl shadow-lg shadow-slate-200/50">
              {[
                { value: "credentials", icon: Key, label: "Credentials" },
                { value: "connectors", icon: Link2, label: "Connectors" },
                { value: "environments", icon: Globe, label: "Environments" },
                { value: "webhooks", icon: Webhook, label: "Webhooks" },
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
                    whileHover={{ scale: 1.15 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <tab.icon className="w-4 h-4" />
                  </motion.div>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <motion.div 
              initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex flex-wrap items-center gap-3"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64 bg-white/80 backdrop-blur-sm border-slate-200"
                />
              </div>
              
              <ViewToggle 
                view={
                  activeTab === "credentials" ? credentialsView :
                  activeTab === "connectors" ? connectorsView :
                  activeTab === "environments" ? environmentsView :
                  webhooksView
                } 
                onViewChange={
                  activeTab === "credentials" ? setCredentialsView :
                  activeTab === "connectors" ? setConnectorsView :
                  activeTab === "environments" ? setEnvironmentsView :
                  setWebhooksView
                } 
              />
              
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button 
                  size="sm" 
                  onClick={handleAddButtonClick}
                  className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0052cc] hover:from-[#0052cc] hover:to-[#003d99] text-white transition-all duration-300 shadow-lg shadow-blue-200/50 hover:shadow-xl hover:shadow-blue-300/50"
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
            </motion.div>
          </motion.div>

          {/* Credentials Tab */}
          <TabsContent value="credentials" className="space-y-4">
            {/* Filters */}
            <motion.div 
              variants={itemVariants}
              className="flex flex-wrap items-center gap-3 mb-4"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="w-4 h-4" />
                <span>Filters:</span>
              </div>
              <Select value={credentialTypeFilter} onValueChange={setCredentialTypeFilter}>
                <SelectTrigger className="w-32 h-9 bg-white/80">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="OAuth2">OAuth2</SelectItem>
                  <SelectItem value="Basic Auth">Basic Auth</SelectItem>
                  <SelectItem value="Username & API Key">Username & API Key</SelectItem>
                  <SelectItem value="Username & Token">Username & Token</SelectItem>
                  <SelectItem value="GitHub App">GitHub App</SelectItem>
                </SelectContent>
              </Select>
              <Select value={credentialStatusFilter} onValueChange={setCredentialStatusFilter}>
                <SelectTrigger className="w-32 h-9 bg-white/80">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={credentialWorkstreamFilter} onValueChange={setCredentialWorkstreamFilter}>
                <SelectTrigger className="w-40 h-9 bg-white/80">
                  <SelectValue placeholder="Workstream" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Workstreams</SelectItem>
                  {workstreams.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveCredentialFilters && (
                <Button
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setCredentialTypeFilter("all"); setCredentialStatusFilter("all"); setCredentialWorkstreamFilter("all"); }}
                  className="gap-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                  Clear
                </Button>
              )}
            </motion.div>

            {credentialsLoading ? (
              <motion.div 
                variants={itemVariants}
                className="flex items-center justify-center py-12 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60"
              >
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading credentials...</span>
              </motion.div>
            ) : filteredCredentials.length === 0 ? (
              <motion.div 
                variants={itemVariants}
                className="flex flex-col items-center justify-center py-12 bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60"
              >
                <Key className="w-12 h-12 text-slate-300 mb-3" />
                <h3 className="text-lg font-medium text-slate-600">No credentials found</h3>
                <p className="text-sm text-slate-400 mt-1">
                  {searchQuery || hasActiveCredentialFilters 
                    ? "Try adjusting your filters or search query" 
                    : "Add your first credential to get started"}
                </p>
                {!searchQuery && !hasActiveCredentialFilters && (
                  <Button 
                    size="sm" 
                    onClick={() => setAddCredentialOpen(true)}
                    className="mt-4 gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Credential
                  </Button>
                )}
              </motion.div>
            ) : credentialsView === "table" ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-lg shadow-slate-200/30 overflow-hidden"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold">Name</TableHead>
                      <TableHead className="font-semibold">Auth Type</TableHead>
                      <TableHead className="font-semibold">Category</TableHead>
                      <TableHead className="font-semibold">Workstreams</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Expires</TableHead>
                      <TableHead className="font-semibold">Last Used</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCredentials.map((credential, index) => {
                      const expiryStatus = getExpiryStatus(credential.expires_at);
                      return (
                      <motion.tr
                        key={credential.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group hover:bg-blue-50/50 transition-colors cursor-pointer"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center",
                              credential.status === "active" ? "bg-emerald-100" : 
                              credential.status === "pending" ? "bg-amber-100" : "bg-red-100"
                            )}>
                              <Key className={cn(
                                "w-4 h-4",
                                credential.status === "active" ? "text-emerald-600" : 
                                credential.status === "pending" ? "text-amber-600" : "text-red-600"
                              )} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800">{credential.name}</span>
                                {expiryStatus?.urgent && (
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                )}
                              </div>
                              <p className="text-xs text-slate-500">{credential.connector}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                            {authTypeDisplayMap[credential.auth_type] || credential.auth_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-600">{credential.category}</TableCell>
                        <TableCell>
                          {credential.workstreams && credential.workstreams.length > 0 ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {credential.workstreams.slice(0, 2).map((ws) => (
                                <Badge 
                                  key={ws.id} 
                                  variant="secondary" 
                                  className="bg-blue-50 text-blue-700 text-xs"
                                >
                                  {ws.name}
                                </Badge>
                              ))}
                              {credential.workstreams.length > 2 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge 
                                      variant="secondary" 
                                      className="bg-slate-100 text-slate-600 text-xs cursor-help"
                                    >
                                      +{credential.workstreams.length - 2}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <p className="text-xs">
                                      {credential.workstreams.slice(2).map(ws => ws.name).join(", ")}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            "gap-1",
                            credential.status === "active" 
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" 
                              : credential.status === "pending"
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              : "bg-red-100 text-red-700 hover:bg-red-100"
                          )}>
                            <Lock className="w-3 h-3" />
                            {credential.status.charAt(0).toUpperCase() + credential.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {expiryStatus ? (
                            <Badge className={cn("gap-1", expiryStatus.color)}>
                              {expiryStatus.label}
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-sm">No expiry</span>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500">{formatLastUsed(credential.last_used_at)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                className="gap-2"
                                onClick={() => handleEditCredential(credential)}
                              >
                                <Pencil className="w-4 h-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="gap-2"
                                onClick={() => handleRotateCredential(credential)}
                              >
                                <RefreshCw className="w-4 h-4" />
                                Rotate
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="gap-2 text-destructive"
                                onClick={() => handleDeleteCredential(credential)}
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                      );
                    })}
                  </TableBody>
                </Table>
              </motion.div>
            ) : (
              <div className="responsive-grid-lg">
                {filteredCredentials.map((credential, index) => {
                  const expiryStatus = getExpiryStatus(credential.expires_at);
                  return (
                  <motion.div
                    key={credential.id}
                    variants={cardHoverVariants}
                    initial="rest"
                    whileHover="hover"
                    custom={index}
                    className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 cursor-pointer shadow-lg shadow-slate-200/30"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center",
                          credential.status === "active" ? "bg-emerald-100" : 
                          credential.status === "pending" ? "bg-amber-100" : "bg-red-100"
                        )}>
                          <Key className={cn(
                            "w-5 h-5",
                            credential.status === "active" ? "text-emerald-600" : 
                            credential.status === "pending" ? "text-amber-600" : "text-red-600"
                          )} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-800">
                              {credential.name}
                            </h3>
                            {expiryStatus?.urgent && (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{credential.connector}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                              {authTypeDisplayMap[credential.auth_type] || credential.auth_type}
                            </Badge>
                            <Badge className={cn(
                              "gap-1 text-xs",
                              credential.status === "active" 
                                ? "bg-emerald-100 text-emerald-700" 
                                : credential.status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                            )}>
                              <Lock className="w-2.5 h-2.5" />
                              {credential.status.charAt(0).toUpperCase() + credential.status.slice(1)}
                            </Badge>
                            {expiryStatus && (
                              <Badge className={cn("gap-1 text-xs", expiryStatus.color)}>
                                {expiryStatus.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            className="gap-2"
                            onClick={() => handleEditCredential(credential)}
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="gap-2"
                            onClick={() => handleRotateCredential(credential)}
                          >
                            <RefreshCw className="w-4 h-4" />
                            Rotate
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="gap-2 text-destructive"
                            onClick={() => handleDeleteCredential(credential)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex flex-col gap-2 text-sm text-slate-500 pt-3 border-t border-slate-100">
                      {/* Workstreams display */}
                      {credential.workstreams && credential.workstreams.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-600 font-medium">Workstreams:</span>
                          {credential.workstreams.slice(0, 2).map((ws) => (
                            <Badge 
                              key={ws.id} 
                              variant="secondary" 
                              className="bg-blue-50 text-blue-700 text-xs"
                            >
                              {ws.name}
                            </Badge>
                          ))}
                          {credential.workstreams.length > 2 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="secondary" 
                                  className="bg-slate-100 text-slate-600 text-xs cursor-help"
                                >
                                  +{credential.workstreams.length - 2}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">
                                  {credential.workstreams.slice(2).map(ws => ws.name).join(", ")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span>Category: {credential.category}</span>
                        <span>Last used: {formatLastUsed(credential.last_used_at)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Expires:</span>
                        {expiryStatus ? (
                          <Badge className={cn("gap-1 text-xs", expiryStatus.color)}>
                            <Calendar className="w-3 h-3" />
                            {expiryStatus.label}
                          </Badge>
                        ) : (
                          <span className="text-slate-400">No expiry</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Connectors Tab */}
          <TabsContent value="connectors" className="space-y-6">
            {/* Connector Quick Stats */}
            <motion.div 
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {[
                { 
                  label: "Connected", 
                  value: stats.connectedServices, 
                  icon: Link2, 
                  color: "from-emerald-500 to-emerald-600",
                  bgColor: "bg-emerald-50"
                },
                { 
                  label: "Disconnected", 
                  value: stats.disconnectedServices, 
                  icon: AlertTriangle, 
                  color: stats.disconnectedServices > 0 ? "from-red-500 to-red-600" : "from-slate-400 to-slate-500",
                  bgColor: stats.disconnectedServices > 0 ? "bg-red-50" : "bg-slate-50",
                  pulse: stats.disconnectedServices > 0
                },
                { 
                  label: "Healthy", 
                  value: stats.healthyConnectors, 
                  icon: CheckCircle, 
                  color: "from-blue-500 to-blue-600",
                  bgColor: "bg-blue-50"
                },
                { 
                  label: "Total Syncs", 
                  value: stats.totalSyncs.toLocaleString(), 
                  icon: Activity, 
                  color: "from-violet-500 to-violet-600",
                  bgColor: "bg-violet-50"
                },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  custom={index}
                  variants={statsCardVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover={{ scale: 1.02, y: -2 }}
                  className={cn(
                    "relative overflow-hidden rounded-xl p-4 border border-slate-200/60",
                    stat.bgColor
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{stat.label}</p>
                      <p className={cn(
                        "text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent mt-1",
                        stat.color
                      )}>
                        {stat.value}
                      </p>
                    </div>
                    <motion.div 
                      className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        stat.bgColor
                      )}
                      animate={stat.pulse ? { scale: [1, 1.1, 1] } : {}}
                      transition={stat.pulse ? { repeat: Infinity, duration: 2 } : {}}
                    >
                      <stat.icon className={cn(
                        "w-5 h-5 bg-gradient-to-r bg-clip-text",
                        stat.color.replace("from-", "text-").split(" ")[0]
                      )} />
                    </motion.div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Filters */}
            <motion.div 
              variants={itemVariants}
              className="flex flex-wrap items-center gap-3"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="w-4 h-4" />
                <span>Filters:</span>
              </div>
              <Select value={connectorStatusFilter} onValueChange={setConnectorStatusFilter}>
                <SelectTrigger className="w-36 h-9 bg-white/80 border-slate-200/60">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="disconnected">Disconnected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={connectorTypeFilter} onValueChange={setConnectorTypeFilter}>
                <SelectTrigger className="w-44 h-9 bg-white/80 border-slate-200/60">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {connectorTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveConnectorFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setConnectorStatusFilter("all");
                    setConnectorTypeFilter("all");
                  }}
                  className="gap-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                  Clear
                </Button>
              )}
              <div className="ml-auto text-sm text-muted-foreground">
                {filteredConnectors.length} of {connectors.length} connectors
              </div>
            </motion.div>

            {connectorsView === "table" ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-lg shadow-slate-200/30 overflow-hidden"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold">Connector</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Health</TableHead>
                      <TableHead className="font-semibold">Syncs</TableHead>
                      <TableHead className="font-semibold">Last Sync</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {filteredConnectors.map((connector, index) => (
                        <motion.tr
                          key={connector.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ delay: index * 0.03, type: "spring", stiffness: 300, damping: 24 }}
                          className="group hover:bg-blue-50/50 transition-colors cursor-pointer"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <motion.div 
                                whileHover={{ scale: 1.1, rotate: 5 }}
                                className={cn(
                                  "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                                  connector.status === "connected" 
                                    ? "bg-gradient-to-br from-emerald-100 to-emerald-200" 
                                    : "bg-gradient-to-br from-slate-100 to-slate-200"
                                )}
                              >
                                <Link2 className={cn(
                                  "w-5 h-5",
                                  connector.status === "connected" ? "text-emerald-600" : "text-slate-400"
                                )} />
                              </motion.div>
                              <div>
                                <span className="font-semibold text-slate-800">{connector.name}</span>
                                {connector.description && (
                                  <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{connector.description}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                              {connector.connector_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn(
                              "gap-1.5",
                              connector.status === "connected" 
                                ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" 
                                : "bg-red-100 text-red-600 hover:bg-red-100"
                            )}>
                              {connector.status === "connected" ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <X className="w-3 h-3" />
                              )}
                              {connector.status === "connected" ? "Connected" : "Disconnected"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <motion.div 
                                className={cn(
                                  "w-2 h-2 rounded-full",
                                  connector.health === "healthy" ? "bg-emerald-500" :
                                  connector.health === "warning" ? "bg-amber-500" : "bg-red-500"
                                )}
                                animate={connector.health !== "healthy" ? { scale: [1, 1.2, 1] } : {}}
                                transition={{ repeat: Infinity, duration: 2 }}
                              />
                              <span className={cn(
                                "text-sm capitalize",
                                connector.health === "healthy" ? "text-emerald-600" :
                                connector.health === "warning" ? "text-amber-600" : "text-red-600"
                              )}>
                                {connector.health}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5 text-blue-500" />
                              <span className="text-slate-600 font-medium">{connector.sync_count.toLocaleString()}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-500">{formatLastSync(connector.last_sync_at)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem className="gap-2" onClick={() => handleEditConnector(connector)}>
                                  <Pencil className="w-4 h-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="gap-2" 
                                  onClick={() => handleTestConnectorFromList(connector)}
                                  disabled={testingConnectorId === connector.id}
                                >
                                  {testingConnectorId === connector.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Zap className="w-4 h-4" />
                                  )}
                                  {testingConnectorId === connector.id ? "Testing..." : "Test Connection"}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2">
                                  <RefreshCw className="w-4 h-4" />
                                  Sync Now
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-destructive" onClick={() => handleDeleteConnector(connector)}>
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </motion.div>
            ) : (
              <motion.div 
                className="responsive-grid-lg"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
              >
                <AnimatePresence mode="popLayout">
                  {filteredConnectors.map((connector, index) => (
                    <motion.div
                      key={connector.id}
                      variants={cardHoverVariants}
                      initial="rest"
                      whileHover="hover"
                      layout
                      className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 cursor-pointer shadow-lg shadow-slate-200/30 overflow-hidden"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <motion.div 
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          className={cn(
                            "w-14 h-14 rounded-xl flex items-center justify-center shadow-sm",
                            connector.status === "connected" 
                              ? "bg-gradient-to-br from-emerald-100 to-emerald-200" 
                              : "bg-gradient-to-br from-slate-100 to-slate-200"
                          )}
                        >
                          <Link2 className={cn(
                            "w-7 h-7",
                            connector.status === "connected" ? "text-emerald-600" : "text-slate-400"
                          )} />
                        </motion.div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem className="gap-2" onClick={() => handleEditConnector(connector)}>
                              <Pencil className="w-4 h-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="gap-2" 
                              onClick={() => handleTestConnectorFromList(connector)}
                              disabled={testingConnectorId === connector.id}
                            >
                              {testingConnectorId === connector.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Zap className="w-4 h-4" />
                              )}
                              {testingConnectorId === connector.id ? "Testing..." : "Test Connection"}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                              <RefreshCw className="w-4 h-4" />
                              Sync Now
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-destructive" onClick={() => handleDeleteConnector(connector)}>
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      <div className="mb-3">
                        <h3 className="font-semibold text-slate-800 text-lg">{connector.name}</h3>
                        {connector.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{connector.description}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                          {connector.connector_type}
                        </Badge>
                        <Badge className={cn(
                          "gap-1 text-xs",
                          connector.status === "connected" 
                            ? "bg-emerald-100 text-emerald-700" 
                            : "bg-red-100 text-red-600"
                        )}>
                          {connector.status === "connected" ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <X className="w-3 h-3" />
                          )}
                          {connector.status === "connected" ? "Connected" : "Disconnected"}
                        </Badge>
                      </div>

                      <div className="pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Health</span>
                          <div className="flex items-center gap-2">
                            <motion.div 
                              className={cn(
                                "w-2 h-2 rounded-full",
                                connector.health === "healthy" ? "bg-emerald-500" :
                                connector.health === "warning" ? "bg-amber-500" : "bg-red-500"
                              )}
                              animate={connector.health !== "healthy" ? { scale: [1, 1.2, 1] } : {}}
                              transition={{ repeat: Infinity, duration: 2 }}
                            />
                            <span className={cn(
                              "capitalize font-medium",
                              connector.health === "healthy" ? "text-emerald-600" :
                              connector.health === "warning" ? "text-amber-600" : "text-red-600"
                            )}>
                              {connector.health}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Total Syncs</span>
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-slate-700 font-medium">{connector.sync_count.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500">Last Sync</span>
                          <span className="text-slate-600">{formatLastSync(connector.last_sync_at)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </TabsContent>

          {/* Environments Tab */}
          <TabsContent value="environments" className="space-y-4">
            {/* Filters */}
            <motion.div 
              variants={itemVariants}
              className="flex flex-wrap items-center gap-3 mb-4"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="w-4 h-4" />
                <span>Filters:</span>
              </div>
              <Select value={environmentTypeFilter} onValueChange={setEnvironmentTypeFilter}>
                <SelectTrigger className="w-36 h-9 bg-white/80">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveEnvironmentFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setEnvironmentTypeFilter("all")}
                  className="gap-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                  Clear
                </Button>
              )}
            </motion.div>

            {environmentsView === "table" ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-lg shadow-slate-200/30 overflow-hidden"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold">Environment</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">URL</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEnvironments.map((env, index) => (
                      <motion.tr
                        key={env.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group hover:bg-blue-50/50 transition-colors cursor-pointer"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-3 h-3 rounded-full",
                              env.status === "healthy" && "bg-emerald-500",
                              env.status === "degraded" && "bg-amber-500",
                              env.status === "offline" && "bg-red-500"
                            )} />
                            <span className="font-medium text-slate-800">{env.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            "uppercase text-xs",
                            env.type === "production" && "bg-red-100 text-red-700",
                            env.type === "staging" && "bg-amber-100 text-amber-700",
                            env.type === "development" && "bg-blue-100 text-blue-700"
                          )}>
                            {env.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-slate-600">
                            <Globe className="w-3.5 h-3.5" />
                            <span className="font-mono text-sm">{env.url}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            env.status === "healthy" && "bg-emerald-100 text-emerald-700",
                            env.status === "degraded" && "bg-amber-100 text-amber-700",
                            env.status === "offline" && "bg-red-100 text-red-700"
                          )}>
                            {env.status === "healthy" ? "Healthy" : env.status === "degraded" ? "Degraded" : "Offline"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="gap-2">
                                  <Pencil className="w-4 h-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </motion.div>
            ) : (
              <div className="responsive-grid-lg">
                {filteredEnvironments.map((env, index) => (
                  <motion.div
                    key={env.id}
                    variants={cardHoverVariants}
                    initial="rest"
                    whileHover="hover"
                    className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 cursor-pointer shadow-lg shadow-slate-200/30"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-3 h-3 rounded-full",
                        env.status === "healthy" && "bg-emerald-500",
                        env.status === "degraded" && "bg-amber-500",
                        env.status === "offline" && "bg-red-500"
                      )} />
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-slate-800">
                            {env.name}
                          </h3>
                          <Badge className={cn(
                            "uppercase text-xs",
                            env.type === "production" && "bg-red-100 text-red-700",
                            env.type === "staging" && "bg-amber-100 text-amber-700",
                            env.type === "development" && "bg-blue-100 text-blue-700"
                          )}>
                            {env.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5" />
                          {env.url}
                        </p>
                      </div>
                      <Badge className={cn(
                        env.status === "healthy" && "bg-emerald-100 text-emerald-700",
                        env.status === "degraded" && "bg-amber-100 text-amber-700",
                        env.status === "offline" && "bg-red-100 text-red-700"
                      )}>
                        {env.status === "healthy" ? "Healthy" : env.status === "degraded" ? "Degraded" : "Offline"}
                      </Badge>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="space-y-4">
            {/* Filters */}
            <motion.div 
              variants={itemVariants}
              className="flex flex-wrap items-center gap-3 mb-4"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="w-4 h-4" />
                <span>Filters:</span>
              </div>
              <Select value={webhookStatusFilter} onValueChange={setWebhookStatusFilter}>
                <SelectTrigger className="w-32 h-9 bg-white/80">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {hasActiveWebhookFilters && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setWebhookStatusFilter("all")}
                  className="gap-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                  Clear
                </Button>
              )}
            </motion.div>

            {webhooksView === "table" ? (
              <motion.div 
                variants={itemVariants}
                className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-lg shadow-slate-200/30 overflow-hidden"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="font-semibold">Webhook</TableHead>
                      <TableHead className="font-semibold">Events</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Last Triggered</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWebhooks.map((webhook, index) => (
                      <motion.tr
                        key={webhook.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="group hover:bg-blue-50/50 transition-colors cursor-pointer"
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center",
                              webhook.status === "active" ? "bg-emerald-100" : "bg-slate-100"
                            )}>
                              <Webhook className={cn(
                                "w-4 h-4",
                                webhook.status === "active" ? "text-emerald-600" : "text-slate-400"
                              )} />
                            </div>
                            <div>
                              <span className="font-medium text-slate-800 block">{webhook.name}</span>
                              <span className="text-xs text-slate-400 font-mono">{webhook.url}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {webhook.events.map((event) => (
                              <Badge key={event} variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                                {event}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            "gap-1",
                            webhook.status === "active" 
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" 
                              : "bg-slate-100 text-slate-500 hover:bg-slate-100"
                          )}>
                            <Zap className="w-3 h-3" />
                            {webhook.status === "active" ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">{webhook.lastTriggered}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="gap-2">
                                <Pencil className="w-4 h-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2">
                                <Zap className="w-4 h-4" />
                                Test
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2 text-destructive">
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </motion.div>
            ) : (
              <div className="responsive-grid-lg">
                {filteredWebhooks.map((webhook, index) => (
                  <motion.div
                    key={webhook.id}
                    variants={cardHoverVariants}
                    initial="rest"
                    whileHover="hover"
                    className="bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-5 shadow-lg shadow-slate-200/30"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center",
                        webhook.status === "active" ? "bg-emerald-100" : "bg-slate-100"
                      )}>
                        <Webhook className={cn(
                          "w-5 h-5",
                          webhook.status === "active" ? "text-emerald-600" : "text-slate-400"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800">{webhook.name}</h3>
                        <p className="text-sm text-slate-400 truncate font-mono">{webhook.url}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {webhook.events.map((event) => (
                            <Badge key={event} variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                              {event}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={cn(
                          "gap-1 mb-2",
                          webhook.status === "active" 
                            ? "bg-emerald-100 text-emerald-700" 
                            : "bg-slate-100 text-slate-500"
                        )}>
                          <Zap className="w-3 h-3" />
                          {webhook.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                        <p className="text-xs text-slate-500">Last: {webhook.lastTriggered}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Add Credential Dialog */}
      <AddCredentialDialog
        open={addCredentialOpen}
        onOpenChange={setAddCredentialOpen}
        onSave={(data) => {
          console.log("Credential saved:", data);
        }}
      />

      {/* Edit Credential Dialog */}
      <EditCredentialDialog
        open={editCredentialOpen}
        onOpenChange={setEditCredentialOpen}
        credential={selectedCredential}
        onSave={() => {
          // Refetch credentials to immediately update the table
          refetchCredentials();
          setSelectedCredential(null);
        }}
      />

      {/* Rotate Credential Dialog */}
      <RotateCredentialDialog
        open={rotateCredentialOpen}
        onOpenChange={setRotateCredentialOpen}
        credential={selectedCredential}
        onSuccess={() => {
          setSelectedCredential(null);
        }}
      />

      {/* Delete Credential Dialog */}
      <DeleteCredentialDialog
        open={deleteCredentialOpen}
        onOpenChange={setDeleteCredentialOpen}
        credential={selectedCredential}
        onSuccess={() => {
          setSelectedCredential(null);
        }}
      />

      {/* Add Connector Dialog */}
      <AddConnectorDialog
        open={addConnectorOpen}
        onOpenChange={setAddConnectorOpen}
        onSave={(data) => {
          if (!selectedAccount?.id || !selectedEnterprise?.id) return;
          createConnector.mutate({
            name: data.name,
            description: data.description,
            connector_tool: data.connector || "",
            connector_type: data.category || "",
            category: data.category || "",
            url: data.url,
            account_id: selectedAccount.id,
            enterprise_id: selectedEnterprise.id,
            product_id: data.product_id,
            service_id: data.service_id,
            credential_id: data.credential_id,
            workstream_ids: data.workstream_ids,
          });
        }}
      />

      {/* Edit Connector Dialog */}
      <EditConnectorDialog
        connector={selectedConnector}
        open={editConnectorOpen}
        onOpenChange={setEditConnectorOpen}
        onSave={async (id, data) => {
          await updateConnector.mutateAsync({ id, ...data });
          setSelectedConnector(null);
        }}
        onHealthUpdated={() => refetchConnectors()}
      />

      {/* Delete Connector Dialog */}
      <DeleteConnectorDialog
        connector={selectedConnector}
        open={deleteConnectorOpen}
        onOpenChange={setDeleteConnectorOpen}
        onConfirm={async (id) => {
          await deleteConnector.mutateAsync(id);
          setSelectedConnector(null);
        }}
      />
    </div>
    </TooltipProvider>
  );
}
