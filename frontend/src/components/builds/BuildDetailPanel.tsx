import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BuildJob, BuildExecution, useBuilds } from "@/hooks/useBuilds";
import { useBuildExecution } from "@/hooks/useBuildExecution";
import { isExternalApi } from "@/lib/api/config";
import { usePermissions } from "@/contexts/PermissionContext";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Play,
  RotateCw,
  X,
  Zap,
  GitBranch,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  FileText,
  Layers,
  Timer,
  History,
  Info,
  Package,
  FileCode,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PipelineStageProgress, PipelineStage } from "./PipelineStageProgress";
import { PipelineFlowPreview } from "./PipelineFlowPreview";
import { BuildExecutionTimeline } from "./BuildExecutionTimeline";
import { BuildLogStream } from "./BuildLogStream";
import { IntegrationArtifactsModal } from "./IntegrationArtifactsModal";
import { PipelineConfigDialog } from "./PipelineConfigDialog";

interface BuildDetailPanelProps {
  buildJob: BuildJob | null;
  onClose: () => void;
  onExecutionComplete?: () => void;
  isTheaterMode?: boolean;
}

const DEFAULT_STAGE_NAMES = ["Source", "Build", "Test", "Package", "Deploy"];
const STAGE_DURATION_MS = 2000;

const DETAIL_TABS = [
  { key: "overview", label: "Overview", icon: Info },
  { key: "executions", label: "Executions", icon: History },
  { key: "timeline", label: "Timeline", icon: Activity },
  { key: "logs", label: "Logs", icon: FileText },
] as const;

type DetailTabKey = typeof DETAIL_TABS[number]["key"];

export function BuildDetailPanel({ buildJob, onClose, onExecutionComplete, isTheaterMode }: BuildDetailPanelProps) {
  const { fetchExecutions, createExecution } = useBuilds();
  const { currentUserRoleName } = usePermissions();
  const buildExecution = useBuildExecution();
  const [executions, setExecutions] = useState<BuildExecution[]>([]);
  const [loadingExecs, setLoadingExecs] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<BuildExecution | null>(null);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [buildYamlOpen, setBuildYamlOpen] = useState(false);

  // Active bottom tab — null means collapsed (pipeline gets full space)
  const [activeTab, setActiveTab] = useState<DetailTabKey | null>(null);

  const [activeStageIndex, setActiveStageIndex] = useState<number>(-1);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "success" | "failed">("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (buildJob) {
      setLoadingExecs(true);
      setActiveTab(null);
      setActiveStageIndex(-1);
      setRunStatus("idle");
      fetchExecutions(buildJob.id)
        .then((data) => {
          setExecutions(data);
          if (data.length > 0) setSelectedExecution(data[0]);
        })
        .catch(() => setExecutions([]))
        .finally(() => setLoadingExecs(false));
    } else {
      setExecutions([]);
      setSelectedExecution(null);
      setActiveStageIndex(-1);
      setRunStatus("idle");
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [buildJob?.id]);

  useEffect(() => {
    if (buildExecution.status && isExternalApi()) {
      if (buildExecution.status === "RUNNING") setRunStatus("running");
      else if (buildExecution.status === "SUCCESS") {
        setRunStatus("success");
        setIsRunning(false);
        onExecutionComplete?.();
      } else if (buildExecution.status === "FAILED") {
        setRunStatus("failed");
        setIsRunning(false);
        onExecutionComplete?.();
      } else if (buildExecution.status === "WAITING_APPROVAL") {
        setRunStatus("running");
      }
    }
  }, [buildExecution.status]);

  // Extract approver emails from pipeline_stages_state
  const getConfiguredApprovers = (): string[] => {
    const stagesState = buildJob?.pipeline_stages_state as any;
    if (!stagesState?.selectedApprovers) return [];
    const allApprovers: string[] = [];
    for (const emails of Object.values(stagesState.selectedApprovers)) {
      if (Array.isArray(emails)) {
        allApprovers.push(...(emails as string[]));
      }
    }
    return [...new Set(allApprovers)]; // deduplicate
  };

  const handleRunClick = () => {
    if (!buildJob) return;
    handleRun(getConfiguredApprovers());
  };

  const handleRun = async (approvers?: string[]) => {
    if (!buildJob) return;
    setIsRunning(true);

    if (isExternalApi() && buildJob.pipeline) {
      try {
        const buildNumber = `#${String(executions.length + 1).padStart(4, "0")}`;
        const newExec = await createExecution.mutateAsync({
          build_job_id: buildJob.id,
          build_number: buildNumber,
          branch: "main",
          approvers: approvers,
        });
        setExecutions((prev) => [newExec, ...prev]);
        setSelectedExecution(newExec);
        setActiveTab("logs");
        setRunStatus("running");
        setActiveStageIndex(0);
        await buildExecution.runExecution(buildJob.pipeline!, buildJob.id, "main", approvers);
        toast.success(`Build ${buildNumber} started`);
      } catch {
        toast.error("Failed to start build");
        setIsRunning(false);
        setRunStatus("failed");
      }
    } else {
      try {
        const buildNumber = `#${String(executions.length + 1).padStart(4, "0")}`;
        const newExec = await createExecution.mutateAsync({
          build_job_id: buildJob.id,
          build_number: buildNumber,
          branch: "main",
        });
        setExecutions((prev) => [newExec, ...prev]);
        setSelectedExecution(newExec);
        setActiveTab("logs");

        const totalStages = DEFAULT_STAGE_NAMES.length;
        const willFail = Math.random() < 0.15;
        const failAtStage = willFail ? Math.floor(Math.random() * (totalStages - 1)) + 1 : -1;

        setActiveStageIndex(0);
        setRunStatus("running");

        let idx = 0;
        intervalRef.current = setInterval(() => {
          idx++;
          if (willFail && idx === failAtStage) {
            setActiveStageIndex(idx);
            setRunStatus("failed");
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            setExecutions((prev) =>
              prev.map((e) =>
                e.id === newExec.id ? { ...e, status: "failed", duration: `${((idx + 1) * STAGE_DURATION_MS / 1000).toFixed(0)}s` } : e
              )
            );
            setIsRunning(false);
            onExecutionComplete?.();
            return;
          }
          if (idx >= totalStages) {
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
            setRunStatus("success");
            setActiveStageIndex(totalStages);
            setExecutions((prev) =>
              prev.map((e) =>
                e.id === newExec.id ? { ...e, status: "success", duration: `${(totalStages * STAGE_DURATION_MS / 1000).toFixed(0)}s` } : e
              )
            );
            setIsRunning(false);
            onExecutionComplete?.();
            return;
          }
          setActiveStageIndex(idx);
        }, STAGE_DURATION_MS);

        toast.success(`Build ${buildNumber} started`);
      } catch {
        toast.error("Failed to start build");
        setIsRunning(false);
      }
    }
  };

  if (!buildJob) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
        <Activity className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm font-medium">Select a build job</p>
        <p className="text-xs mt-1">Click on any job to view execution details</p>
      </div>
    );
  }

  const isActive = buildJob.status === "ACTIVE";
  const canvasStatus = runStatus === "idle" ? selectedExecution?.status : runStatus;
  const progressPercent = runStatus === "running"
    ? ((activeStageIndex + 1) / DEFAULT_STAGE_NAMES.length) * 100
    : runStatus === "success" ? 100
    : runStatus === "failed" ? ((activeStageIndex + 1) / DEFAULT_STAGE_NAMES.length) * 100
    : 0;

  const toggleTab = (key: DetailTabKey) => {
    setActiveTab((prev) => (prev === key ? null : key));
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-4">
            {[
              { label: "Workstream", value: buildJob.entity },
              { label: "Pipeline", value: buildJob.pipeline },
              { label: "Product", value: buildJob.product },
              { label: "Service", value: buildJob.service },
              { label: "Artifacts", value: buildJob.scope },
              { label: "Created", value: buildJob.created_at ? new Date(buildJob.created_at).toLocaleDateString() : "—" },
            ].map((item) => (
              <div key={item.label} className="bg-muted/30 rounded-lg p-2.5 border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase">{item.label}</p>
                <p className="text-xs font-medium text-foreground mt-0.5">{item.value || "—"}</p>
              </div>
            ))}
            {buildJob.description && (
              <div className="col-span-full mt-1">
                <p className="text-[10px] text-muted-foreground uppercase mb-1">Description</p>
                <p className="text-sm text-foreground/80">{buildJob.description}</p>
              </div>
            )}
          </div>
        );
      case "executions":
        return (
          <div className="p-4">
            {loadingExecs ? (
              <div className="flex items-center justify-center py-4">
                <RotateCw className="w-4 h-4 text-primary animate-spin" />
              </div>
            ) : executions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No executions yet</p>
            ) : (
              <div className="space-y-1.5">
                {executions.slice(0, 10).map((exec) => {
                  const isSuccess = exec.status === "success";
                  const isFailed = exec.status === "failed";
                  const isExecRunning = exec.status === "running";
                  return (
                    <motion.div
                      key={exec.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-all border border-transparent hover:border-border/50",
                        selectedExecution?.id === exec.id && "border-primary/30 bg-primary/5"
                      )}
                      onClick={() => { setSelectedExecution(exec); setActiveTab("logs"); }}
                      whileHover={{ x: 2 }}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center",
                        isSuccess ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" :
                        isFailed ? "bg-destructive/10 text-destructive" :
                        isExecRunning ? "bg-primary/10 text-primary" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {isSuccess ? <CheckCircle className="w-3 h-3" /> :
                         isFailed ? <XCircle className="w-3 h-3" /> :
                         isExecRunning ? <RotateCw className="w-3 h-3 animate-spin" /> :
                         <Clock className="w-3 h-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{exec.build_number}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {exec.duration && (
                          <span className="flex items-center gap-0.5">
                            <Timer className="w-2.5 h-2.5" />{exec.duration}
                          </span>
                        )}
                        <span><GitBranch className="w-3 h-3 inline" /> {exec.branch}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case "timeline":
        return (
          <div className="p-4">
            {loadingExecs ? (
              <div className="flex items-center justify-center py-8">
                <RotateCw className="w-5 h-5 text-primary animate-spin" />
              </div>
            ) : (
              <BuildExecutionTimeline
                executions={executions}
                selectedId={selectedExecution?.id}
                onSelect={(exec) => { setSelectedExecution(exec); setActiveTab("logs"); }}
              />
            )}
          </div>
        );
      case "logs":
        return (
          <div className="p-4">
            {selectedExecution ? (
              <div className="flex flex-col gap-2">
              <BuildLogStream
                  logs={
                    isExternalApi() && buildExecution.logs.length > 0
                      ? buildExecution.logs.join("\n")
                      : selectedExecution.logs
                  }
                  status={runStatus !== "idle" && selectedExecution.id === executions[0]?.id ? runStatus : selectedExecution.status}
                  buildNumber={selectedExecution.build_number}
                  pipelineNodes={DEFAULT_STAGE_NAMES}
                  activeStageIndex={runStatus !== "idle" && selectedExecution.id === executions[0]?.id ? activeStageIndex : undefined}
                  currentStage={buildExecution.currentStage}
                />
                {buildExecution.pendingApprovalStage && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
                  >
                    <div className="flex-1">
                      <p className="text-xs font-medium text-amber-400">Manual Approval Required</p>
                      <p className="text-[10px] text-muted-foreground">Stage: {buildExecution.pendingApprovalStage}</p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white text-xs"
                      onClick={() => buildExecution.approveStage(buildExecution.pendingApprovalStage!)}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Approve
                    </Button>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <FileText className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">Select an execution to view logs</p>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
    <div className={cn(
      "flex flex-col h-full overflow-hidden",
      isTheaterMode ? "bg-background" : "bg-card/95 backdrop-blur-sm"
    )}>
      {/* Compact Header */}
      <div className="relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-[hsl(var(--brand-cyan))]/5" />
        <div className="relative px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                className="w-9 h-9 rounded-xl icon-gradient flex items-center justify-center shadow-lg"
                animate={isRunning ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Zap className="w-4 h-4 text-white" />
              </motion.div>
              <div>
                <h3 className="font-bold text-foreground text-sm leading-tight">{buildJob.connector_name}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{buildJob.pipeline || "No pipeline"}</span>
                  <span className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-medium",
                    isActive ? "status-success" : "bg-muted text-muted-foreground"
                  )}>
                    {isActive ? <CheckCircle className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                    {buildJob.status}
                  </span>
                  {buildJob.entity && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Layers className="w-2.5 h-2.5" /> {buildJob.entity}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{buildJob.product} / {buildJob.service}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Admin-only View Build YAML button — visible when role name contains "admin" or when using default admin permissions (null role = super_admin fallback) */}
              {(currentUserRoleName === null || currentUserRoleName?.toLowerCase().includes('admin') || currentUserRoleName?.toLowerCase().includes('super_admin')) && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => setBuildYamlOpen(true)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View YAML
                  </Button>
                </motion.div>
              )}
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs"
                  onClick={() => setArtifactsOpen(true)}
                >
                  <Package className="w-3.5 h-3.5" />
                  Artifacts
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  size="sm"
                  className="gap-1.5 bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(213,97%,37%)] text-white shadow-lg shadow-primary/20 hover:shadow-xl transition-all"
                  onClick={handleRunClick}
                  disabled={isRunning}
                >
                  {isRunning ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Run
                </Button>
              </motion.div>
              {!isTheaterMode && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Live progress bar */}
        <AnimatePresence>
          {(runStatus === "running" || runStatus === "success" || runStatus === "failed") && (
            <motion.div
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              exit={{ opacity: 0, scaleY: 0 }}
              className="h-1 bg-muted/50 mx-5 mb-1 rounded-full overflow-hidden"
            >
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  runStatus === "running" && "bg-gradient-to-r from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-cyan))]",
                  runStatus === "success" && "bg-[hsl(var(--success))]",
                  runStatus === "failed" && "bg-destructive"
                )}
                initial={{ width: "0%" }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stage indicator chips — inline */}
        <AnimatePresence>
          {runStatus === "running" && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex items-center gap-1.5 px-5 pb-2 overflow-x-auto"
            >
              {DEFAULT_STAGE_NAMES.map((name, i) => (
                <motion.span
                  key={name}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap transition-all duration-300",
                    i < activeStageIndex && "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
                    i === activeStageIndex && "bg-primary/15 text-primary ring-1 ring-primary/30",
                    i > activeStageIndex && "bg-muted text-muted-foreground"
                  )}
                  animate={i === activeStageIndex ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  {i < activeStageIndex && <CheckCircle className="w-2.5 h-2.5" />}
                  {i === activeStageIndex && <RotateCw className="w-2.5 h-2.5 animate-spin" />}
                  {name}
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main content: Pipeline Canvas (left) + Side Panel (right) */}
      <div className="flex-1 min-h-0 flex border-t border-border/40">
        {/* Pipeline Canvas — left side */}
        <div className={cn(
          "flex-1 min-w-0 px-5 py-2 transition-all duration-300",
          activeTab ? "border-r border-border/40" : ""
        )}>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <GitBranch className="w-3 h-3" />
            Pipeline Stages
            {runStatus === "running" && (
              <span className="stats-badge text-[8px] py-0 px-1">LIVE</span>
            )}
          </h4>
          <div className="h-[calc(100%-20px)]">
            <PipelineFlowPreview
              pipelineName={buildJob.pipeline}
              executionStatus={canvasStatus}
              activeStageIndex={runStatus !== "idle" ? activeStageIndex : undefined}
              stageStates={buildExecution.stageStates}
              currentNode={buildExecution.currentNode}
            />
          </div>
        </div>

        {/* Right Side Panel — Vertical Tab Rail + Content */}
        <div className="flex h-full flex-shrink-0">
        {/* Vertical Tab Rail — icon-only with animations & color */}
          <div className="relative flex flex-col items-center border-l border-border/40 w-14 py-4 gap-2 overflow-hidden">
            {/* Animated background gradient */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-[hsl(var(--brand-cyan))]/5"
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Decorative top accent line */}
            <div className="w-6 h-[2px] rounded-full bg-gradient-to-r from-primary/40 to-[hsl(var(--brand-cyan))]/40 mb-1 flex-shrink-0" />

            {DETAIL_TABS.map((tab, index) => {
              const isTabActive = activeTab === tab.key;
              const TabIcon = tab.icon;

              const tabColors = {
                overview: {
                  gradient: "from-[hsl(var(--brand-blue))] to-[hsl(var(--brand-cyan))]",
                  text: "text-primary",
                  bg: "bg-primary/10",
                  glow: "shadow-[0_0_12px_hsl(var(--brand-blue)/0.4)]",
                  ring: "ring-primary/30",
                },
                executions: {
                  gradient: "from-[hsl(var(--success))] to-[hsl(142,71%,35%)]",
                  text: "text-[hsl(var(--success))]",
                  bg: "bg-[hsl(var(--success))]/10",
                  glow: "shadow-[0_0_12px_hsl(142,71%,45%,0.4)]",
                  ring: "ring-[hsl(var(--success))]/30",
                },
                timeline: {
                  gradient: "from-violet-500 to-purple-600",
                  text: "text-violet-500",
                  bg: "bg-violet-500/10",
                  glow: "shadow-[0_0_12px_rgba(139,92,246,0.4)]",
                  ring: "ring-violet-500/30",
                },
                logs: {
                  gradient: "from-[hsl(var(--warning))] to-[hsl(28,90%,45%)]",
                  text: "text-[hsl(var(--warning))]",
                  bg: "bg-[hsl(var(--warning))]/10",
                  glow: "shadow-[0_0_12px_hsl(38,92%,50%,0.4)]",
                  ring: "ring-[hsl(var(--warning))]/30",
                },
              }[tab.key];

              return (
                <div key={tab.key} className="relative z-10 group/tab">
                  <motion.button
                    onClick={() => toggleTab(tab.key)}
                    className={cn(
                      "relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300",
                      isTabActive
                        ? cn("border border-border/60 ring-1", tabColors?.text, tabColors?.ring, tabColors?.bg, tabColors?.glow)
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    whileHover={{ scale: 1.12, y: -1 }}
                    whileTap={{ scale: 0.9 }}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.08, type: "spring", stiffness: 300, damping: 25 }}
                  >
                    {/* Active background glow */}
                    {isTabActive && (
                      <motion.div
                        layoutId="tabGlowBg"
                        className={cn("absolute inset-0 rounded-xl bg-gradient-to-br opacity-15", tabColors?.gradient)}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}

                    {/* Side indicator bar */}
                    {isTabActive && (
                      <motion.div
                        layoutId="activeSideTabIndicator"
                        className={cn("absolute -left-[1px] top-2 bottom-2 w-[3px] rounded-r-full bg-gradient-to-b", tabColors?.gradient)}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      />
                    )}

                    {/* Hover glow ring */}
                    {!isTabActive && (
                      <motion.div
                        className="absolute inset-0 rounded-xl bg-muted/0 group-hover/tab:bg-muted/40 transition-colors duration-200"
                      />
                    )}

                    <TabIcon className={cn(
                      "w-[18px] h-[18px] relative z-10 transition-all duration-300",
                      isTabActive && "drop-shadow-md"
                    )} />

                    {/* Execution count badge */}
                    {tab.key === "executions" && executions.length > 0 && (
                      <motion.span
                        className={cn(
                          "absolute -top-1 -right-1 text-[7px] min-w-[16px] h-[16px] rounded-full flex items-center justify-center font-bold leading-none border",
                          isTabActive
                            ? "bg-[hsl(var(--success))] text-white border-[hsl(var(--success))]/50 shadow-[0_0_8px_hsl(142,71%,45%,0.5)]"
                            : "bg-muted text-muted-foreground border-border/50"
                        )}
                        animate={isTabActive ? { scale: [1, 1.15, 1] } : {}}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        {executions.length}
                      </motion.span>
                    )}

                    {/* Live pulse dot for logs */}
                    {tab.key === "logs" && runStatus === "running" && (
                      <motion.div
                        className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))]"
                        animate={{
                          opacity: [1, 0.3, 1],
                          scale: [1, 1.5, 1],
                          boxShadow: [
                            "0 0 4px hsl(142,71%,45%,0.6)",
                            "0 0 12px hsl(142,71%,45%,0.8)",
                            "0 0 4px hsl(142,71%,45%,0.6)",
                          ],
                        }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                      />
                    )}
                  </motion.button>

                  {/* Tooltip on hover */}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-[10px] font-semibold whitespace-nowrap opacity-0 pointer-events-none group-hover/tab:opacity-100 transition-all duration-200 shadow-xl z-50 group-hover/tab:translate-x-0 translate-x-1">
                    {tab.label}
                    <div className="absolute right-[-5px] top-1/2 -translate-y-1/2 w-0 h-0 border-t-[5px] border-b-[5px] border-l-[5px] border-transparent border-l-foreground" />
                  </div>
                </div>
              );
            })}

            {/* Decorative bottom accent line */}
            <div className="mt-auto w-6 h-[2px] rounded-full bg-gradient-to-r from-[hsl(var(--brand-cyan))]/30 to-primary/30 flex-shrink-0" />
          </div>

          {/* Side Panel Content */}
          <AnimatePresence mode="wait">
            {activeTab && (
              <motion.div
                key={activeTab}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 340, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-sm"
              >
                <div className="w-[340px] h-full flex flex-col">
                  {/* Panel Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const tab = DETAIL_TABS.find((t) => t.key === activeTab);
                        const TabIcon = tab?.icon || Info;
                        return <TabIcon className="w-3.5 h-3.5 text-muted-foreground" />;
                      })()}
                      <span className="text-xs font-semibold text-foreground capitalize">{activeTab}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => setActiveTab(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Panel Content */}
                  <ScrollArea className="flex-1">
                    <motion.div
                      initial={{ x: 10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -10, opacity: 0 }}
                      transition={{ duration: 0.2, delay: 0.05 }}
                    >
                      {renderTabContent()}
                    </motion.div>
                  </ScrollArea>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>

    <IntegrationArtifactsModal
      open={artifactsOpen}
      onClose={() => setArtifactsOpen(false)}
      buildJobName={buildJob.connector_name}
    />
    <PipelineConfigDialog
      open={buildYamlOpen}
      onOpenChange={setBuildYamlOpen}
      buildJob={buildJob}
    />
    </>
  );
}
