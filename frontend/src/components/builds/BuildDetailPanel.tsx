import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BuildJob, BuildExecution, useBuilds } from "@/hooks/useBuilds";
import { useBuildExecution } from "@/hooks/useBuildExecution";
import { usePipelines } from "@/hooks/usePipelines";
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
  Eye,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PipelineStageProgress, PipelineStage } from "./PipelineStageProgress";
import { PipelineFlowPreview } from "./PipelineFlowPreview";
import { BuildExecutionTimeline } from "./BuildExecutionTimeline";
import { BuildLogStream } from "./BuildLogStream";
import { IntegrationArtifactsModal } from "./IntegrationArtifactsModal";
import { PipelineConfigDialog } from "./PipelineConfigDialog";
import { ArtifactsSummary } from "./ArtifactsSummary";

interface BuildDetailPanelProps {
  buildJob: BuildJob | null;
  onClose: () => void;
  onExecutionComplete?: () => void;
  isTheaterMode?: boolean;
}

const DEFAULT_STAGE_NAMES = ["Source", "Build", "Test", "Package", "Deploy"];
const STAGE_DURATION_MS = 2000;

const SIDEBAR_TABS = [
  { key: "overview", label: "Overview", icon: Info },
  { key: "executions", label: "Executions", icon: History },
  { key: "timeline", label: "Timeline", icon: Activity },
] as const;

type SidebarTabKey = typeof SIDEBAR_TABS[number]["key"];

export function BuildDetailPanel({ buildJob, onClose, onExecutionComplete, isTheaterMode }: BuildDetailPanelProps) {
  const { fetchExecutions, createExecution, regenerateBuildYaml } = useBuilds();
  const { currentUserRoleName } = usePermissions();
  const buildExecution = useBuildExecution();
  const { pipelines } = usePipelines();
  const [executions, setExecutions] = useState<BuildExecution[]>([]);
  const [loadingExecs, setLoadingExecs] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<BuildExecution | null>(null);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [buildYamlOpen, setBuildYamlOpen] = useState(false);

  // Sidebar tab — null means collapsed
  const [sidebarTab, setSidebarTab] = useState<SidebarTabKey | null>(null);
  // Logs panel visibility — shown during/after execution
  const [showLogs, setShowLogs] = useState(false);
  const [logStageFilter, setLogStageFilter] = useState<{ id: string; label: string } | null>(null);

  const [activeStageIndex, setActiveStageIndex] = useState<number>(-1);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "success" | "failed">("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (buildJob) {
      setLoadingExecs(true);
      setSidebarTab(null);
      setShowLogs(false);
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

  const getConfiguredApprovers = (): string[] => {
    const stagesState = buildJob?.pipeline_stages_state as any;
    if (!stagesState?.selectedApprovers) return [];
    const allApprovers: string[] = [];
    for (const emails of Object.values(stagesState.selectedApprovers)) {
      if (Array.isArray(emails)) {
        allApprovers.push(...(emails as string[]));
      }
    }
    return [...new Set(allApprovers)];
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
        setShowLogs(true);
        setSidebarTab(null);
        setRunStatus("running");
        setActiveStageIndex(0);
        const pipelineName = buildJob.pipeline!;
        const matchedPipeline = pipelines.find(
          (p) => p.name.toLowerCase() === pipelineName.toLowerCase()
        );
        const pipelineId = matchedPipeline?.id || pipelineName;
        await buildExecution.runExecution(pipelineId, buildJob.id, "main", approvers);
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
        setShowLogs(true);
        setSidebarTab(null);

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

  const toggleSidebarTab = (key: SidebarTabKey) => {
    setSidebarTab((prev) => (prev === key ? null : key));
  };

  // Determine if we're in "execution mode" (logs visible)
  const isExecutionMode = showLogs && selectedExecution;

  const renderSidebarContent = () => {
    switch (sidebarTab) {
      case "overview":
        return (
          <div className="grid grid-cols-2 gap-2 p-4">
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
            <ArtifactsSummary selectedArtifacts={(buildJob as any).selected_artifacts} />
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
                      onClick={() => { setSelectedExecution(exec); setShowLogs(true); setSidebarTab(null); }}
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
                onSelect={(exec) => { setSelectedExecution(exec); setShowLogs(true); setSidebarTab(null); }}
              />
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
      {/* ── Header ── */}
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
              {(currentUserRoleName === null || currentUserRoleName?.toLowerCase().includes('admin') || currentUserRoleName?.toLowerCase().includes('super_admin')) && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setBuildYamlOpen(true)}>
                    <Eye className="w-3.5 h-3.5" /> View YAML
                  </Button>
                </motion.div>
              )}
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setArtifactsOpen(true)}>
                  <Package className="w-3.5 h-3.5" /> Artifacts
                </Button>
              </motion.div>
              {/* Logs toggle */}
              {selectedExecution && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant={showLogs ? "default" : "outline"}
                      className={cn("gap-1.5 text-xs", showLogs && "bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700")}
                      onClick={() => setShowLogs(!showLogs)}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Logs
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">Toggle log panel</p></TooltipContent>
                </Tooltip>
              )}
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
      </div>

      {/* ── Main Content Area ── */}
      <div className="flex-1 min-h-0 flex border-t border-border/40">
        {/* Left: Pipeline Stages */}
        <div className={cn(
          "flex flex-col min-h-0 transition-all duration-300",
          isExecutionMode ? "w-[42%] border-r border-border/40" : "flex-1"
        )}>
          <div className="px-4 pt-2 pb-1 flex-shrink-0">
            <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <GitBranch className="w-3 h-3" />
              Pipeline Stages
              {runStatus === "running" && (
                <span className="stats-badge text-[8px] py-0 px-1">LIVE</span>
              )}
            </h4>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <PipelineFlowPreview
              pipelineName={buildJob.pipeline}
              executionStatus={canvasStatus}
              activeStageIndex={runStatus !== "idle" ? activeStageIndex : undefined}
              stageStates={buildExecution.stageStates}
              currentNode={buildExecution.currentNode}
              pipelineStagesState={buildJob.pipeline_stages_state as Record<string, any> | undefined}
              executionLogs={buildExecution.logs}
              selectedStageId={logStageFilter?.id ?? null}
              onStageSelect={(stage) => {
                setLogStageFilter(stage);
                if (stage && selectedExecution) {
                  setShowLogs(true);
                  setSidebarTab(null);
                }
              }}
            />
          </div>
        </div>

        {/* Right: Log Viewer — full height, side by side with stages */}
        <AnimatePresence>
          {isExecutionMode && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "58%", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="flex flex-col min-h-0 overflow-hidden"
            >
              <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
                <BuildLogStream
                  logs={
                    isExternalApi() && buildExecution.logs.length > 0
                      ? buildExecution.logs.join("\n")
                      : selectedExecution?.logs ?? null
                  }
                  status={runStatus !== "idle" && selectedExecution?.id === executions[0]?.id ? runStatus : selectedExecution?.status ?? "idle"}
                  buildNumber={selectedExecution?.build_number ?? ""}
                  pipelineNodes={DEFAULT_STAGE_NAMES}
                  activeStageIndex={runStatus !== "idle" && selectedExecution?.id === executions[0]?.id ? activeStageIndex : undefined}
                  currentStage={buildExecution.currentStage}
                  fillHeight
                  stageFilter={logStageFilter}
                  onClearStageFilter={() => setLogStageFilter(null)}
                />
                {buildExecution.pendingApprovalStage && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex-shrink-0"
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar Tab Rail — only when logs are NOT shown */}
        {!isExecutionMode && (
          <div className="flex h-full flex-shrink-0">
            <div className="relative flex flex-col items-center border-l border-border/40 w-12 py-3 gap-1.5 overflow-hidden">
              <motion.div
                className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-[hsl(var(--brand-cyan))]/5"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="w-5 h-[2px] rounded-full bg-gradient-to-r from-primary/40 to-[hsl(var(--brand-cyan))]/40 mb-1 flex-shrink-0" />

              {SIDEBAR_TABS.map((tab, index) => {
                const isTabActive = sidebarTab === tab.key;
                const TabIcon = tab.icon;
                return (
                  <Tooltip key={tab.key} delayDuration={200}>
                    <TooltipTrigger asChild>
                      <motion.button
                        onClick={() => toggleSidebarTab(tab.key)}
                        className={cn(
                          "relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300",
                          isTabActive
                            ? "bg-primary/10 text-primary ring-1 ring-primary/30 shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        )}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.06 }}
                      >
                        {isTabActive && (
                          <motion.div
                            layoutId="sidebarIndicator"
                            className="absolute -left-[1px] top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary"
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          />
                        )}
                        <TabIcon className="w-4 h-4 relative z-10" />
                        {tab.key === "executions" && executions.length > 0 && (
                          <span className={cn(
                            "absolute -top-1 -right-1 text-[7px] min-w-[14px] h-[14px] rounded-full flex items-center justify-center font-bold border",
                            isTabActive
                              ? "bg-primary text-white border-primary/50"
                              : "bg-muted text-muted-foreground border-border/50"
                          )}>
                            {executions.length}
                          </span>
                        )}
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={8}>
                      <p className="text-xs font-semibold">{tab.label}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              {/* Logs shortcut in sidebar rail */}
              {selectedExecution && (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <motion.button
                      onClick={() => { setShowLogs(true); setSidebarTab(null); }}
                      className="relative flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <FileText className="w-4 h-4" />
                      {runStatus === "running" && (
                        <motion.div
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500"
                          animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                        />
                      )}
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={8}>
                    <p className="text-xs font-semibold">Logs</p>
                  </TooltipContent>
                </Tooltip>
              )}

              <div className="mt-auto w-5 h-[2px] rounded-full bg-gradient-to-r from-[hsl(var(--brand-cyan))]/30 to-primary/30 flex-shrink-0" />
            </div>

            {/* Sidebar content panel */}
            <AnimatePresence mode="wait">
              {sidebarTab && (
                <motion.div
                  key={sidebarTab}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 320, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden bg-gradient-to-b from-card/60 to-card/40 backdrop-blur-sm"
                >
                  <div className="w-[320px] h-full flex flex-col">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const tab = SIDEBAR_TABS.find((t) => t.key === sidebarTab);
                          const TabIcon = tab?.icon || Info;
                          return <TabIcon className="w-3.5 h-3.5 text-muted-foreground" />;
                        })()}
                        <span className="text-xs font-semibold text-foreground capitalize">{sidebarTab}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setSidebarTab(null)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <ScrollArea className="flex-1">
                      <motion.div
                        initial={{ x: 10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -10, opacity: 0 }}
                        transition={{ duration: 0.2, delay: 0.05 }}
                      >
                        {renderSidebarContent()}
                      </motion.div>
                    </ScrollArea>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>

    <IntegrationArtifactsModal
      open={artifactsOpen}
      onClose={() => setArtifactsOpen(false)}
      buildJobName={buildJob.connector_name}
      buildJobId={buildJob.id}
      onAfterSave={() => {
        if (buildJob) regenerateBuildYaml(buildJob);
      }}
    />
    <PipelineConfigDialog
      open={buildYamlOpen}
      onOpenChange={setBuildYamlOpen}
      buildJob={buildJob}
    />
    </>
  );
}
