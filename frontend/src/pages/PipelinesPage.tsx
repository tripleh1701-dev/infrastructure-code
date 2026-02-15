import { useState, useMemo } from "react";
import { usePipelineBuildLinks } from "@/hooks/usePipelineBuildLinks";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { PermissionGate, usePermissionCheck } from "@/components/auth/PermissionGate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GitBranch,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle,
  Clock,
  
  Sparkles,
  LayoutTemplate,
  Play,
  Eye,
  Settings2,
  TrendingUp,
  Layers,
  Activity,
  Zap,
  ArrowUpRight,
  Globe,
  Server,
  Smartphone,
  Building2,
  Database,
  Cloud,
  Loader2,
  Wand2,
  ArrowRight,
  Tablet,
  Code2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewToggle } from "@/components/ui/view-toggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import { SmartPipelineProjectType, SmartPipelineConfig, DeploymentType } from "@/types/pipeline";
import { SMART_PIPELINE_TYPES, PIPELINE_TEMPLATES } from "@/constants/pipeline";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { FilterContextIndicator } from "@/components/layout/FilterContextIndicator";
import { toast } from "sonner";
import { usePipelines, Pipeline as DbPipeline } from "@/hooks/usePipelines";
import { formatDistanceToNow } from "date-fns";

// ============== Types ==============
interface CreateTemplateForm {
  name: string;
  description: string;
  enterpriseId: string;
  entity: string;
  deploymentType: DeploymentType;
}

// Status color mapping for DB pipelines
const statusColorMap: Record<string, string> = {
  draft: "#64748b",
  active: "#10b981",
  inactive: "#f59e0b",
  archived: "#94a3b8",
};

// Cycle through colors for visual variety
const pipelineColors = ["#0171EC", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4"];

const statusConfig: Record<string, { icon: React.ElementType; label: string; className: string }> = {
  draft: { icon: Clock, label: "Draft", className: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  active: { icon: CheckCircle, label: "Active", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  inactive: { icon: Clock, label: "Inactive", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  archived: { icon: Clock, label: "Archived", className: "bg-slate-500/10 text-slate-400 border-slate-400/20" },
};

const smartPipelineIconMap: Record<string, React.ElementType> = {
  Globe,
  Server,
  Smartphone,
  Building2,
  Database,
  Cloud,
};

const templateIconMap: Record<string, React.ElementType> = {
  Layers,
  Building2,
  Smartphone,
  Tablet,
  Code2,
  Server,
};

const frameworkOptions: Record<SmartPipelineProjectType, string[]> = {
  web_app: ["React", "Vue.js", "Angular", "Next.js", "Svelte"],
  api_microservice: ["Node.js", "Python", "Java Spring", "Go", ".NET Core"],
  mobile: ["React Native", "Flutter", "Swift", "Kotlin", "Ionic"],
  sap_extension: ["CAP", "UI5", "Fiori", "ABAP"],
  data_pipeline: ["Apache Spark", "Airflow", "dbt", "Databricks"],
  infrastructure: ["Terraform", "CloudFormation", "Pulumi", "Ansible"],
};

const deploymentOptions = [
  "Kubernetes",
  "Docker Swarm",
  "AWS ECS",
  "Azure Container Apps",
  "Cloud Foundry",
  "Serverless",
];

// Animation variants with proper typing
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

// Template colors (since original templates don't have colors)
const templateColors: Record<string, string> = {
  'sap-integration-suite': '#0171EC',
  'sap-s4hana-extension': '#8b5cf6',
  'fiori-app': '#ec4899',
  'mobile-services': '#f59e0b',
  'bas-devspace': '#06b6d4',
  'abap-cloud': '#10b981',
};

// Smart pipeline type colors
const smartTypeColors: Record<string, string> = {
  web_app: '#3b82f6',
  api_microservice: '#10b981',
  mobile: '#f59e0b',
  sap_extension: '#8b5cf6',
  data_pipeline: '#ec4899',
  infrastructure: '#06b6d4',
};

export default function PipelinesPage() {
  const navigate = useNavigate();
  const { enterprises } = useEnterpriseContext();
  const { canCreate, canEdit, canDelete, hasAccess } = usePermissionCheck("pipelines");
  const { pipelines: dbPipelines, isLoading: pipelinesLoading, deletePipeline, isDeleting } = usePipelines();
  const { isPipelineLinked, getLinkedBuildJobs } = usePipelineBuildLinks();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pipelineToDelete, setPipelineToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDeletePipeline = async () => {
    if (!pipelineToDelete) return;
    // Block if linked
    if (isPipelineLinked(pipelineToDelete.name)) {
      toast.error("Cannot delete: This pipeline is linked to build jobs. Unlink it from existing builds first.");
      return;
    }
    try {
      await deletePipeline(pipelineToDelete.id);
      setDeleteDialogOpen(false);
      setPipelineToDelete(null);
    } catch (e) {
      // error toast handled by hook
    }
  };

  const handleTryDeletePipeline = (id: string, name: string) => {
    if (isPipelineLinked(name)) {
      const linkedJobs = getLinkedBuildJobs(name);
      toast.warning(
        `This pipeline is linked to ${linkedJobs.length} build job(s): ${linkedJobs.join(", ")}. Unlink it from existing builds before deleting.`,
        { duration: 5000 }
      );
      return;
    }
    setPipelineToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleTryEditPipeline = (id: string, name: string) => {
    if (isPipelineLinked(name)) {
      // Allow viewing in read-only mode
      navigate(`/pipelines/canvas?id=${id}&mode=edit`);
      return;
    }
    navigate(`/pipelines/canvas?id=${id}&mode=edit`);
  };

  // Tab state
  const [activeTab, setActiveTab] = useState("pipelines");
  
  // My Pipelines state
  const [searchQuery, setSearchQuery] = useState("");
  const [pipelinesView, setPipelinesView] = useViewPreference("pipelines", "tile");
  const [hoveredPipeline, setHoveredPipeline] = useState<string | null>(null);

  // Smart Pipeline state
  const [smartStep, setSmartStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationComplete, setGenerationComplete] = useState(false);
  const [smartConfig, setSmartConfig] = useState<SmartPipelineConfig>({
    projectType: "web_app",
    projectName: "",
    repository: "",
    framework: "",
    deployment: "",
  });

  // Templates state
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [templateFormData, setTemplateFormData] = useState<CreateTemplateForm>({
    name: "",
    description: "",
    enterpriseId: "",
    entity: "",
    deploymentType: "Integration",
  });

  // Map DB pipelines to display format
  const displayPipelines = useMemo(() => dbPipelines.map((p, i) => ({
    id: p.id,
    name: p.name,
    type: p.deployment_type || "Pipeline",
    description: p.description || "",
    status: p.status as string,
    color: pipelineColors[i % pipelineColors.length],
    lastRun: formatDistanceToNow(new Date(p.updated_at), { addSuffix: true }),
    nodes: Array.isArray(p.nodes) ? (p.nodes as unknown[]).length : 0,
  })), [dbPipelines]);

  // Computed values
  const filteredPipelines = displayPipelines.filter((pipeline) =>
    pipeline.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activePipelines = displayPipelines.filter(p => p.status === "active").length;
  const draftPipelines = displayPipelines.filter(p => p.status === "draft").length;
  const totalPipelines = displayPipelines.length;

  const selectedSmartType = SMART_PIPELINE_TYPES.find((t) => t.id === smartConfig.projectType);

  const templateCategories = ["all", ...new Set(PIPELINE_TEMPLATES.map((t) => t.category))];
  const filteredTemplates = PIPELINE_TEMPLATES.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(templateSearchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(templateSearchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Handlers
  const handleSmartGenerate = async () => {
    setIsGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    setIsGenerating(false);
    setGenerationComplete(true);
    toast.success("Pipeline generated successfully!");
  };

  const handleSmartOpenCanvas = () => {
    navigate(`/pipelines/canvas?mode=create&name=${encodeURIComponent(smartConfig.projectName)}&smart=true`);
  };

  const handleUseTemplate = (templateId: string) => {
    navigate(`/pipelines/canvas?template=${templateId}&mode=create`);
  };

  const handleCreateTemplate = () => {
    if (!templateFormData.name) {
      toast.error("Please enter a template name");
      return;
    }
    toast.success("Template created successfully");
    setCreateDialogOpen(false);
    navigate(`/pipelines/canvas?mode=create&name=${encodeURIComponent(templateFormData.name)}`);
  };

  const resetSmartPipeline = () => {
    setSmartStep(1);
    setIsGenerating(false);
    setGenerationComplete(false);
    setSmartConfig({
      projectType: "web_app",
      projectName: "",
      repository: "",
      framework: "",
      deployment: "",
    });
  };

  return (
    <PermissionGate menuKey="pipelines">
      <TooltipProvider>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
          <Header title="Pipelines" subtitle="Build, configure, and manage CI/CD pipelines" />

        <motion.div
          className="p-6"
          variants={pageVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Stats */}
          <motion.div variants={itemVariants} className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-end gap-6">

              {/* Quick Stats Bar */}
              <motion.div
                className="flex flex-wrap gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {[
                  { label: "Total", value: totalPipelines, icon: Layers, color: "#8b5cf6", bgColor: "bg-violet-50" },
                  { label: "Active", value: activePipelines, icon: Activity, color: "#10b981", bgColor: "bg-emerald-50" },
                  { label: "Draft", value: draftPipelines, icon: Clock, color: "#f59e0b", bgColor: "bg-amber-50" },
                ].map((stat, i) => (
                  <Tooltip key={stat.label}>
                    <TooltipTrigger asChild>
                      <motion.div
                        custom={i}
                        variants={statsCardVariants}
                        initial="hidden"
                        animate="visible"
                        whileHover={{ scale: 1.05, y: -2 }}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/50 backdrop-blur-sm cursor-default",
                          stat.bgColor,
                          "shadow-sm hover:shadow-md transition-shadow duration-300"
                        )}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-sm"
                          style={{ background: `linear-gradient(135deg, ${stat.color}, ${stat.color}cc)` }}
                        >
                          <stat.icon className="w-4 h-4" />
                        </div>
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

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(tab) => {
            setActiveTab(tab);
            if (tab === "smart") resetSmartPipeline();
          }}>
            <motion.div
              variants={itemVariants}
              className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4"
            >
              <TabsList className="bg-white/80 backdrop-blur-sm border border-slate-200/60 p-1.5 rounded-xl shadow-lg shadow-slate-200/50">
                {[
                  { value: "pipelines", icon: GitBranch, label: "My Pipelines" },
                  { value: "smart", icon: Sparkles, label: "Smart Pipeline" },
                  { value: "templates", icon: LayoutTemplate, label: "Templates" },
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

              {/* Tab-specific actions */}
              <AnimatePresence mode="wait">
                {activeTab === "pipelines" && (
                  <motion.div
                    key="pipelines-actions"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3"
                  >
                    <ViewToggle view={pipelinesView} onViewChange={setPipelinesView} />
                    {canCreate && (
                      <Button
                        size="sm"
                        className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0891b2] hover:opacity-90 text-white shadow-lg shadow-blue-500/25"
                        onClick={() => navigate("/pipelines/canvas?mode=create")}
                      >
                        <Plus className="w-4 h-4" />
                        New Pipeline
                      </Button>
                    )}
                  </motion.div>
                )}
                {activeTab === "templates" && (
                  <motion.div
                    key="templates-actions"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3"
                  >
                    {canCreate && (
                      <Button
                        size="sm"
                        className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0891b2] hover:opacity-90 text-white shadow-lg shadow-blue-500/25"
                        onClick={() => setCreateDialogOpen(true)}
                      >
                        <Plus className="w-4 h-4" />
                        Create Template
                      </Button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ============== My Pipelines Tab ============== */}
            <TabsContent value="pipelines" className="mt-0">
              {/* Search and Filter */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-3 mb-6"
              >
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="search"
                    placeholder="Search pipelines..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-white/80 backdrop-blur-sm border-slate-200 rounded-xl shadow-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="default"
                  className="gap-2 h-11 bg-white/80 backdrop-blur-sm border-slate-200 rounded-xl shadow-sm"
                >
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
              </motion.div>

              {/* Pipeline Grid/Table */}
              {pipelinesLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
              ) : filteredPipelines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <GitBranch className="w-12 h-12 text-slate-300 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-1">No pipelines yet</h3>
                  <p className="text-sm text-slate-500 mb-4">Create your first pipeline to get started</p>
                  {canCreate && (
                    <Button
                      className="gap-2 bg-gradient-to-r from-[#0171EC] to-[#0891b2] text-white"
                      onClick={() => navigate("/pipelines/canvas?mode=create")}
                    >
                      <Plus className="w-4 h-4" />
                      New Pipeline
                    </Button>
                  )}
                </div>
              ) : (
              <AnimatePresence mode="wait">
                {pipelinesView === "tile" ? (
                  <motion.div
                    key="tile"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
                  >
                    {filteredPipelines.map((pipeline, index) => {
                      const status = statusConfig[pipeline.status] || statusConfig.draft;
                      const StatusIcon = status.icon;
                      const isHovered = hoveredPipeline === pipeline.id;

                      return (
                        <motion.div
                          key={pipeline.id}
                          initial={{ opacity: 0, y: 30, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.4, delay: index * 0.05, type: "spring", stiffness: 100 }}
                          onMouseEnter={() => setHoveredPipeline(pipeline.id)}
                          onMouseLeave={() => setHoveredPipeline(null)}
                          className="group relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/80 overflow-hidden shadow-lg shadow-slate-200/50 hover:shadow-2xl transition-all duration-300 cursor-pointer"
                          onClick={() => navigate(`/pipelines/canvas?id=${pipeline.id}&mode=edit`)}
                        >
                          <div
                            className="absolute top-0 left-0 right-0 h-1 opacity-80"
                            style={{ background: `linear-gradient(90deg, ${pipeline.color}, ${pipeline.color}80)` }}
                          />
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: isHovered ? 0.1 : 0 }}
                            className="absolute inset-0 pointer-events-none"
                            style={{ background: `radial-gradient(circle at 50% 0%, ${pipeline.color}, transparent 70%)` }}
                          />

                          <div className="p-5">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <motion.div
                                  className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
                                  style={{
                                    background: `linear-gradient(135deg, ${pipeline.color}20, ${pipeline.color}10)`,
                                    border: `1px solid ${pipeline.color}30`
                                  }}
                                  animate={{ scale: isHovered ? 1.05 : 1 }}
                                >
                                  <GitBranch className="w-6 h-6" style={{ color: pipeline.color }} />
                                </motion.div>
                                <div>
                                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                                    {pipeline.name}
                                  </h3>
                                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pipeline.color }} />
                                    {pipeline.type}
                                  </p>
                                </div>
                              </div>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="w-4 h-4 text-slate-500" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem className="gap-2">
                                    <Play className="w-4 h-4" /> Run Pipeline
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="gap-2">
                                    <Eye className="w-4 h-4" /> View History
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="gap-2">
                                    <Settings2 className="w-4 h-4" /> Settings
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {canDelete && (
                                    <DropdownMenuItem
                                      className="gap-2 text-red-600"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTryDeletePipeline(pipeline.id, pipeline.name);
                                      }}
                                    >
                                       Delete
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            <p className="text-sm text-slate-600 mb-4 line-clamp-2">{pipeline.description}</p>

                            <div className="grid grid-cols-2 gap-2 mb-4">
                              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/50">
                                <p className="text-xl font-bold text-slate-900">{pipeline.nodes}</p>
                                <p className="text-[10px] text-slate-500 uppercase font-semibold">Nodes</p>
                              </div>
                              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/50">
                                <p className="text-xl font-bold text-slate-900 capitalize">{pipeline.status}</p>
                                <p className="text-[10px] text-slate-500 uppercase font-semibold">Status</p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                              <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", status.className)}>
                                <StatusIcon className={cn("w-3 h-3", pipeline.status === "running" && "animate-spin")} />
                                {status.label}
                              </div>
                              <span className="text-xs text-slate-400">{pipeline.lastRun}</span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key="table"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/80 shadow-lg overflow-hidden"
                  >
                    <table className="w-full">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">Pipeline</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">Type</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">Status</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">Nodes</th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">Last Updated</th>
                          <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPipelines.map((pipeline) => {
                          const status = statusConfig[pipeline.status] || statusConfig.draft;
                          const StatusIcon = status.icon;
                          return (
                            <tr
                              key={pipeline.id}
                              className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                              onClick={() => handleTryEditPipeline(pipeline.id, pipeline.name)}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                    style={{ backgroundColor: `${pipeline.color}15` }}
                                  >
                                    <GitBranch className="w-5 h-5" style={{ color: pipeline.color }} />
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-900">{pipeline.name}</p>
                                    <p className="text-xs text-slate-500">{pipeline.description}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600">{pipeline.type}</td>
                              <td className="px-6 py-4">
                                <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", status.className)}>
                                  <StatusIcon className={cn("w-3 h-3", pipeline.status === "running" && "animate-spin")} />
                                  {status.label}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm font-medium text-slate-700">{pipeline.nodes} nodes</span>
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-500">{pipeline.lastRun}</td>
                              <td className="px-6 py-4 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem className="gap-2"><Play className="w-4 h-4" /> Run</DropdownMenuItem>
                                    <DropdownMenuItem className="gap-2"><Eye className="w-4 h-4" /> History</DropdownMenuItem>
                                    <DropdownMenuItem className="gap-2"><Settings2 className="w-4 h-4" /> Settings</DropdownMenuItem>
                                    {canDelete && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="gap-2 text-red-600"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleTryDeletePipeline(pipeline.id, pipeline.name);
                                          }}
                                        >
                                          Delete
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
              )}
            </TabsContent>

            {/* ============== Smart Pipeline Tab ============== */}
            <TabsContent value="smart" className="mt-0">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl mx-auto"
              >
                {/* Progress Steps */}
                <div className="flex items-center justify-center gap-4 mb-10">
                  {[1, 2, 3].map((stepNum) => (
                    <div key={stepNum} className="flex items-center gap-3">
                      <motion.div
                        animate={{
                          scale: smartStep === stepNum ? 1.1 : 1,
                          backgroundColor: smartStep >= stepNum ? "#0171EC" : "#e2e8f0",
                        }}
                        className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white"
                      >
                        {generationComplete && stepNum === 3 ? (
                          <CheckCircle className="w-5 h-5" />
                        ) : (
                          stepNum
                        )}
                      </motion.div>
                      {stepNum < 3 && (
                        <motion.div
                          animate={{ backgroundColor: smartStep > stepNum ? "#0171EC" : "#e2e8f0" }}
                          className="w-16 h-1 rounded-full"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Step Content */}
                <AnimatePresence mode="wait">
                  {smartStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="bg-white rounded-2xl border border-slate-200 p-8 shadow-lg"
                    >
                      <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                          <Sparkles className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">Select Project Type</h2>
                        <p className="text-slate-500 mt-2">Choose the type of project to generate an optimized pipeline</p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {SMART_PIPELINE_TYPES.map((type) => {
                          const Icon = smartPipelineIconMap[type.icon];
                          const isSelected = smartConfig.projectType === type.id;
                          return (
                            <motion.button
                              key={type.id}
                              onClick={() => setSmartConfig({ ...smartConfig, projectType: type.id as SmartPipelineProjectType })}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className={cn(
                                "p-4 rounded-xl border-2 text-left transition-all",
                                isSelected ? "border-[#0171EC] bg-blue-50/50" : "border-slate-200 hover:border-slate-300"
                              )}
                            >
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                                style={{ backgroundColor: `${smartTypeColors[type.id] || '#64748b'}20` }}
                              >
                                <Icon className="w-5 h-5" style={{ color: smartTypeColors[type.id] || '#64748b' }} />
                              </div>
                              <h3 className="font-semibold text-slate-900">{type.name}</h3>
                              <p className="text-xs text-slate-500 mt-1">{type.description}</p>
                            </motion.button>
                          );
                        })}
                      </div>

                      <div className="flex justify-end mt-8">
                        <Button onClick={() => setSmartStep(2)} className="gap-2 bg-[#0171EC] hover:bg-[#0160c7]">
                          Continue
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {smartStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="bg-white rounded-2xl border border-slate-200 p-8 shadow-lg"
                    >
                      <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold text-slate-900">Configure Your Pipeline</h2>
                        <p className="text-slate-500 mt-2">Provide details for {selectedSmartType?.name}</p>
                      </div>

                      <div className="space-y-6 max-w-lg mx-auto">
                        <div className="space-y-2">
                          <Label>Project Name</Label>
                          <Input
                            value={smartConfig.projectName}
                            onChange={(e) => setSmartConfig({ ...smartConfig, projectName: e.target.value })}
                            placeholder="my-awesome-project"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Repository URL</Label>
                          <Input
                            value={smartConfig.repository}
                            onChange={(e) => setSmartConfig({ ...smartConfig, repository: e.target.value })}
                            placeholder="https://github.com/org/repo"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Framework</Label>
                          <Select
                            value={smartConfig.framework}
                            onValueChange={(v) => setSmartConfig({ ...smartConfig, framework: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select framework" />
                            </SelectTrigger>
                            <SelectContent>
                              {frameworkOptions[smartConfig.projectType].map((fw) => (
                                <SelectItem key={fw} value={fw}>{fw}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Deployment Target</Label>
                          <Select
                            value={smartConfig.deployment}
                            onValueChange={(v) => setSmartConfig({ ...smartConfig, deployment: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select deployment" />
                            </SelectTrigger>
                            <SelectContent>
                              {deploymentOptions.map((dep) => (
                                <SelectItem key={dep} value={dep}>{dep}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex justify-between mt-8">
                        <Button variant="outline" onClick={() => setSmartStep(1)}>Back</Button>
                        <Button
                          onClick={() => setSmartStep(3)}
                          disabled={!smartConfig.projectName || !smartConfig.framework || !smartConfig.deployment}
                          className="gap-2 bg-[#0171EC] hover:bg-[#0160c7]"
                        >
                          Continue
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {smartStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="bg-white rounded-2xl border border-slate-200 p-8 shadow-lg text-center"
                    >
                      {!generationComplete ? (
                        <>
                          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-lg">
                            {isGenerating ? (
                              <Loader2 className="w-10 h-10 text-white animate-spin" />
                            ) : (
                              <Wand2 className="w-10 h-10 text-white" />
                            )}
                          </div>
                          <h2 className="text-2xl font-bold text-slate-900 mb-2">
                            {isGenerating ? "Generating Pipeline..." : "Ready to Generate"}
                          </h2>
                          <p className="text-slate-500 mb-8 max-w-md mx-auto">
                            {isGenerating
                              ? "AI is analyzing your configuration and creating an optimized pipeline..."
                              : "Review your configuration and generate your custom pipeline"}
                          </p>

                          {!isGenerating && (
                            <div className="bg-slate-50 rounded-xl p-6 max-w-md mx-auto mb-8 text-left">
                              <h3 className="font-semibold text-slate-900 mb-3">Configuration Summary</h3>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Project Type:</span>
                                  <span className="font-medium text-slate-900">{selectedSmartType?.name}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Project Name:</span>
                                  <span className="font-medium text-slate-900">{smartConfig.projectName}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Framework:</span>
                                  <span className="font-medium text-slate-900">{smartConfig.framework}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500">Deployment:</span>
                                  <span className="font-medium text-slate-900">{smartConfig.deployment}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex justify-center gap-3">
                            <Button variant="outline" onClick={() => setSmartStep(2)} disabled={isGenerating}>
                              Back
                            </Button>
                            <Button
                              onClick={handleSmartGenerate}
                              disabled={isGenerating}
                              className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                            >
                              {isGenerating ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4" />
                                  Generate Pipeline
                                </>
                              )}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6"
                          >
                            <CheckCircle className="w-10 h-10 text-emerald-600" />
                          </motion.div>
                          <h2 className="text-2xl font-bold text-slate-900 mb-2">Pipeline Generated!</h2>
                          <p className="text-slate-500 mb-8">Your custom pipeline is ready. Open it in the canvas to customize.</p>
                          <Button onClick={handleSmartOpenCanvas} className="gap-2 bg-[#0171EC] hover:bg-[#0160c7]">
                            <GitBranch className="w-4 h-4" />
                            Open in Canvas
                          </Button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </TabsContent>

            {/* ============== Templates Tab ============== */}
            <TabsContent value="templates" className="mt-0">
              {/* Search and Filter */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 mb-6"
              >
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="search"
                    placeholder="Search templates..."
                    value={templateSearchQuery}
                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-white/80 backdrop-blur-sm border-slate-200 rounded-xl shadow-sm"
                  />
                </div>
                <div className="flex gap-2">
                  {templateCategories.map((category) => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "capitalize rounded-lg",
                        selectedCategory === category
                          ? "bg-[#0171EC] hover:bg-[#0160c7]"
                          : "bg-white/80 border-slate-200"
                      )}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </motion.div>

              {/* Template Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredTemplates.map((template, index) => {
                  const Icon = templateIconMap[template.icon] || Layers;
                  return (
                    <motion.div
                      key={template.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group bg-white/80 backdrop-blur-xl rounded-2xl border border-white/80 overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300"
                    >
                      <div
                        className="h-2"
                        style={{ background: `linear-gradient(90deg, ${templateColors[template.id] || '#64748b'}, ${templateColors[template.id] || '#64748b'}80)` }}
                      />
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${templateColors[template.id] || '#64748b'}15` }}
                          >
                            <Icon className="w-6 h-6" style={{ color: templateColors[template.id] || '#64748b' }} />
                          </div>
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">
                            {template.category}
                          </span>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">{template.name}</h3>
                        <p className="text-sm text-slate-500 mb-4 line-clamp-2">{template.description}</p>
                        <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            {template.steps?.length || 0} stages
                          </span>
                          <span>•</span>
                          <span>{template.category}</span>
                        </div>
                        <Button
                          onClick={() => handleUseTemplate(template.id)}
                          className="w-full gap-2 bg-[#0171EC] hover:bg-[#0160c7]"
                        >
                          Use Template
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Create Template Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  value={templateFormData.name}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, name: e.target.value })}
                  placeholder="My Custom Template"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={templateFormData.description}
                  onChange={(e) => setTemplateFormData({ ...templateFormData, description: e.target.value })}
                  placeholder="Describe the template..."
                />
              </div>
              <div className="space-y-2">
                <Label>Deployment Type</Label>
                <Select
                  value={templateFormData.deploymentType}
                  onValueChange={(v) => setTemplateFormData({ ...templateFormData, deploymentType: v as DeploymentType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Integration">Integration</SelectItem>
                    <SelectItem value="Kubernetes">Kubernetes</SelectItem>
                    <SelectItem value="CloudFoundry">Cloud Foundry</SelectItem>
                    <SelectItem value="MobileServices">Mobile Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateTemplate} className="bg-[#0171EC] hover:bg-[#0160c7]">Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Pipeline Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Pipeline</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <span className="font-semibold">"{pipelineToDelete?.name}"</span>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPipelineToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePipeline}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </TooltipProvider>
    </PermissionGate>
  );
}
