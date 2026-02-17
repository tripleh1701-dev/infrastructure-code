import { motion } from "framer-motion";
import { CheckCircle, XCircle, RotateCw, Clock, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { BuildExecution } from "@/hooks/useBuilds";

const statusConfig: Record<string, { icon: typeof CheckCircle; dotColor: string; lineColor: string }> = {
  success: { icon: CheckCircle, dotColor: "bg-emerald-500", lineColor: "bg-emerald-200" },
  failed: { icon: XCircle, dotColor: "bg-red-500", lineColor: "bg-red-200" },
  running: { icon: RotateCw, dotColor: "bg-blue-500", lineColor: "bg-blue-200" },
  pending: { icon: Clock, dotColor: "bg-slate-300", lineColor: "bg-slate-200" },
};

interface BuildExecutionTimelineProps {
  executions: BuildExecution[];
  selectedId?: string;
  onSelect: (exec: BuildExecution) => void;
}

export function BuildExecutionTimeline({ executions, selectedId, onSelect }: BuildExecutionTimelineProps) {
  if (executions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <Clock className="w-8 h-8 mb-2" />
        <p className="text-sm">No executions yet</p>
        <p className="text-xs">Click Run to start a build</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {executions.map((exec, i) => {
        const cfg = statusConfig[exec.status] || statusConfig.pending;
        const Icon = cfg.icon;
        const isSelected = selectedId === exec.id;
        const isLast = i === executions.length - 1;

        return (
          <motion.div
            key={exec.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "relative flex gap-3 pl-6 pb-4 cursor-pointer group",
              isSelected && "bg-blue-50/50 -mx-2 px-8 rounded-lg"
            )}
            onClick={() => onSelect(exec)}
          >
            {/* Timeline line */}
            {!isLast && (
              <div className={cn("absolute left-[11px] top-6 bottom-0 w-0.5", cfg.lineColor)} />
            )}

            {/* Dot */}
            <div className={cn("absolute left-0 top-1 w-[22px] h-[22px] rounded-full flex items-center justify-center", cfg.dotColor)}>
              <Icon className={cn("w-3 h-3 text-white", exec.status === "running" && "animate-spin")} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 ml-2">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm text-slate-800">{exec.build_number}</p>
                <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                  <GitBranch className="w-3 h-3" />
                  {exec.branch}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                <span>{exec.timestamp ? new Date(exec.timestamp).toLocaleString() : "—"}</span>
                {exec.duration && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {exec.duration}
                  </span>
                )}
              </div>
              {exec.jira_number && (
                <span className="text-[10px] text-blue-500 mt-0.5 block">{exec.jira_number}</span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
