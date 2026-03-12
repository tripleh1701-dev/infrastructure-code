/**
 * PipelineSwimlaneView - Horizontal swimlane visualization
 * Each environment is a horizontal lane with workflow steps flowing left-to-right.
 * Steps show status, icons, and are clickable for details.
 */
import { memo, useMemo, useState, useCallback } from "react";
import { Node, Edge } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor, FlaskConical, Rocket, Server,
  ChevronRight, ArrowRight, X, Clock, Loader2,
  AlertCircle, AlertTriangle, CheckCircle, XCircle,
  SkipForward, Zap, Layers,
} from "lucide-react";
import { PIPELINE_NODE_ICONS } from "./icons/BrandIcons";
import { NODE_LABELS } from "@/constants/pipeline";
import { WorkflowNodeType } from "@/types/pipeline";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PipelineSwimlaneViewProps {
  nodes: Node[];
  edges: Edge[];
  onUpdateNode?: (nodeId: string, data: Record<string, unknown>) => void;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ElementType; pulse?: boolean }> = {
  success: { color: "#10b981", label: "Success", icon: CheckCircle },
  running: { color: "#3b82f6", label: "Running", icon: Loader2, pulse: true },
  failed:  { color: "#ef4444", label: "Failed", icon: AlertCircle },
  warning: { color: "#f59e0b", label: "Warning", icon: AlertTriangle },
  pending: { color: "#94a3b8", label: "Pending", icon: Clock },
};
const DEFAULT_STATUS = STATUS_CONFIG.pending;

const STAGE_THEMES: Record<string, { gradient: string; border: string; accent: string; icon: React.ElementType; label: string }> = {
  env_dev:     { gradient: "from-emerald-500/10 to-emerald-500/5", border: "border-emerald-500/30", accent: "#16a34a", icon: Monitor, label: "Development" },
  env_qa:      { gradient: "from-blue-500/10 to-blue-500/5", border: "border-blue-500/30", accent: "#2563eb", icon: FlaskConical, label: "QA" },
  env_staging: { gradient: "from-amber-500/10 to-amber-500/5", border: "border-amber-500/30", accent: "#ca8a04", icon: Server, label: "Staging" },
  env_uat:     { gradient: "from-violet-500/10 to-violet-500/5", border: "border-violet-500/30", accent: "#7c3aed", icon: FlaskConical, label: "UAT" },
  env_prod:    { gradient: "from-teal-500/10 to-teal-500/5", border: "border-teal-500/30", accent: "#0d9488", icon: Rocket, label: "Production" },
};
const DEFAULT_THEME = { gradient: "from-indigo-500/10 to-indigo-500/5", border: "border-indigo-500/30", accent: "#4f46e5", icon: Server, label: "Stage" };
const DEPLOYMENT_ORDER = ["env_dev", "env_qa", "env_staging", "env_uat", "env_prod"];

interface LaneData {
  id: string;
  label: string;
  nodeType: string;
  children: Node[];
  status: string;
}

function PipelineSwimlaneViewComponent({ nodes, edges }: PipelineSwimlaneViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const lanes = useMemo(() => {
    const envNodes = nodes.filter(n => n.type === "environmentGroup" || (n.data.nodeType as string)?.startsWith("env_"));
    const childNodes = nodes.filter(n => n.type === "pipeline" || (n.type !== "environmentGroup" && !(n.data.nodeType as string)?.startsWith("env_")));

    const sortedEnvs = [...envNodes].sort((a, b) => {
      const aIdx = DEPLOYMENT_ORDER.indexOf(a.data.nodeType as string);
      const bIdx = DEPLOYMENT_ORDER.indexOf(b.data.nodeType as string);
      return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999);
    });

    const laneList: LaneData[] = sortedEnvs.map(env => {
      const children = childNodes.filter(c => c.parentId === env.id);
      if (children.length === 0) {
        const connectedIds = new Set<string>();
        edges.forEach(e => {
          if (e.source === env.id) connectedIds.add(e.target);
          if (e.target === env.id) connectedIds.add(e.source);
        });
        const connected = childNodes.filter(c => connectedIds.has(c.id));
        return { id: env.id, label: (env.data.label as string) || "Stage", nodeType: env.data.nodeType as string, children: connected, status: (env.data.status as string) || "Pending" };
      }
      return { id: env.id, label: (env.data.label as string) || "Stage", nodeType: env.data.nodeType as string, children, status: (env.data.status as string) || "Pending" };
    });

    const assignedIds = new Set(laneList.flatMap(s => s.children.map(c => c.id)));
    const orphans = childNodes.filter(c => !assignedIds.has(c.id) && !c.parentId);
    if (laneList.length === 0 && orphans.length > 0) {
      laneList.push({ id: "default-lane", label: "Pipeline", nodeType: "env_dev", children: orphans, status: "Pending" });
    }
    return laneList;
  }, [nodes, edges]);

  const totalSteps = lanes.reduce((sum, l) => sum + l.children.length, 0);
  const completedSteps = lanes.reduce((sum, l) => sum + l.children.filter(c => (c.data.status as string) === "success").length, 0);
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  if (lanes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Add environment nodes and workflow steps to see the swimlane view.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/10 p-6">
      {/* Header summary */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Pipeline Swimlanes</h3>
            <p className="text-xs text-muted-foreground">{lanes.length} environments &middot; {totalSteps} steps</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">{progressPct}% complete</div>
          <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: progressPct === 100 ? "#10b981" : "#3b82f6" }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>
      </motion.div>

      {/* Swimlanes */}
      <div className="space-y-4">
        {lanes.map((lane, laneIdx) => {
          const theme = STAGE_THEMES[lane.nodeType] || DEFAULT_THEME;
          const Icon = theme.icon;
          const laneStatusCfg = STATUS_CONFIG[(lane.status || "pending").toLowerCase()] || DEFAULT_STATUS;

          return (
            <motion.div
              key={lane.id}
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: laneIdx * 0.1, type: "spring", damping: 20 }}
              className={cn(
                "rounded-2xl border overflow-hidden",
                theme.border,
                "bg-gradient-to-r",
                theme.gradient
              )}
            >
              {/* Lane header */}
              <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: theme.accent + "20" }}>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: theme.accent + "18" }}
                >
                  <Icon className="w-4 h-4" style={{ color: theme.accent }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{lane.label}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 h-4 font-medium"
                      style={{ borderColor: laneStatusCfg.color + "50", color: laneStatusCfg.color }}
                    >
                      {laneStatusCfg.label}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{lane.children.length} workflow steps</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{lane.children.filter(c => (c.data.status as string) === "success").length}/{lane.children.length}</span>
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                </div>
              </div>

              {/* Steps row */}
              <div className="px-5 py-4 overflow-x-auto">
                {lane.children.length > 0 ? (
                  <div className="flex items-center gap-0 min-w-max">
                    {lane.children.map((child, cIdx) => {
                      const childNodeType = child.data.nodeType as string;
                      const NodeIcon = PIPELINE_NODE_ICONS[childNodeType];
                      const childLabel = (child.data.label as string) || NODE_LABELS[childNodeType as WorkflowNodeType] || childNodeType;
                      const status = (child.data.status as string) || "pending";
                      const statusCfg = STATUS_CONFIG[status] || DEFAULT_STATUS;
                      const StatusIcon = statusCfg.icon;
                      const isSelected = selectedNodeId === child.id;

                      return (
                        <div key={child.id} className="flex items-center gap-0">
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: laneIdx * 0.1 + cIdx * 0.06 }}
                            onClick={() => setSelectedNodeId(prev => prev === child.id ? null : child.id)}
                            className={cn(
                              "relative flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200",
                              "hover:bg-background/80 hover:shadow-md hover:scale-[1.03]",
                              isSelected && "bg-background shadow-lg scale-[1.03] ring-2 ring-offset-1"
                            )}
                            style={isSelected ? { "--tw-ring-color": statusCfg.color } as React.CSSProperties : undefined}
                          >
                            {/* Node circle */}
                            <div className="relative">
                              <div
                                className={cn(
                                  "w-12 h-12 rounded-full flex items-center justify-center border-[2.5px] bg-background shadow-sm transition-shadow",
                                  statusCfg.pulse && "animate-pulse"
                                )}
                                style={{ borderColor: statusCfg.color }}
                              >
                                {NodeIcon ? (
                                  <NodeIcon className="w-5 h-5" />
                                ) : (
                                  <Zap className="w-5 h-5" style={{ color: theme.accent }} />
                                )}
                              </div>
                              {/* Status dot */}
                              <div
                                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center"
                                style={{ backgroundColor: statusCfg.color }}
                              >
                                <StatusIcon className="w-2.5 h-2.5 text-white" />
                              </div>
                            </div>
                            {/* Label */}
                            <span className="text-[11px] font-medium text-foreground/80 text-center max-w-[90px] leading-tight">
                              {childLabel}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[8px] px-1 py-0 h-3.5 font-medium"
                              style={{ borderColor: statusCfg.color + "50", color: statusCfg.color }}
                            >
                              {statusCfg.label}
                            </Badge>
                          </motion.div>

                          {/* Arrow connector between steps */}
                          {cIdx < lane.children.length - 1 && (
                            <div className="flex items-center mx-1">
                              <div className="w-6 h-px border-t-2 border-dashed" style={{ borderColor: theme.accent + "40" }} />
                              <ChevronRight className="w-3.5 h-3.5 -ml-0.5" style={{ color: theme.accent + "80" }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-6 border-2 border-dashed rounded-lg" style={{ borderColor: theme.accent + "20" }}>
                    <p className="text-xs text-muted-foreground">No workflow steps in this lane</p>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Cross-lane connections: arrows between environment lanes */}
      {lanes.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-2 mt-4 py-2"
        >
          {lanes.map((lane, idx) => {
            const theme = STAGE_THEMES[lane.nodeType] || DEFAULT_THEME;
            return (
              <div key={lane.id} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: theme.accent }}
                />
                <span className="text-[10px] font-medium text-muted-foreground">{lane.label}</span>
                {idx < lanes.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-muted-foreground/50 ml-1" />
                )}
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

export const PipelineSwimlaneView = memo(PipelineSwimlaneViewComponent);
