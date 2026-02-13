/**
 * PipelineFlowView - Structured CI/CD pipeline visualization
 * Shows environment stages horizontally with workflow steps flowing vertically within each stage.
 * Nodes show execution status colors and are clickable to reveal properties & event actions.
 */
import { memo, useMemo, useState, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor, FlaskConical, Rocket, Server,
  ArrowRight, ChevronUp, X,
  Settings, Clock, Loader2, AlertCircle, AlertTriangle,
  CheckCircle, XCircle, SkipForward, Mail, MessageSquare,
  Bell, Webhook, RotateCcw, Zap,
} from "lucide-react";
import { PIPELINE_NODE_ICONS } from "./icons/BrandIcons";
import { NODE_LABELS } from "@/constants/pipeline";
import { WorkflowNodeType } from "@/types/pipeline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PipelineFlowViewProps {
  nodes: Node[];
  edges: Edge[];
  onUpdateNode?: (nodeId: string, data: Record<string, unknown>) => void;
}

// Status configuration
const STATUS_CONFIG: Record<string, { color: string; bg: string; ring: string; label: string; icon: React.ElementType; pulse?: boolean }> = {
  success: { color: "#10b981", bg: "bg-emerald-50", ring: "ring-emerald-400", label: "Success", icon: CheckCircle },
  running: { color: "#3b82f6", bg: "bg-blue-50", ring: "ring-blue-400", label: "Running", icon: Loader2, pulse: true },
  failed:  { color: "#ef4444", bg: "bg-red-50", ring: "ring-red-400", label: "Failed", icon: AlertCircle },
  warning: { color: "#f59e0b", bg: "bg-amber-50", ring: "ring-amber-400", label: "Warning", icon: AlertTriangle },
  pending: { color: "#94a3b8", bg: "bg-slate-50", ring: "ring-slate-300", label: "Pending", icon: Clock },
};

const DEFAULT_STATUS = STATUS_CONFIG.pending;

// Event action options
const EVENT_ACTIONS = [
  { value: "none", label: "No Action", icon: SkipForward },
  { value: "notify_email", label: "Send Email", icon: Mail },
  { value: "notify_slack", label: "Slack Message", icon: MessageSquare },
  { value: "notify_teams", label: "Teams Message", icon: Bell },
  { value: "webhook", label: "Trigger Webhook", icon: Webhook },
  { value: "retry", label: "Retry Step", icon: RotateCcw },
  { value: "stop_pipeline", label: "Stop Pipeline", icon: XCircle },
  { value: "continue", label: "Continue", icon: SkipForward },
];

// Stage theme configuration
const STAGE_THEMES: Record<string, { bg: string; border: string; headerBg: string; text: string; icon: React.ElementType }> = {
  env_dev: { bg: "#dcfce7", border: "#16a34a", headerBg: "#16a34a", text: "#ffffff", icon: Monitor },
  env_qa: { bg: "#dbeafe", border: "#2563eb", headerBg: "#2563eb", text: "#ffffff", icon: FlaskConical },
  env_staging: { bg: "#fef9c3", border: "#ca8a04", headerBg: "#ca8a04", text: "#ffffff", icon: Server },
  env_uat: { bg: "#f3e8ff", border: "#7c3aed", headerBg: "#7c3aed", text: "#ffffff", icon: FlaskConical },
  env_prod: { bg: "#fee2e2", border: "#dc2626", headerBg: "#dc2626", text: "#ffffff", icon: Rocket },
};

const DEFAULT_STAGE_THEME = { bg: "#e0e7ff", border: "#4f46e5", headerBg: "#4f46e5", text: "#ffffff", icon: Server };
const DEPLOYMENT_ORDER = ["env_dev", "env_qa", "env_staging", "env_uat", "env_prod"];

interface StageData {
  id: string;
  label: string;
  nodeType: string;
  children: Node[];
  status: string;
}

function PipelineFlowViewComponent({ nodes, edges, onUpdateNode }: PipelineFlowViewProps) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const stages = useMemo(() => {
    const envNodes = nodes.filter(n => n.type === "environmentGroup" || (n.data.nodeType as string)?.startsWith("env_"));
    const childNodes = nodes.filter(n => n.type === "pipeline" || (n.type !== "environmentGroup" && !(n.data.nodeType as string)?.startsWith("env_")));

    const sortedEnvs = [...envNodes].sort((a, b) => {
      const aIdx = DEPLOYMENT_ORDER.indexOf(a.data.nodeType as string);
      const bIdx = DEPLOYMENT_ORDER.indexOf(b.data.nodeType as string);
      return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999);
    });

    const stageList: StageData[] = sortedEnvs.map(env => {
      const children = childNodes.filter(c => c.parentId === env.id);
      if (children.length === 0) {
        const connectedIds = new Set<string>();
        edges.forEach(e => {
          if (e.source === env.id) connectedIds.add(e.target);
          if (e.target === env.id) connectedIds.add(e.source);
        });
        const connected = childNodes.filter(c => connectedIds.has(c.id));
        return { id: env.id, label: (env.data.label as string) || "Stage", nodeType: env.data.nodeType as string, children: connected, status: (env.data.status as string) || "Success" };
      }
      return { id: env.id, label: (env.data.label as string) || "Stage", nodeType: env.data.nodeType as string, children, status: (env.data.status as string) || "Success" };
    });

    const assignedIds = new Set(stageList.flatMap(s => s.children.map(c => c.id)));
    const orphans = childNodes.filter(c => !assignedIds.has(c.id) && !c.parentId);
    if (stageList.length === 0 && orphans.length > 0) {
      stageList.push({ id: "default-stage", label: "Pipeline", nodeType: "env_dev", children: orphans, status: "Pending" });
    }
    return stageList;
  }, [nodes, edges]);

  const handleNodeClick = useCallback((child: Node) => {
    setSelectedNode(prev => prev?.id === child.id ? null : child);
  }, []);

  const handleEventActionChange = useCallback((event: string, action: string) => {
    if (!selectedNode || !onUpdateNode) return;
    const currentEvents = (selectedNode.data?.eventActions as Record<string, string>) || {};
    onUpdateNode(selectedNode.id, {
      ...selectedNode.data,
      eventActions: { ...currentEvents, [event]: action === "none" ? undefined : action },
    });
  }, [selectedNode, onUpdateNode]);

  const handleStatusChange = useCallback((value: string) => {
    if (!selectedNode || !onUpdateNode) return;
    onUpdateNode(selectedNode.id, { ...selectedNode.data, status: value === "none" ? undefined : value });
    setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, status: value === "none" ? undefined : value } } : null);
  }, [selectedNode, onUpdateNode]);

  const getEventAction = (event: string): string => {
    const ea = (selectedNode?.data?.eventActions as Record<string, string>) || {};
    return ea[event] || "none";
  };

  if (stages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Server className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Add environment nodes and workflow steps to see the pipeline flow.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-gradient-to-br from-background to-muted/20 p-6 relative">
      <div className="flex items-start gap-0 min-w-max">
        {/* Environment Stages */}
        {stages.map((stage, idx) => {
          const theme = STAGE_THEMES[stage.nodeType] || DEFAULT_STAGE_THEME;
          const Icon = theme.icon;

          return (
            <div key={stage.id} className="flex items-start gap-0">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + idx * 0.1 }} className="flex flex-col items-center">
                {/* Stage Header */}
                <div className="flex items-center gap-2 px-5 py-3 rounded-lg min-w-[180px] shadow-md" style={{ backgroundColor: theme.headerBg, color: theme.text }}>
                  <Icon className="w-4 h-4" />
                  <span className="font-bold text-sm">{stage.label}</span>
                </div>
                <div className="mt-2 flex items-center justify-between w-full px-2 mb-3">
                  <span className="text-[10px] text-muted-foreground">Status</span>
                  <span className="text-[10px] font-semibold text-foreground">{stage.status}</span>
                </div>

                {/* Workflow steps */}
                {stage.children.length > 0 && (
                  <div className="flex flex-col items-center">
                    <div className="w-px h-4 border-l-2 border-dashed" style={{ borderColor: theme.border + "60" }} />
                    <div className="flex flex-col items-center gap-0">
                      {[...stage.children].reverse().map((child, cIdx) => (
                        <FlowStepNode
                          key={child.id}
                          child={child}
                          cIdx={cIdx}
                          theme={theme}
                          stageIdx={idx}
                          isSelected={selectedNode?.id === child.id}
                          onClick={() => handleNodeClick(child)}
                        />
                      ))}
                    </div>
                    <div className="w-px h-4 border-l-2 border-dashed mt-1" style={{ borderColor: theme.border + "40" }} />
                  </div>
                )}

                {stage.children.length === 0 && (
                  <div className="mt-4 px-4 py-6 border-2 border-dashed rounded-lg text-center" style={{ borderColor: theme.border + "30" }}>
                    <p className="text-[10px] text-muted-foreground">No steps</p>
                  </div>
                )}
              </motion.div>

              {idx < stages.length - 1 && <StageArrow delay={0.2 + idx * 0.1} />}
            </div>
          );
        })}

      </div>

      {/* Node Properties Panel (slides in from right) */}
      <AnimatePresence>
        {selectedNode && (
          <NodePropertiesPanel
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onStatusChange={handleStatusChange}
            onEventActionChange={handleEventActionChange}
            getEventAction={getEventAction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Individual workflow step node with status ring */
interface FlowStepNodeProps {
  child: Node;
  cIdx: number;
  theme: { border: string };
  stageIdx: number;
  isSelected: boolean;
  onClick: () => void;
}

function FlowStepNode({ child, cIdx, theme, stageIdx, isSelected, onClick }: FlowStepNodeProps) {
  const childNodeType = child.data.nodeType as string;
  const NodeIcon = PIPELINE_NODE_ICONS[childNodeType];
  const childLabel = (child.data.label as string) || NODE_LABELS[childNodeType as WorkflowNodeType] || childNodeType;
  const status = (child.data.status as string) || "pending";
  const statusCfg = STATUS_CONFIG[status] || DEFAULT_STATUS;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 + stageIdx * 0.1 + cIdx * 0.08 }}
      className="flex flex-col items-center"
    >
      {cIdx > 0 && (
        <div className="flex flex-col items-center my-1">
          <ChevronUp className="w-3.5 h-3.5" style={{ color: theme.border + "80" }} />
          <div className="w-px h-2 border-l-2 border-dashed" style={{ borderColor: theme.border + "40" }} />
        </div>
      )}

      <div className="flex flex-col items-center group cursor-pointer" onClick={onClick}>
        <div className="relative">
          {/* Status ring */}
          <div
            className={cn(
              "w-[62px] h-[62px] rounded-full flex items-center justify-center",
              statusCfg.pulse && "animate-pulse"
            )}
            style={{ backgroundColor: statusCfg.color + "20" }}
          >
            <div
              className={cn(
                "w-14 h-14 rounded-full border-[3px] flex items-center justify-center",
                "bg-white shadow-sm transition-all duration-200",
                "group-hover:shadow-lg group-hover:scale-110",
                isSelected && "ring-2 ring-offset-2"
              )}
              style={{
                borderColor: statusCfg.color,
                ...(isSelected && { ringColor: statusCfg.color }),
              }}
            >
              {NodeIcon ? (
                <NodeIcon className="w-6 h-6" />
              ) : (
                <Server className="w-6 h-6" style={{ color: theme.border }} />
              )}
            </div>
          </div>

          {/* Status indicator dot */}
          <div
            className="absolute -bottom-0.5 right-0 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center"
            style={{ backgroundColor: statusCfg.color }}
          >
            <statusCfg.icon className="w-2.5 h-2.5 text-white" />
          </div>
        </div>

        <span className="text-xs text-foreground/80 mt-1.5 text-center max-w-[110px] leading-tight font-medium">
          {childLabel}
        </span>
        <Badge
          variant="outline"
          className="mt-0.5 text-[9px] px-1.5 py-0 h-4 font-medium border"
          style={{ borderColor: statusCfg.color + "60", color: statusCfg.color }}
        >
          {statusCfg.label}
        </Badge>
      </div>
    </motion.div>
  );
}

/** Right-side properties panel for the selected node */
interface NodePropertiesPanelProps {
  node: Node;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  onEventActionChange: (event: string, action: string) => void;
  getEventAction: (event: string) => string;
}

function NodePropertiesPanel({ node, onClose, onStatusChange, onEventActionChange, getEventAction }: NodePropertiesPanelProps) {
  const nodeType = node.data.nodeType as string;
  const NodeIcon = PIPELINE_NODE_ICONS[nodeType];
  const label = (node.data.label as string) || NODE_LABELS[nodeType as WorkflowNodeType] || nodeType;
  const category = (node.data.category as string) || "workflow";
  const status = (node.data.status as string) || "pending";
  const statusCfg = STATUS_CONFIG[status] || DEFAULT_STATUS;
  const description = (node.data.description as string) || "";
  const continueOnError = node.data.continueOnError as boolean;
  const parallel = node.data.parallel as boolean;
  const timeout = node.data.timeout as number;
  const retries = node.data.retries as number;

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="fixed top-0 right-0 h-full w-[380px] bg-background border-l border-border shadow-2xl z-50 overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 bg-background border-b border-border z-10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full border-2 flex items-center justify-center bg-white"
              style={{ borderColor: statusCfg.color }}
            >
              {NodeIcon ? <NodeIcon className="w-5 h-5" /> : <Server className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{label}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] capitalize px-1.5 h-4">{category}</Badge>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 h-4"
                  style={{ borderColor: statusCfg.color + "60", color: statusCfg.color }}
                >
                  {statusCfg.label}
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Properties Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Properties</h4>
          </div>
          <div className="space-y-2.5 text-sm">
            <PropertyRow label="Node Type" value={nodeType} />
            <PropertyRow label="ID" value={node.id.slice(0, 12) + "..."} />
            {description && <PropertyRow label="Description" value={description} />}
            {timeout && <PropertyRow label="Timeout" value={`${timeout}s`} />}
            {retries && <PropertyRow label="Retries" value={String(retries)} />}
            {continueOnError && <PropertyRow label="Continue on Error" value="Yes" highlight="amber" />}
            {parallel && <PropertyRow label="Parallel" value="Yes" highlight="blue" />}
          </div>
        </div>

        <Separator />

        {/* Status */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Execution Status</h4>
          </div>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                    {cfg.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Event Actions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Event Actions</h4>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Configure actions for execution outcomes</p>

          {/* On Success */}
          <EventActionSelect
            event="onSuccess"
            label="On Success"
            icon={CheckCircle}
            bgClass="bg-emerald-50/50 border-emerald-200/50"
            labelClass="text-emerald-700"
            iconClass="text-emerald-600"
            value={getEventAction("onSuccess")}
            onChange={(v) => onEventActionChange("onSuccess", v)}
            excludeActions={["retry", "stop_pipeline"]}
          />

          {/* On Warning */}
          <EventActionSelect
            event="onWarning"
            label="On Warning"
            icon={AlertTriangle}
            bgClass="bg-amber-50/50 border-amber-200/50"
            labelClass="text-amber-700"
            iconClass="text-amber-600"
            value={getEventAction("onWarning")}
            onChange={(v) => onEventActionChange("onWarning", v)}
          />

          {/* On Failure */}
          <EventActionSelect
            event="onFailure"
            label="On Failure"
            icon={XCircle}
            bgClass="bg-red-50/50 border-red-200/50"
            labelClass="text-red-700"
            iconClass="text-red-600"
            value={getEventAction("onFailure")}
            onChange={(v) => onEventActionChange("onFailure", v)}
          />
        </div>
      </div>
    </motion.div>
  );
}

/** A single property row */
function PropertyRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/40">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn(
        "text-xs font-medium",
        highlight === "amber" && "text-amber-600",
        highlight === "blue" && "text-blue-600",
        !highlight && "text-foreground"
      )}>{value}</span>
    </div>
  );
}

/** Event action select row */
interface EventActionSelectProps {
  event: string;
  label: string;
  icon: React.ElementType;
  bgClass: string;
  labelClass: string;
  iconClass: string;
  value: string;
  onChange: (value: string) => void;
  excludeActions?: string[];
}

function EventActionSelect({ label, icon: Icon, bgClass, labelClass, iconClass, value, onChange, excludeActions = [] }: EventActionSelectProps) {
  const filteredActions = EVENT_ACTIONS.filter(a => !excludeActions.includes(a.value));

  return (
    <div className={cn("space-y-2 p-3 rounded-lg border mb-2.5", bgClass)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", iconClass)} />
        <span className={cn("text-xs font-semibold", labelClass)}>{label}</span>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 bg-white text-xs">
          <SelectValue placeholder="Select action" />
        </SelectTrigger>
        <SelectContent>
          {filteredActions.map((action) => (
            <SelectItem key={action.value} value={action.value}>
              <div className="flex items-center gap-2">
                <action.icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs">{action.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Horizontal arrow connector between stages */
function StageArrow({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ delay, duration: 0.2 }}
      className="flex items-center self-start mt-[14px] mx-1"
    >
      <div className="w-8 h-px bg-border" />
      <ArrowRight className="w-4 h-4 text-muted-foreground -ml-1" />
    </motion.div>
  );
}

export const PipelineFlowView = memo(PipelineFlowViewComponent);
