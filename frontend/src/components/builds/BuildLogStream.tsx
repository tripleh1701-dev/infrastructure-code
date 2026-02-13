import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Terminal, Copy, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BuildLogStreamProps {
  logs: string | null;
  status: string;
  buildNumber: string;
  pipelineNodes?: string[];
  /** When provided by parent, controls which stage's logs are visible */
  activeStageIndex?: number;
  /** Current stage name from backend execution (shown in header) */
  currentStage?: string;
}

interface LogEntry {
  text: string;
  stage?: string;
  stageIndex?: number;
  level: "info" | "error" | "warn" | "success" | "system";
  timestamp?: string;
}

function getTimestamp(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

function generateNodeLogs(nodeName: string, stageIndex: number): LogEntry[] {
  const ts = getTimestamp;
  const name = nodeName.toLowerCase();
  const base: LogEntry[] = [
    { text: `▸ Stage: ${nodeName}`, level: "system", stage: nodeName, stageIndex, timestamp: ts() },
    { text: `  Initializing ${name} step...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
  ];

  if (name.includes("source") || name.includes("git") || name.includes("repo")) {
    base.push(
      { text: `  Cloning repository from origin/main...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Fetched 142 objects, 3.2 MB`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  HEAD is now at a4c7e2f`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  ✓ Source checkout complete`, level: "success", stage: nodeName, stageIndex, timestamp: ts() },
    );
  } else if (name.includes("build") || name.includes("compile")) {
    base.push(
      { text: `  Resolving dependencies...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Compiling modules (1/4)...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Compiling modules (2/4)...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Compiling modules (3/4)...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Compiling modules (4/4)...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  ✓ Build successful — 0 errors, 2 warnings`, level: "success", stage: nodeName, stageIndex, timestamp: ts() },
    );
  } else if (name.includes("test")) {
    base.push(
      { text: `  Running test suite...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Suite: unit-tests — 38 passed`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Suite: integration-tests — 12 passed`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  ✓ All 50 tests passed`, level: "success", stage: nodeName, stageIndex, timestamp: ts() },
    );
  } else if (name.includes("deploy") || name.includes("release")) {
    base.push(
      { text: `  Preparing deployment manifest...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Deploying to staging cluster...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Rolling update: 3/3 replicas ready`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Health check: HTTP 200 OK`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  ✓ Deployment successful`, level: "success", stage: nodeName, stageIndex, timestamp: ts() },
    );
  } else if (name.includes("package") || name.includes("docker") || name.includes("container")) {
    base.push(
      { text: `  Building container image...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Layer 1/5: base image cached`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Layer 5/5: application layer`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  Pushing image to registry...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  ✓ Image pushed: v1.2.${Math.floor(Math.random() * 100)}`, level: "success", stage: nodeName, stageIndex, timestamp: ts() },
    );
  } else {
    base.push(
      { text: `  Processing ${name}...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
      { text: `  ✓ ${nodeName} completed`, level: "success", stage: nodeName, stageIndex, timestamp: ts() },
    );
  }

  return base;
}

function generateFailedLogs(nodeName: string, stageIndex: number): LogEntry[] {
  const ts = getTimestamp;
  return [
    { text: `▸ Stage: ${nodeName}`, level: "system", stage: nodeName, stageIndex, timestamp: ts() },
    { text: `  Initializing ${nodeName.toLowerCase()} step...`, level: "info", stage: nodeName, stageIndex, timestamp: ts() },
    { text: `  [ERROR] Process exited with code 1`, level: "error", stage: nodeName, stageIndex, timestamp: ts() },
    { text: `  [ERROR] ${nodeName} stage failed — aborting pipeline`, level: "error", stage: nodeName, stageIndex, timestamp: ts() },
  ];
}

const defaultNodeNames = ["Source", "Build", "Test", "Package", "Deploy"];

export function BuildLogStream({ logs, status, buildNumber, pipelineNodes, activeStageIndex, currentStage }: BuildLogStreamProps) {
  const [streamedEntries, setStreamedEntries] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const prevStageRef = useRef<number>(-1);

  const nodeNames = pipelineNodes && pipelineNodes.length > 0 ? pipelineNodes : defaultNodeNames;

  // Pre-generate all log entries grouped by stage
  const allLogsByStage = useMemo(() => {
    if (logs) {
      return [logs.split("\n").map((line) => ({
        text: line,
        stageIndex: 0,
        level: (line.includes("[ERROR]") ? "error" : line.includes("[WARN]") ? "warn" : line.includes("✓") || line.includes("passed") ? "success" : "info") as LogEntry["level"],
      }))];
    }

    return nodeNames.map((name, idx) => {
      if (status === "failed" && idx === nodeNames.length - 1) {
        return generateFailedLogs(name, idx);
      }
      return generateNodeLogs(name, idx);
    });
  }, [logs, status, nodeNames]);

  // When activeStageIndex changes, stream that stage's logs
  useEffect(() => {
    if (activeStageIndex === undefined || activeStageIndex < 0) {
      // No parent-driven progression — show all logs at once for completed builds
      if (status === "success" || status === "failed") {
        const allEntries = allLogsByStage.flat();
        if (status === "success") {
          allEntries.push({ text: "", level: "info" });
          allEntries.push({ text: "═══ Pipeline completed successfully ═══", level: "success" });
        }
        setStreamedEntries(allEntries);
      } else if (status !== "running") {
        setStreamedEntries([{ text: "Waiting for build to start...", level: "info" }]);
      }
      prevStageRef.current = -1;
      return;
    }

    // Parent is driving stage progression
    const stageIdx = Math.min(activeStageIndex, allLogsByStage.length);

    if (stageIdx <= prevStageRef.current && stageIdx < allLogsByStage.length) return;

    // Stream logs for the new stage(s)
    if (stageIdx >= allLogsByStage.length) {
      // All stages done — add completion message
      const allEntries = allLogsByStage.flat();
      if (status === "success") {
        allEntries.push({ text: "", level: "info" });
        allEntries.push({ text: "═══ Pipeline completed successfully ═══", level: "success" });
      } else if (status === "failed") {
        allEntries.push({ text: "", level: "info" });
        allEntries.push({ text: "═══ Pipeline failed ═══", level: "error" });
      }
      setStreamedEntries(allEntries);
      prevStageRef.current = stageIdx;
      return;
    }

    // Collect all logs up to and including the current stage
    const entriesToShow: LogEntry[] = [];
    for (let i = 0; i <= stageIdx; i++) {
      if (allLogsByStage[i]) {
        entriesToShow.push(...allLogsByStage[i]);
      }
    }

    // Stream the new stage's logs line by line
    const prevEntries: LogEntry[] = [];
    for (let i = 0; i <= prevStageRef.current && i < allLogsByStage.length; i++) {
      if (allLogsByStage[i]) prevEntries.push(...allLogsByStage[i]);
    }

    const newLogs = allLogsByStage[stageIdx] || [];
    let lineIdx = 0;

    // Show previous stages immediately, then stream current stage
    setStreamedEntries([...prevEntries]);

    const streamInterval = setInterval(() => {
      if (lineIdx < newLogs.length) {
        const entry = newLogs[lineIdx];
        if (entry) {
          setStreamedEntries((prev) => [...prev, entry]);
        }
        lineIdx++;
      } else {
        clearInterval(streamInterval);
      }
    }, 150);

    prevStageRef.current = stageIdx;

    return () => clearInterval(streamInterval);
  }, [activeStageIndex, status, allLogsByStage]);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [streamedEntries]);

  const handleCopy = () => {
    navigator.clipboard.writeText(streamedEntries.map((e) => e.text).join("\n"));
    toast.success("Logs copied to clipboard");
  };

  const levelColors: Record<string, string> = {
    error: "text-red-400",
    warn: "text-amber-400",
    success: "text-emerald-400",
    system: "text-cyan-400 font-semibold",
    info: "text-slate-300",
  };

  return (
    <div className={cn("flex flex-col rounded-lg overflow-hidden", isExpanded ? "h-96" : "h-56")}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-mono text-slate-300">{buildNumber} — logs</span>
          {(status === "running" || (activeStageIndex !== undefined && activeStageIndex >= 0 && activeStageIndex < nodeNames.length)) && (
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
          <span className="text-[10px] text-slate-500 ml-2">
            {streamedEntries.length} lines
          </span>
          {currentStage ? (
            <span className="text-[10px] text-cyan-400 ml-1">
              ● {currentStage}
            </span>
          ) : activeStageIndex !== undefined && activeStageIndex >= 0 && activeStageIndex < nodeNames.length ? (
            <span className="text-[10px] text-cyan-400 ml-1">
              ● {nodeNames[activeStageIndex]}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={handleCopy}
          >
            <Copy className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={logRef}
        className="flex-1 bg-slate-950 overflow-y-auto font-mono text-xs p-3 space-y-0.5"
      >
        {streamedEntries.map((entry, i) => {
          if (!entry) return null;
          return (
            <motion.div
              key={`${entry.stageIndex ?? 0}-${i}`}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.1 }}
              className={cn("leading-5", levelColors[entry.level] || "text-slate-300")}
            >
              {entry.timestamp && (
                <span className="text-slate-600 mr-2">[{entry.timestamp}]</span>
              )}
              {entry.text}
            </motion.div>
          );
        })}
        {(status === "running" || (activeStageIndex !== undefined && activeStageIndex >= 0 && activeStageIndex < nodeNames.length)) && (
          <motion.span
            className="text-emerald-400 inline-block"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            █
          </motion.span>
        )}
      </div>
    </div>
  );
}
