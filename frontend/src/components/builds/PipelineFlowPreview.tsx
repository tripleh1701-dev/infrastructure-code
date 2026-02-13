import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePipelines } from "@/hooks/usePipelines";
import { useConnectors, ConnectorRecord } from "@/hooks/useConnectors";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Server,
  Play,
  CheckCircle2,
  Monitor,
  FlaskConical,
  Rocket,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  AlertTriangle,
  X,
  Settings,
  Link,
  RotateCw,
  GitBranch,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_LABELS } from "@/constants/pipeline";
import { PIPELINE_NODE_ICONS } from "@/components/pipeline/icons/BrandIcons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedStage {
  id: string;
  type: string;
  label: string;
  category: string;
  tool: string;
  status?: string;
  duration?: string;
}

interface EnvironmentNode {
  id: string;
  type: string;
  label: string;
  stages: ParsedStage[];
  status?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategoryFromType(type: string): string {
  if (type.startsWith("plan_")) return "plan";
  if (type.startsWith("code_")) return "code";
  if (type.startsWith("build_")) return "build";
  if (type.startsWith("test_")) return "test";
  if (type.startsWith("deploy_")) return "deploy";
  if (type.startsWith("release_")) return "release";
  if (type.startsWith("approval_")) return "approval";
  if (type.startsWith("env_")) return "environment";
  return "other";
}

function getToolFromType(type: string): string {
  return type.split("_").slice(1).join("_");
}

function parsePipelineStructure(nodes: any[], edges: any[]): EnvironmentNode[] {
  if (!nodes || !Array.isArray(nodes)) return [];

  const envNodes: any[] = [];
  const stageNodes: any[] = [];

  nodes.forEach((node) => {
    const nodeType = node.data?.nodeType || node.type || node.data?.type || "";
    const category = getCategoryFromType(nodeType);
    if (category === "environment") {
      envNodes.push({ ...node, _resolvedType: nodeType });
    } else if (category !== "other" && nodeType !== "note" && nodeType !== "comment") {
      stageNodes.push({ ...node, _resolvedType: nodeType });
    }
  });

  const reverseEdgeMap = new Map<string, string[]>();
  (edges || []).forEach((edge: any) => {
    if (!reverseEdgeMap.has(edge.target)) reverseEdgeMap.set(edge.target, []);
    reverseEdgeMap.get(edge.target)!.push(edge.source);
  });

  const envNodeIds = new Set(envNodes.map((n) => n.id));

  function findOwnerEnv(stageId: string, visited = new Set<string>()): string | null {
    if (visited.has(stageId)) return null;
    visited.add(stageId);
    const sources = reverseEdgeMap.get(stageId) || [];
    for (const src of sources) {
      if (envNodeIds.has(src)) return src;
      const found = findOwnerEnv(src, visited);
      if (found) return found;
    }
    return null;
  }

  const envStagesMap = new Map<string, ParsedStage[]>();
  envNodes.forEach((n) => envStagesMap.set(n.id, []));

  const nodeParentMap = new Map<string, string>();
  nodes.forEach((node) => {
    if (node.parentId) nodeParentMap.set(node.id, node.parentId);
  });

  const ungroupedStages: ParsedStage[] = [];

  stageNodes.forEach((node) => {
    const nodeType = node._resolvedType || node.data?.nodeType || node.type || node.data?.type || "";
    const category = getCategoryFromType(nodeType);
    const stage: ParsedStage = {
      id: node.id,
      type: nodeType,
      label: (NODE_LABELS as any)[nodeType] || node.data?.label || nodeType,
      category,
      tool: getToolFromType(nodeType),
      status: node.data?.status as string,
    };

    const parentId = nodeParentMap.get(node.id);
    if (parentId && envStagesMap.has(parentId)) {
      envStagesMap.get(parentId)!.push(stage);
    } else {
      const ownerEnv = findOwnerEnv(node.id);
      if (ownerEnv && envStagesMap.has(ownerEnv)) {
        envStagesMap.get(ownerEnv)!.push(stage);
      } else {
        ungroupedStages.push(stage);
      }
    }
  });

  const categoryOrder = ["plan", "code", "build", "test", "approval", "deploy", "release"];
  const sortStages = (stages: ParsedStage[]) =>
    stages.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

  const DEPLOYMENT_ORDER = ["env_dev", "env_qa", "env_staging", "env_uat", "env_prod"];

  const result: EnvironmentNode[] = envNodes
    .sort((a, b) => {
      const aType = a._resolvedType || a.data?.nodeType || "";
      const bType = b._resolvedType || b.data?.nodeType || "";
      return (DEPLOYMENT_ORDER.indexOf(aType) >= 0 ? DEPLOYMENT_ORDER.indexOf(aType) : 999) -
             (DEPLOYMENT_ORDER.indexOf(bType) >= 0 ? DEPLOYMENT_ORDER.indexOf(bType) : 999);
    })
    .map((node) => {
      const nodeType = node._resolvedType || node.data?.nodeType || node.type || node.data?.type || "";
      return {
        id: node.id,
        type: nodeType,
        label: (NODE_LABELS as any)[nodeType] || node.data?.label || nodeType,
        stages: sortStages(envStagesMap.get(node.id) || []),
        status: node.data?.status as string,
      };
    });

  if (ungroupedStages.length > 0) {
    result.unshift({
      id: "__general",
      type: "general",
      label: "General",
      stages: sortStages(ungroupedStages),
    });
  }

  return result;
}

// ─── Visual Config ──────────────────────────────────────────────────────────

const STAGE_THEMES: Record<string, { bg: string; border: string; headerBg: string; text: string; icon: React.ElementType }> = {
  env_dev: { bg: "#dcfce7", border: "#16a34a", headerBg: "#16a34a", text: "#ffffff", icon: Monitor },
  env_qa: { bg: "#dbeafe", border: "#2563eb", headerBg: "#2563eb", text: "#ffffff", icon: FlaskConical },
  env_staging: { bg: "#fef9c3", border: "#ca8a04", headerBg: "#ca8a04", text: "#ffffff", icon: Server },
  env_uat: { bg: "#f3e8ff", border: "#7c3aed", headerBg: "#7c3aed", text: "#ffffff", icon: Server },
  env_prod: { bg: "#fee2e2", border: "#dc2626", headerBg: "#dc2626", text: "#ffffff", icon: Rocket },
  general: { bg: "#e0e7ff", border: "#4f46e5", headerBg: "#4f46e5", text: "#ffffff", icon: Server },
};

const DEFAULT_STAGE_THEME = { bg: "#e0e7ff", border: "#4f46e5", headerBg: "#4f46e5", text: "#ffffff", icon: Server };

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ElementType; pulse?: boolean }> = {
  success: { color: "#10b981", label: "Success", icon: CheckCircle },
  running: { color: "#3b82f6", label: "Running", icon: Loader2, pulse: true },
  failed: { color: "#ef4444", label: "Failed", icon: AlertCircle },
  warning: { color: "#f59e0b", label: "Warning", icon: AlertTriangle },
  pending: { color: "#94a3b8", label: "Pending", icon: Clock },
};

const DEFAULT_STATUS = STATUS_CONFIG.pending;

// ─── Arrow ──────────────────────────────────────────────────────────────────

function StageArrow({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ delay, duration: 0.3 }}
      className="flex items-center self-start mt-[14px] mx-1"
    >
      <div className="w-8 h-[2px] bg-border" />
      <ArrowRight className="w-4 h-4 text-muted-foreground -ml-1" />
    </motion.div>
  );
}

// ─── Stage Duration Display ─────────────────────────────────────────────────

function StageDurationDisplay({ status, backendDuration }: { status: string; backendDuration?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const frozenRef = useRef<number | null>(null);

  useEffect(() => {
    if (status === "running") {
      startRef.current = Date.now();
      frozenRef.current = null;
      setElapsed(0);
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else if (status === "success" || status === "failed") {
      // Freeze the elapsed time when transitioning from running
      if (frozenRef.current === null && elapsed > 0) {
        frozenRef.current = elapsed;
      }
    }
  }, [status]);

  // If backend provides a duration, use it
  if (backendDuration) {
    const color = status === "failed" ? "text-red-500" : "text-emerald-600";
    return (
      <motion.span
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        className={`text-[9px] font-mono ${color} flex items-center gap-0.5 mt-0.5`}
      >
        <Timer className="w-2.5 h-2.5" />
        {backendDuration}
      </motion.span>
    );
  }

  const displayElapsed = frozenRef.current ?? elapsed;
  if (displayElapsed === 0 && status !== "running") return null;

  const mins = Math.floor(displayElapsed / 60);
  const secs = displayElapsed % 60;
  const display = mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;

  const color = status === "running" ? "text-blue-500" : status === "failed" ? "text-red-500" : "text-emerald-600";

  return (
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-[9px] font-mono ${color} flex items-center gap-0.5 mt-0.5`}
    >
      <Timer className="w-2.5 h-2.5" />
      {display}
    </motion.span>
  );
}

// ─── Circular Step Node ─────────────────────────────────────────────────────

interface StepNodeProps {
  stage: ParsedStage;
  theme: { border: string };
  stageIdx: number;
  cIdx: number;
  isSelected: boolean;
  isConfigured: boolean;
  onClick: () => void;
}

function StepNode({ stage, theme, stageIdx, cIdx, isSelected, isConfigured, onClick }: StepNodeProps) {
  const NodeIcon = PIPELINE_NODE_ICONS[stage.type];
  const status = stage.status || "pending";
  const statusCfg = STATUS_CONFIG[status] || DEFAULT_STATUS;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 + stageIdx * 0.1 + cIdx * 0.06 }}
      className="flex flex-col items-center"
    >
      {cIdx > 0 && (
        <div className="w-px h-3 border-l-2 border-dashed my-0.5" style={{ borderColor: theme.border + "40" }} />
      )}
      <div className="flex flex-col items-center group cursor-pointer" onClick={onClick}>
        <div className="relative">
          <div
            className={cn("w-[52px] h-[52px] rounded-full flex items-center justify-center", statusCfg.pulse && "animate-pulse")}
            style={{ backgroundColor: statusCfg.color + "20" }}
          >
            <div
              className={cn(
                "w-11 h-11 rounded-full border-[3px] flex items-center justify-center",
                "bg-white shadow-sm transition-all duration-200",
                "group-hover:shadow-md group-hover:scale-110",
                isSelected && "ring-2 ring-offset-1"
              )}
              style={{ borderColor: statusCfg.color }}
            >
              {NodeIcon ? <NodeIcon className="w-5 h-5" /> : <Server className="w-5 h-5" style={{ color: theme.border }} />}
            </div>
          </div>
          <div
            className="absolute -bottom-0.5 right-0 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center"
            style={{ backgroundColor: statusCfg.color }}
          >
            <statusCfg.icon className="w-2 h-2 text-white" />
          </div>
          {isConfigured && (
            <div className="absolute -top-0.5 -left-0.5 w-3.5 h-3.5 rounded-full bg-primary border-2 border-white flex items-center justify-center">
              <Link className="w-2 h-2 text-white" />
            </div>
          )}
        </div>
        <span className="text-[10px] text-foreground/80 mt-1 text-center max-w-[90px] leading-tight font-medium">
          {stage.label}
        </span>
        <Badge
          variant="outline"
          className="mt-0.5 text-[8px] px-1 py-0 h-3.5 font-medium border"
          style={{ borderColor: statusCfg.color + "60", color: statusCfg.color }}
        >
          {statusCfg.label}
        </Badge>
        {(status === "running" || status === "success" || status === "failed") && (
          <StageDurationDisplay status={status} backendDuration={stage.duration} />
        )}
      </div>
    </motion.div>
  );
}

// ─── Node Config Panel ──────────────────────────────────────────────────────

interface NodeConfigPanelProps {
  stage: ParsedStage;
  envId: string;
  connectors: ConnectorRecord[];
  connectorsLoading: boolean;
  stagesState: Record<string, Record<string, string>>;
  onFieldChange: (stageKey: string, field: string, value: string) => void;
  onClose: () => void;
}

function NodeConfigPanel({
  stage, envId, connectors, connectorsLoading, stagesState, onFieldChange, onClose,
}: NodeConfigPanelProps) {
  const stageKey = `${envId}__${stage.id}`;
  const isDeploy = stage.category === "deploy";
  const isCode = stage.category === "code";
  const status = stage.status || "pending";
  const statusCfg = STATUS_CONFIG[status] || DEFAULT_STATUS;
  const NodeIcon = PIPELINE_NODE_ICONS[stage.type];

  const availableConnectors = connectors.filter(
    (c) => c.category?.toLowerCase() === stage.category
  );

  const fields = stagesState[stageKey] || {};

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute top-0 right-0 h-full w-[320px] bg-background border-l border-border shadow-xl z-20 overflow-y-auto"
    >
      <div className="sticky top-0 bg-background border-b border-border z-10 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center bg-white"
              style={{ borderColor: statusCfg.color }}
            >
              {NodeIcon ? <NodeIcon className="w-4 h-4" /> : <Server className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-semibold text-xs text-foreground">{stage.label}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <Badge variant="outline" className="text-[9px] capitalize px-1 h-3.5">{stage.category}</Badge>
                <Badge variant="outline" className="text-[9px] px-1 h-3.5" style={{ borderColor: statusCfg.color + "60", color: statusCfg.color }}>
                  {statusCfg.label}
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Settings className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Properties</span>
          </div>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex justify-between py-1 px-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium capitalize">{stage.category}</span>
            </div>
            <div className="flex justify-between py-1 px-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Tool</span>
              <span className="font-medium capitalize">{stage.tool.replace(/_/g, " ")}</span>
            </div>
            <div className="flex justify-between py-1 px-2 rounded bg-muted/30">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium" style={{ color: statusCfg.color }}>{statusCfg.label}</span>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Link className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Configuration</span>
          </div>
          <div className="space-y-3">
            {isDeploy ? (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Environment</Label>
                <Select value={fields.environment || ""} onValueChange={(v) => onFieldChange(stageKey, "environment", v)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Select environment..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-[100]">
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="qa">QA</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="uat">UAT</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Connector</Label>
                <Select value={fields.connector || ""} onValueChange={(v) => onFieldChange(stageKey, "connector", v)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue
                      placeholder={
                        connectorsLoading ? "Loading..." :
                        availableConnectors.length === 0 ? "No connectors" :
                        "Select connector..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-[100]">
                    {availableConnectors.length === 0 ? (
                      <SelectItem value="__none" disabled>No {stage.category} connectors</SelectItem>
                    ) : (
                      availableConnectors.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          <span>{conn.name}</span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isCode && fields.connector && (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Repository URL</Label>
                  <Input className="h-7 text-xs" placeholder="https://github.com/org/repo" value={fields.repoUrl || ""} onChange={(e) => onFieldChange(stageKey, "repoUrl", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Branch</Label>
                  <Input className="h-7 text-xs" placeholder="main" value={fields.branch || ""} onChange={(e) => onFieldChange(stageKey, "branch", e.target.value)} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface PipelineFlowPreviewProps {
  pipelineName: string | null;
  executionStatus?: string;
  activeStageIndex?: number;
  /** Per-node execution status from backend: { [nodeId]: { status, startedAt, completedAt, message } } */
  stageStates?: Record<string, { status?: string; startedAt?: string; completedAt?: string; message?: string }>;
  /** Currently executing node ID from backend */
  currentNode?: string;
}

export function PipelineFlowPreview({ pipelineName, executionStatus, activeStageIndex, stageStates, currentNode }: PipelineFlowPreviewProps) {
  const { pipelines, isLoading } = usePipelines();
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { connectors, isLoading: connectorsLoading } = useConnectors(
    selectedAccount?.id,
    selectedEnterprise?.id
  );

  const [selectedStage, setSelectedStage] = useState<{ stage: ParsedStage; envId: string } | null>(null);
  const [configState, setConfigState] = useState<Record<string, Record<string, string>>>({});

  const pipeline = useMemo(() => {
    if (!pipelineName) return null;
    return pipelines.find((p) => p.name.toLowerCase() === pipelineName.toLowerCase()) || null;
  }, [pipelines, pipelineName]);

  const environmentNodes = useMemo(() => {
    if (!pipeline) return [];
    const nodes = Array.isArray(pipeline.nodes) ? pipeline.nodes : [];
    const edges = Array.isArray(pipeline.edges) ? pipeline.edges : [];
    const parsed = parsePipelineStructure(nodes as any[], edges as any[]);
    
    // Apply real-time stage states from backend execution
    if (stageStates && Object.keys(stageStates).length > 0) {
      parsed.forEach((env) => {
        // Check if the environment itself has a status
        if (stageStates[env.id]) {
          env.status = stageStates[env.id].status;
        }
        env.stages.forEach((stage) => {
          const state = stageStates[stage.id];
          if (state?.status) {
            stage.status = state.status.toLowerCase();
          } else if (currentNode === stage.id) {
            stage.status = "running";
          }
        });
      });
    } else if (executionStatus === "running" && activeStageIndex !== undefined && activeStageIndex >= 0) {
      // Fallback: use activeStageIndex for simulated execution (non-AWS mode)
      let flatIdx = 0;
      parsed.forEach((env) => {
        env.stages.forEach((stage) => {
          if (flatIdx < activeStageIndex) {
            stage.status = "success";
          } else if (flatIdx === activeStageIndex) {
            stage.status = "running";
          } else {
            stage.status = "pending";
          }
          flatIdx++;
        });
      });
    } else if (executionStatus === "success") {
      parsed.forEach((env) => {
        env.stages.forEach((stage) => { stage.status = "success"; });
      });
    } else if (executionStatus === "failed" && activeStageIndex !== undefined) {
      let flatIdx = 0;
      parsed.forEach((env) => {
        env.stages.forEach((stage) => {
          if (flatIdx < activeStageIndex) {
            stage.status = "success";
          } else if (flatIdx === activeStageIndex) {
            stage.status = "failed";
          } else {
            stage.status = "pending";
          }
          flatIdx++;
        });
      });
    }
    
    return parsed;
  }, [pipeline, stageStates, currentNode, executionStatus, activeStageIndex]);

  const handleFieldChange = (stageKey: string, field: string, value: string) => {
    setConfigState((prev) => ({
      ...prev,
      [stageKey]: { ...(prev[stageKey] || {}), [field]: value },
    }));
  };

  const isStageConfigured = (envId: string, stageId: string) => {
    const key = `${envId}__${stageId}`;
    const fields = configState[key];
    return !!(fields?.connector || fields?.environment);
  };

  if (!pipelineName) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
        <GitBranch className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs font-medium">No pipeline assigned</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-6">
        <RotateCw className="w-5 h-5 text-primary animate-spin" />
      </div>
    );
  }

  if (!pipeline || environmentNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
        <GitBranch className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs font-medium">Pipeline: {pipelineName}</p>
        <p className="text-[10px] mt-0.5">No environment nodes configured</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div className="overflow-x-auto p-4 h-full">
        <div className="flex items-start gap-0 min-w-max">
          {/* Environment Stages */}
          {environmentNodes.map((env, idx) => {
            const theme = STAGE_THEMES[env.type] || DEFAULT_STAGE_THEME;
            const Icon = theme.icon;

            return (
              <div key={env.id} className="flex items-start gap-0">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + idx * 0.1 }}
                  className="flex flex-col items-center"
                >
                  <div
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg min-w-[140px] shadow-sm"
                    style={{ backgroundColor: theme.headerBg, color: theme.text }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="font-bold text-xs">{env.label}</span>
                  </div>

                  {env.stages.length > 0 ? (
                    <div className="flex flex-col items-center mt-2">
                      <div className="w-px h-3 border-l-2 border-dashed" style={{ borderColor: theme.border + "60" }} />
                      <div className="flex flex-col items-center gap-0">
                        {env.stages.map((stage, cIdx) => (
                          <StepNode
                            key={stage.id}
                            stage={stage}
                            theme={theme}
                            stageIdx={idx}
                            cIdx={cIdx}
                            isSelected={selectedStage?.stage.id === stage.id}
                            isConfigured={isStageConfigured(env.id, stage.id)}
                            onClick={() =>
                              setSelectedStage((prev) =>
                                prev?.stage.id === stage.id ? null : { stage, envId: env.id }
                              )
                            }
                          />
                        ))}
                      </div>
                      <div className="w-px h-3 border-l-2 border-dashed mt-0.5" style={{ borderColor: theme.border + "40" }} />
                    </div>
                  ) : (
                    <div className="mt-3 px-3 py-4 border-2 border-dashed rounded-lg text-center" style={{ borderColor: theme.border + "30" }}>
                      <p className="text-[9px] text-muted-foreground">No steps</p>
                    </div>
                  )}
                </motion.div>

                {idx < environmentNodes.length - 1 && <StageArrow delay={0.2 + idx * 0.1} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Slide-in Config Panel */}
      <AnimatePresence>
        {selectedStage && (
          <NodeConfigPanel
            stage={selectedStage.stage}
            envId={selectedStage.envId}
            connectors={connectors}
            connectorsLoading={connectorsLoading}
            stagesState={configState}
            onFieldChange={handleFieldChange}
            onClose={() => setSelectedStage(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
