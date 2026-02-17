import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BuildJob, BuildExecution, useBuilds } from "@/hooks/useBuilds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  X,
  Play,
  Search,
  Copy,
  Edit3,
  CheckCircle,
  XCircle,
  RotateCw,
  Clock,
  Zap,
  GitBranch,
  FileText,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

const executionStatusConfig: Record<string, { icon: typeof CheckCircle; label: string; className: string }> = {
  success: { icon: CheckCircle, label: "Success", className: "status-success" },
  failed: { icon: XCircle, label: "Failed", className: "status-error" },
  running: { icon: RotateCw, label: "Running", className: "status-running" },
  pending: { icon: Clock, label: "Pending", className: "bg-muted text-muted-foreground" },
};

interface BuildDetailModalProps {
  buildJob: BuildJob | null;
  onClose: () => void;
}

export function BuildDetailModal({ buildJob, onClose }: BuildDetailModalProps) {
  const { fetchExecutions, createExecution } = useBuilds();
  const [executions, setExecutions] = useState<BuildExecution[]>([]);
  const [loadingExecs, setLoadingExecs] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<BuildExecution | null>(null);

  useEffect(() => {
    if (buildJob) {
      setLoadingExecs(true);
      fetchExecutions(buildJob.id)
        .then(setExecutions)
        .catch(() => setExecutions([]))
        .finally(() => setLoadingExecs(false));
    } else {
      setExecutions([]);
      setSelectedExecution(null);
    }
  }, [buildJob?.id]);

  const handleRun = async () => {
    if (!buildJob) return;
    setIsRunning(true);
    try {
      const buildNumber = `#${String(executions.length + 1).padStart(4, "0")}`;
      const newExec = await createExecution.mutateAsync({
        build_job_id: buildJob.id,
        build_number: buildNumber,
        branch: "main",
      });
      setExecutions((prev) => [newExec, ...prev]);
      setSelectedExecution(newExec);

      // Simulate execution completing after a delay
      setTimeout(() => {
        setExecutions((prev) =>
          prev.map((e) =>
            e.id === newExec.id
              ? { ...e, status: Math.random() > 0.2 ? "success" : "failed", duration: "2m 34s" }
              : e
          )
        );
      }, 3000);

      toast.success(`Build ${buildNumber} started`);
    } catch {
      toast.error("Failed to start build");
    } finally {
      setIsRunning(false);
    }
  };

  const filteredExecutions = executions.filter((e) => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (
      e.build_number.toLowerCase().includes(s) ||
      e.branch.toLowerCase().includes(s) ||
      e.status.toLowerCase().includes(s)
    );
  });

  if (!buildJob) return null;

  return (
    <Sheet open={!!buildJob} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        <VisuallyHidden>
          <SheetTitle>Build Detail</SheetTitle>
        </VisuallyHidden>

        {/* Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-[hsl(186,99%,51%)]/5" />
          <div className="relative p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <motion.div
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-[hsl(186,99%,51%)] flex items-center justify-center"
                  initial={{ scale: 0.8, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                >
                  <Zap className="w-6 h-6 text-white" />
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{buildJob.connector_name}</h2>
                  <p className="text-sm text-muted-foreground">{buildJob.pipeline || "No pipeline"}</p>
                </div>
              </div>
            </div>

            {buildJob.description && (
              <p className="text-sm text-muted-foreground">{buildJob.description}</p>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-border flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search executions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 bg-card"
            />
          </div>
          <Button
            size="sm"
            className="gap-2"
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? (
              <RotateCw className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Edit3 className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9">
            <Copy className="w-4 h-4" />
          </Button>
        </div>

        {/* Build Configuration */}
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">Build Configuration</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Workstream</p>
              <p className="text-sm font-medium text-foreground">{buildJob.entity || "—"}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Pipeline</p>
              <p className="text-sm font-medium text-foreground">{buildJob.pipeline || "—"}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Product</p>
              <p className="text-sm font-medium text-foreground">{buildJob.product}</p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Service</p>
              <p className="text-sm font-medium text-foreground">{buildJob.service}</p>
            </div>
          </div>
        </div>

        {/* Build History */}
        <div className="flex-1 overflow-hidden">
          <div className="px-6 py-3">
            <h3 className="text-sm font-semibold text-foreground">
              Build History ({executions.length})
            </h3>
          </div>

          <ScrollArea className="flex-1 px-6 pb-6" style={{ height: "calc(100vh - 480px)" }}>
            {loadingExecs ? (
              <div className="flex items-center justify-center py-8">
                <RotateCw className="w-5 h-5 text-primary animate-spin" />
              </div>
            ) : filteredExecutions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">No executions yet. Click Run to start a build.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredExecutions.map((exec, index) => {
                  const statusCfg = executionStatusConfig[exec.status] || executionStatusConfig.pending;
                  const StatusIcon = statusCfg.icon;
                  const isSelected = selectedExecution?.id === exec.id;

                  return (
                    <motion.div
                      key={exec.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30 hover:bg-muted/30"
                      )}
                      onClick={() => setSelectedExecution(exec)}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", statusCfg.className)}>
                        <StatusIcon className={cn("w-4 h-4", exec.status === "running" && "animate-spin")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground text-sm">{exec.build_number}</p>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            {exec.branch}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {exec.timestamp ? new Date(exec.timestamp).toLocaleString() : "—"}
                          </span>
                          {exec.duration && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {exec.duration}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
