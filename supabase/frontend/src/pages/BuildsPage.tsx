import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Zap,
  Puzzle,
  Cloud,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  PanelRightOpen,
  PanelRightClose,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useViewPreference } from "@/hooks/useViewPreference";
import { useBuilds, BuildJob } from "@/hooks/useBuilds";
import { ViewToggle } from "@/components/ui/view-toggle";
import { BuildsToolbar } from "@/components/builds/BuildsToolbar";
import { BuildsTable } from "@/components/builds/BuildsTable";
import { BuildsCardView } from "@/components/builds/BuildsCardView";
import { BuildDetailPanel } from "@/components/builds/BuildDetailPanel";
import { CreateBuildJobDialog } from "@/components/builds/CreateBuildJobDialog";
import { DeleteBuildJobDialog } from "@/components/builds/DeleteBuildJobDialog";
import { FilterContextIndicator } from "@/components/layout/FilterContextIndicator";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { toast } from "sonner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const pageVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
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
      delay: i * 0.1,
    },
  }),
};

const pulseVariants = {
  pulse: {
    scale: [1, 1.05, 1] as number[],
    transition: { duration: 2, repeat: Infinity },
  },
};

export default function BuildsPage() {
  const { buildJobs, isLoading, refetch, deleteBuildJob } = useBuilds();
  const [activeTab, setActiveTab] = useState("integrations");
  const [view, setView] = useViewPreference("builds-integrations", "table");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [groupBy, setGroupBy] = useState<string | null>(null);

  const allColumns = ["connector_name", "description", "entity", "pipeline", "status", "scope", "builds"];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(allColumns);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBuildForDetail, setSelectedBuildForDetail] = useState<BuildJob | null>(null);
  const [pendingDeleteJob, setPendingDeleteJob] = useState<BuildJob | null>(null);

  // When a build is selected, default to collapsed (full-page detail view)
  const [listCollapsed, setListCollapsed] = useState(true);
  const [theaterMode, setTheaterMode] = useState(false);

  const processedBuilds = useMemo(() => {
    let result = [...buildJobs];
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      result = result.filter(
        (b) =>
          b.connector_name.toLowerCase().includes(s) ||
          (b.description || "").toLowerCase().includes(s) ||
          (b.entity || "").toLowerCase().includes(s) ||
          (b.pipeline || "").toLowerCase().includes(s) ||
          b.product.toLowerCase().includes(s) ||
          b.service.toLowerCase().includes(s)
      );
    }
    if (statusFilter === "active") result = result.filter((b) => b.status === "ACTIVE");
    if (statusFilter === "inactive") result = result.filter((b) => b.status === "INACTIVE");
    if (sortColumn) {
      result.sort((a, b) => {
        const aVal = (a as any)[sortColumn] || "";
        const bVal = (b as any)[sortColumn] || "";
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [buildJobs, searchTerm, statusFilter, sortColumn, sortDirection]);

  // Bulk selection
  const bulkSelection = useBulkSelection(processedBuilds);

  const handleBulkDelete = async () => {
    const ids = Array.from(bulkSelection.selectedIds);
    let deleted = 0;
    for (const id of ids) {
      try {
        await deleteBuildJob.mutateAsync(id);
        deleted++;
      } catch { /* individual error handled by hook */ }
    }
    if (deleted > 0) toast.success(`Deleted ${deleted} build job(s)`);
    bulkSelection.clear();
    if (selectedBuildForDetail && ids.includes(selectedBuildForDetail.id)) {
      setSelectedBuildForDetail(null);
      setListCollapsed(true);
    }
  };

  const handleDelete = (job: BuildJob) => setPendingDeleteJob(job);
  const confirmDelete = async () => {
    if (!pendingDeleteJob) return;
    await deleteBuildJob.mutateAsync(pendingDeleteJob.id);
    setPendingDeleteJob(null);
    if (selectedBuildForDetail?.id === pendingDeleteJob.id) {
      setSelectedBuildForDetail(null);
      setListCollapsed(true);
    }
  };

  const stats = useMemo(() => {
    const totalJobs = buildJobs.length;
    const activeJobs = buildJobs.filter((b) => b.status === "ACTIVE").length;
    const inactiveJobs = buildJobs.filter((b) => b.status === "INACTIVE").length;
    return { totalJobs, activeJobs, inactiveJobs };
  }, [buildJobs]);

  const handleExecutionComplete = () => {};

  const handleOpenDetail = (job: BuildJob) => {
    setSelectedBuildForDetail(job);
    setListCollapsed(true);
  };

  const handleCloseDetail = () => {
    setSelectedBuildForDetail(null);
    setListCollapsed(true);
    refetch();
  };

  const renderIntegrationsContent = () => (
    <motion.div variants={itemVariants}>
      <BuildsToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activeTab={statusFilter}
        onTabChange={setStatusFilter}
        view={view}
        onViewChange={setView}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSortChange={(col, dir) => {
          setSortColumn(col);
          setSortDirection(dir);
        }}
        onClearSort={() => {
          setSortColumn(null);
          setSortDirection("asc");
        }}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        allColumns={allColumns}
      />

      <AnimatePresence>
        {bulkSelection.selectedIds.size > 0 && (
          <BulkActionBar
            selectedCount={bulkSelection.selectedIds.size}
            totalCount={processedBuilds.length}
            entityName="build job"
            onToggleAll={bulkSelection.toggleAll}
            onClear={bulkSelection.clear}
            onDelete={handleBulkDelete}
            isAllSelected={bulkSelection.isAllSelected}
          />
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="glass-card p-12 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-primary animate-spin" />
            </div>
            <p className="text-muted-foreground text-sm">Loading build jobs...</p>
          </div>
        </div>
      ) : processedBuilds.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="spark-card p-12 flex flex-col items-center justify-center text-center"
        >
          <motion.div
            className="w-20 h-20 rounded-2xl icon-gradient flex items-center justify-center mb-5 shadow-lg"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Plus className="w-10 h-10 text-white" />
          </motion.div>
          <h3 className="text-xl font-bold text-foreground mb-2">No build jobs yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Create your first integration build job to start managing pipeline executions.
          </p>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="gap-2 bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(213,97%,37%)] hover:shadow-xl text-white shadow-lg transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Create New Job
          </Button>
        </motion.div>
      ) : view === "table" ? (
        <BuildsTable
          builds={processedBuilds}
          visibleColumns={visibleColumns}
          groupBy={groupBy}
          onOpenDetail={handleOpenDetail}
          onDelete={handleDelete}
          selectedBuildId={selectedBuildForDetail?.id}
          selectedIds={bulkSelection.selectedIds}
          onToggleSelect={bulkSelection.toggle}
          onToggleSelectAll={bulkSelection.toggleAll}
          isAllSelected={bulkSelection.isAllSelected}
        />
      ) : (
        <BuildsCardView
          builds={processedBuilds}
          onOpenDetail={handleOpenDetail}
          onDelete={handleDelete}
          selectedIds={bulkSelection.selectedIds}
          onToggleSelect={bulkSelection.toggle}
        />
      )}
    </motion.div>
  );

  // Theater mode — full-screen detail panel overlay
  if (theaterMode && selectedBuildForDetail) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl">
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg icon-gradient flex items-center justify-center shadow-sm">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-sm">{selectedBuildForDetail.connector_name}</h3>
                <p className="text-[10px] text-muted-foreground">{selectedBuildForDetail.pipeline || "No pipeline"} • Theater Mode</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setTheaterMode(false)}
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Exit Theater
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <BuildDetailPanel
              buildJob={selectedBuildForDetail}
              onClose={() => { setTheaterMode(false); handleCloseDetail(); }}
              onExecutionComplete={handleExecutionComplete}
              isTheaterMode
            />
          </div>
        </div>
      </div>
    );
  }

  // Full-page detail view when a build is selected (default collapsed mode)
  if (selectedBuildForDetail && listCollapsed) {
    return (
      <TooltipProvider>
        <div className="min-h-screen min-h-dvh bg-gradient-to-br from-background via-secondary/30 to-background flex flex-col">
          <Header
            title="Builds"
            subtitle="Manage integration jobs, extensions, and deployments"
            actions={
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setListCollapsed(false)}
                >
                  <PanelRightOpen className="w-3.5 h-3.5" />
                  Show List
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setTheaterMode(true)}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Theater
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 bg-card/80 backdrop-blur-sm border-border text-muted-foreground hover:bg-muted"
                  onClick={handleCloseDetail}
                >
                  ← Back to Jobs
                </Button>
              </div>
            }
          />
          <div className="flex-1 min-h-0 p-4">
            <div className="h-full rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-lg shadow-primary/5 overflow-hidden">
              <BuildDetailPanel
                buildJob={selectedBuildForDetail}
                onClose={handleCloseDetail}
                onExecutionComplete={handleExecutionComplete}
              />
            </div>
          </div>
          <CreateBuildJobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
          <DeleteBuildJobDialog
            job={pendingDeleteJob}
            onClose={() => setPendingDeleteJob(null)}
            onConfirm={confirmDelete}
            isDeleting={deleteBuildJob.isPending}
          />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <PermissionGate menuKey="builds">
    <TooltipProvider>
      <div className="min-h-screen min-h-dvh bg-gradient-to-br from-background via-secondary/30 to-background">
        <Header
          title="Builds"
          subtitle="Manage integration jobs, extensions, and deployments"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-card/80 backdrop-blur-sm border-border text-muted-foreground hover:bg-muted"
                onClick={() => refetch()}
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          }
        />

        <motion.div
          className="p-content"
          variants={pageVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Stats */}
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap items-center gap-3 mb-lg-fluid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {[
              { label: "Total Jobs", value: stats.totalJobs, icon: Zap, gradient: "from-[hsl(var(--brand-blue))] to-[hsl(213,97%,37%)]", bg: "bg-primary/5" },
              { label: "Active", value: stats.activeJobs, icon: CheckCircle, gradient: "from-[hsl(var(--success))] to-[hsl(142,71%,35%)]", bg: "bg-[hsl(var(--success))]/5" },
              { label: "Inactive", value: stats.inactiveJobs, icon: XCircle, gradient: stats.inactiveJobs > 0 ? "from-[hsl(var(--warning))] to-[hsl(28,90%,45%)]" : "from-muted-foreground to-muted-foreground", bg: stats.inactiveJobs > 0 ? "bg-[hsl(var(--warning))]/5" : "bg-muted/50", pulse: stats.inactiveJobs > 0 },
              { label: "Extensions", value: 0, icon: Puzzle, gradient: "from-violet-500 to-violet-600", bg: "bg-violet-50" },
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
                      "flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border/50 backdrop-blur-sm cursor-default",
                      stat.bg,
                      "shadow-sm hover:shadow-md transition-all duration-300"
                    )}
                  >
                    <motion.div
                      className={cn(
                        "w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white shadow-sm",
                        stat.gradient
                      )}
                      animate={(stat as any).pulse ? "pulse" : undefined}
                      variants={pulseVariants}
                    >
                      <stat.icon className="w-4 h-4" />
                    </motion.div>
                    <div className="flex flex-col">
                      <span className="text-lg font-bold text-foreground">{stat.value}</span>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {stat.label}
                      </span>
                    </div>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{stat.value} {stat.label.toLowerCase()}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </motion.div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <motion.div
              variants={itemVariants}
              className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-6 gap-4"
            >
              <TabsList className="bg-card/80 backdrop-blur-sm border border-border/60 p-1.5 rounded-xl shadow-lg shadow-primary/5">
                {[
                  { value: "integrations", icon: Zap, label: "Integrations" },
                  { value: "extensions", icon: Puzzle, label: "Extensions" },
                  { value: "deployments", icon: Cloud, label: "Deployments" },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "group gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-300",
                      "text-muted-foreground hover:text-foreground",
                      "data-[state=active]:bg-gradient-to-r data-[state=active]:from-[hsl(var(--brand-blue))] data-[state=active]:to-[hsl(213,97%,37%)]",
                      "data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-primary/20",
                      "hover:bg-muted/50 data-[state=active]:hover:bg-gradient-to-r"
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

              <AnimatePresence mode="wait">
                {activeTab === "integrations" && (
                  <motion.div
                    initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {/* Show list toggle only in split-pane mode */}
                    {selectedBuildForDetail && !listCollapsed && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => setListCollapsed(true)}
                          >
                            <PanelRightClose className="w-3.5 h-3.5" />
                            Collapse List
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Hide list for more execution space</p>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    <ViewToggle view={view} onViewChange={setView} />
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        size="sm"
                        className="gap-2 bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(213,97%,37%)] hover:shadow-xl text-white transition-all duration-300 shadow-lg shadow-primary/20"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        <motion.div
                          whileHover={{ rotate: 90 }}
                          transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        >
                          <Plus className="w-4 h-4" />
                        </motion.div>
                        Create New Job
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Integrations Tab */}
            <TabsContent value="integrations" className="mt-0">
              {selectedBuildForDetail && !listCollapsed ? (
                <ResizablePanelGroup
                  direction="horizontal"
                  className="min-h-[650px] rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-lg shadow-primary/5 overflow-hidden"
                >
                  <ResizablePanel defaultSize={55} minSize={30}>
                    <div className="h-full overflow-auto p-4">
                      {renderIntegrationsContent()}
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={45} minSize={30}>
                    <BuildDetailPanel
                      buildJob={selectedBuildForDetail}
                      onClose={handleCloseDetail}
                      onExecutionComplete={handleExecutionComplete}
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-lg shadow-primary/5 overflow-hidden">
                  <div className="p-4">
                    {renderIntegrationsContent()}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Extensions Tab */}
            <TabsContent value="extensions" className="mt-0">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="spark-card p-12 flex flex-col items-center justify-center text-center"
              >
                <motion.div
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(var(--warning))]/10 to-[hsl(28,90%,55%)]/10 flex items-center justify-center mb-4"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Puzzle className="w-8 h-8 text-[hsl(var(--warning))]" />
                </motion.div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Extensions</h3>
                <p className="text-muted-foreground max-w-md">
                  Manage extensions and plugins for your build workflows. This feature is coming soon.
                </p>
              </motion.div>
            </TabsContent>

            {/* Deployments Tab */}
            <TabsContent value="deployments" className="mt-0">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="spark-card p-12 flex flex-col items-center justify-center text-center"
              >
                <motion.div
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(var(--success))]/10 to-[hsl(160,60%,45%)]/10 flex items-center justify-center mb-4"
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                >
                  <Cloud className="w-8 h-8 text-[hsl(var(--success))]" />
                </motion.div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Deployments</h3>
                <p className="text-muted-foreground max-w-md">
                  Manage cloud deployments and release configurations. This feature is coming soon.
                </p>
              </motion.div>
            </TabsContent>
          </Tabs>
        </motion.div>

        <CreateBuildJobDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        <DeleteBuildJobDialog
          job={pendingDeleteJob}
          onClose={() => setPendingDeleteJob(null)}
          onConfirm={confirmDelete}
          isDeleting={deleteBuildJob.isPending}
        />
      </div>
    </TooltipProvider>
    </PermissionGate>
  );
}
