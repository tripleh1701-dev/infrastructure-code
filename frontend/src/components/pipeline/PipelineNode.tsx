import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Copy,
  Settings,
  Server,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS } from "@/constants/pipeline";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PIPELINE_NODE_ICONS } from "./icons/BrandIcons";

export interface PipelineNodeData {
  label: string;
  nodeType: string;
  category: string;
  description?: string;
  status?: "pending" | "running" | "success" | "failed";
  duration?: string;
  continueOnError?: boolean;
  parallel?: boolean;
  timeout?: number;
  retries?: number;
  isCustomEnvironment?: boolean;
  customEnvColor?: string;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onConfigure?: (id: string) => void;
}

interface PipelineNodeComponentProps {
  id: string;
  data: PipelineNodeData;
  selected?: boolean;
}

const statusColors: Record<string, string> = {
  pending: "#94a3b8",
  running: "#f59e0b",
  success: "#10b981",
  failed: "#ef4444",
};

function NodeDurationDisplay({ status, backendDuration }: { status: string; backendDuration?: string }) {
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
    } else if ((status === "success" || status === "failed") && frozenRef.current === null && elapsed > 0) {
      frozenRef.current = elapsed;
    }
  }, [status]);

  if (backendDuration) {
    const color = status === "failed" ? "text-red-500" : "text-emerald-600";
    return (
      <span className={`text-[8px] font-mono ${color} flex items-center gap-0.5`}>
        <Timer className="w-2.5 h-2.5" />
        {backendDuration}
      </span>
    );
  }

  const displayElapsed = frozenRef.current ?? elapsed;
  if (displayElapsed === 0 && status !== "running") return null;

  const mins = Math.floor(displayElapsed / 60);
  const secs = displayElapsed % 60;
  const display = mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secs}s`;
  const color = status === "running" ? "text-blue-500" : status === "failed" ? "text-red-500" : "text-emerald-600";

  return (
    <span className={`text-[8px] font-mono ${color} flex items-center gap-0.5`}>
      <Timer className="w-2.5 h-2.5" />
      {display}
    </span>
  );
}

function PipelineNodeComponent({ id, data, selected }: PipelineNodeComponentProps) {
  const [isHovered, setIsHovered] = useState(false);
  const NodeIcon = PIPELINE_NODE_ICONS[data.nodeType];
  const color = CATEGORY_COLORS[data.category] || "#64748b";

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "relative px-2.5 py-2 rounded-lg bg-white border shadow-sm min-w-[120px] max-w-[140px] transition-all duration-150",
        selected ? "shadow-md ring-1 ring-offset-1" : "hover:shadow-md"
      )}
      style={{
        borderColor: color,
        ...(selected && { ringColor: color }),
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-[#64748b] !border-[1.5px] !border-white hover:!bg-[#0171EC] transition-colors"
      />

      {/* Hover Actions */}
      <AnimatePresence>
        {(isHovered || selected) && (
          <motion.div
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white rounded-md shadow-md border border-[#e2e8f0] p-0.5"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 hover:bg-[#f1f5f9]"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onConfigure?.(id);
                  }}
                >
                  <Settings className="w-2.5 h-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>Configure</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 hover:bg-[#f1f5f9]"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDuplicate?.(id);
                  }}
                >
                  <Copy className="w-2.5 h-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>Duplicate</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    data.onDelete?.(id);
                  }}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p>Delete</p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-white border border-[#e2e8f0]"
          style={data.isCustomEnvironment && data.customEnvColor ? {
            backgroundColor: `${data.customEnvColor}15`,
            borderColor: `${data.customEnvColor}40`,
          } : undefined}
        >
          {NodeIcon ? (
            <NodeIcon className="w-4 h-4" />
          ) : data.category === "environment" || data.isCustomEnvironment ? (
            <Server className="w-3.5 h-3.5" style={{ color: data.customEnvColor || color }} />
          ) : (
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#0f172a] truncate leading-tight">
            {data.label}
          </p>
          <p className="text-[10px] text-[#64748b] capitalize leading-tight">{data.category}</p>
        </div>
        {data.status && (
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={cn("w-2 h-2 rounded-full", data.status === "running" && "animate-pulse")}
              style={{ backgroundColor: statusColors[data.status] }}
            />
            {(data.status === "running" || data.status === "success" || data.status === "failed") && (
              <NodeDurationDisplay status={data.status} backendDuration={data.duration} />
            )}
          </div>
        )}
      </div>

      {/* Badges for special properties - compact inline */}
      {(data.continueOnError || data.parallel) && (
        <div className="mt-1.5 flex gap-0.5 flex-wrap">
          {data.continueOnError && (
            <span className="text-[8px] px-1 py-0.5 bg-amber-50 text-amber-600 rounded leading-none">
              ↻ Error
            </span>
          )}
          {data.parallel && (
            <span className="text-[8px] px-1 py-0.5 bg-blue-50 text-blue-600 rounded leading-none">
              ∥ Parallel
            </span>
          )}
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-[#64748b] !border-[1.5px] !border-white hover:!bg-[#0171EC] transition-colors"
      />
    </motion.div>
  );
}

export const PipelineNode = memo(PipelineNodeComponent);
