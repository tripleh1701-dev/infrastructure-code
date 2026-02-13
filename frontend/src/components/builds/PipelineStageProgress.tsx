import { motion } from "framer-motion";
import { CheckCircle, XCircle, RotateCw, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PipelineStage {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  duration?: string;
  startedAt?: string;
}

const stageStatusConfig = {
  pending: { icon: Clock, color: "bg-slate-200 text-slate-500", lineColor: "bg-slate-200", label: "Pending" },
  running: { icon: RotateCw, color: "bg-blue-500 text-white", lineColor: "bg-blue-400", label: "Running" },
  success: { icon: CheckCircle, color: "bg-emerald-500 text-white", lineColor: "bg-emerald-400", label: "Success" },
  failed: { icon: XCircle, color: "bg-red-500 text-white", lineColor: "bg-red-400", label: "Failed" },
  skipped: { icon: Clock, color: "bg-slate-100 text-slate-400", lineColor: "bg-slate-200", label: "Skipped" },
};

interface PipelineStageProgressProps {
  stages: PipelineStage[];
}

export function PipelineStageProgress({ stages }: PipelineStageProgressProps) {
  if (stages.length === 0) return null;

  return (
    <div className="w-full">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Pipeline Stages</h4>
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {stages.map((stage, i) => {
          const cfg = stageStatusConfig[stage.status];
          const Icon = cfg.icon;
          const isLast = i === stages.length - 1;

          return (
            <div key={stage.id} className="flex items-center flex-shrink-0">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col items-center gap-1.5"
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center shadow-sm transition-all",
                    cfg.color
                  )}
                >
                  <Icon className={cn("w-4 h-4", stage.status === "running" && "animate-spin")} />
                </div>
                <div className="text-center max-w-[80px]">
                  <p className="text-[10px] font-medium text-slate-700 truncate">{stage.name}</p>
                  {stage.duration && (
                    <p className="text-[9px] text-slate-400">{stage.duration}</p>
                  )}
                </div>
              </motion.div>
              {!isLast && (
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: i * 0.1 + 0.05 }}
                  className={cn("h-0.5 w-8 mx-1 origin-left", cfg.lineColor)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
