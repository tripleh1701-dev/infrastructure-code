import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BuildJob, useBuilds } from "@/hooks/useBuilds";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  XCircle,
  Zap,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  FileDown,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PipelineStagesSubRow } from "./PipelineStagesSubRow";

const columnLabels: Record<string, string> = {
  connector_name: "Job Name",
  description: "Description",
  entity: "Workstream",
  pipeline: "Pipeline Name",
  status: "Status",
  scope: "Artifacts",
  builds: "Builds",
};

interface BuildsTableProps {
  builds: BuildJob[];
  visibleColumns: string[];
  groupBy: string | null;
  onOpenDetail: (job: BuildJob) => void;
  onDelete: (job: BuildJob) => void;
  selectedBuildId?: string;
}

export function BuildsTable({
  builds,
  visibleColumns,
  groupBy,
  onOpenDetail,
  onDelete,
  selectedBuildId,
}: BuildsTableProps) {
  const { updateBuildJob } = useBuilds();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const groupedBuilds = useMemo(() => {
    if (!groupBy) return { "": builds };
    const groups: Record<string, BuildJob[]> = {};
    builds.forEach((b) => {
      const key = (b as any)[groupBy] || "Ungrouped";
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    });
    return groups;
  }, [builds, groupBy]);

  const renderRow = (build: BuildJob, index: number) => {
    const isExpanded = expandedRows.has(build.id);
    const isActive = build.status === "ACTIVE";
    const isSelected = selectedBuildId === build.id;

    return (
      <>
        <motion.tr
          key={build.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.03 }}
          className={cn(
            "border-b border-border/40 hover:bg-primary/3 transition-all group cursor-pointer",
            isSelected && "bg-primary/5 border-l-2 border-l-primary shadow-sm",
            isExpanded && "bg-muted/20"
          )}
          onClick={() => onOpenDetail(build)}
        >
          <td className="px-3 py-4 w-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(build.id);
              }}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200",
                isExpanded
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronRight className="w-4 h-4" />
              </motion.div>
            </button>
          </td>

          {visibleColumns.includes("connector_name") && (
            <td className="px-5 py-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                  isSelected ? "icon-gradient shadow-md" : "bg-primary/10"
                )}>
                  <Zap className={cn("w-4 h-4", isSelected ? "text-white" : "text-primary")} />
                </div>
                <div>
                  <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{build.connector_name}</p>
                  <p className="text-[10px] text-muted-foreground">{build.product} / {build.service}</p>
                </div>
              </div>
            </td>
          )}

          {visibleColumns.includes("description") && (
            <td className="px-5 py-4">
              <p className="text-sm text-foreground/80 line-clamp-1">
                {build.description || "—"}
              </p>
            </td>
          )}

          {visibleColumns.includes("entity") && (
            <td className="px-5 py-4">
              {build.entity ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted/50 border border-border/30 text-foreground/80">
                  {build.entity}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </td>
          )}

          {visibleColumns.includes("pipeline") && (
            <td className="px-5 py-4">
              {build.pipeline ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/5 border border-primary/10 text-primary">
                  <GitBranch className="w-2.5 h-2.5" />
                  {build.pipeline}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </td>
          )}

          {visibleColumns.includes("status") && (
            <td className="px-5 py-4">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                  isActive ? "status-success" : "bg-muted text-muted-foreground"
                )}
              >
                {isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {build.status}
              </span>
            </td>
          )}

          {visibleColumns.includes("scope") && (
            <td className="px-5 py-4">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileDown className="w-3.5 h-3.5" />
                {build.scope || "None"}
              </div>
            </td>
          )}

          {visibleColumns.includes("builds") && (
            <td className="px-5 py-4">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-primary hover:text-primary/80 hover:bg-primary/10 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDetail(build);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                View
              </Button>
            </td>
          )}

          <td className="px-3 py-4 w-10">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(build);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </td>
        </motion.tr>

        <AnimatePresence>
          {isExpanded && (
            <motion.tr
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <td colSpan={visibleColumns.length + 2} className="p-0">
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mx-4 my-3 rounded-xl border border-border/50 bg-gradient-to-br from-card via-background to-card shadow-sm overflow-hidden">
                    {/* Mini summary bar */}
                    <div className="flex items-center gap-4 px-5 py-3 bg-muted/20 border-b border-border/30">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-6 h-6 rounded-md flex items-center justify-center",
                          isActive ? "bg-[hsl(var(--success))]/10" : "bg-muted"
                        )}>
                          {isActive ? <CheckCircle className="w-3 h-3 text-[hsl(var(--success))]" /> : <XCircle className="w-3 h-3 text-muted-foreground" />}
                        </div>
                        <span className="text-xs font-semibold text-foreground">{build.connector_name}</span>
                      </div>
                      {build.pipeline && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/5 border border-primary/10 text-primary">
                          <GitBranch className="w-2.5 h-2.5" />
                          {build.pipeline}
                        </span>
                      )}
                      <div className="flex-1" />
                      <span className="text-[10px] text-muted-foreground">
                        {build.product} / {build.service}
                        {build.entity && ` • ${build.entity}`}
                      </span>
                    </div>

                    {/* Stage configuration content */}
                    <PipelineStagesSubRow
                      build={build}
                      onUpdateStagesState={(buildId, state) => {
                        updateBuildJob.mutate({
                          id: buildId,
                          pipeline_stages_state: state as any,
                        } as any);
                      }}
                    />
                  </div>
                </motion.div>
              </td>
            </motion.tr>
          )}
        </AnimatePresence>
      </>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="spark-card overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-3 w-10" />
              {visibleColumns.map((col) => (
                <th
                  key={col}
                  className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  {columnLabels[col]}
                </th>
              ))}
              <th className="px-3 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedBuilds).map(([group, items]) => (
              <>
                {groupBy && group && (
                  <tr key={`group-${group}`}>
                    <td
                      colSpan={visibleColumns.length + 2}
                      className="px-5 py-2 bg-primary/5 text-sm font-semibold text-primary border-b border-border/30"
                    >
                      {columnLabels[groupBy!] || groupBy}: {group} ({items.length})
                    </td>
                  </tr>
                )}
                {items.map((build, index) => renderRow(build, index))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-border/30 bg-muted/10">
        <p className="text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{builds.length}</span> job{builds.length !== 1 ? "s" : ""}
        </p>
      </div>
    </motion.div>
  );
}
