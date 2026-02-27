import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Terminal, Copy, Maximize2, Minimize2, Search, X, Filter, Download, ChevronsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BuildLogStreamProps {
  logs: string | null;
  status: string;
  buildNumber: string;
  pipelineNodes?: string[];
  activeStageIndex?: number;
  currentStage?: string;
  /** When true, the component fills its parent height instead of using a fixed height */
  fillHeight?: boolean;
  /** Filter logs to a specific stage */
  stageFilter?: { id: string; label: string } | null;
  /** Callback to clear the stage filter */
  onClearStageFilter?: () => void;
}

interface LogEntry {
  text: string;
  stage?: string;
  stageIndex?: number;
  level: "info" | "error" | "warn" | "success" | "system";
  timestamp?: string;
}

type LogLevel = "all" | "info" | "warn" | "error" | "success" | "system";

/* ------------------------------------------------------------------ */
/*  Parse real backend log lines                                       */
/*  Formats handled:                                                   */
/*    [NODE:xyz][STAGE:abc] STATUS — message (time)                    */
/*    [EXECUTION:id][NODE:n] ...                                       */
/*    → JIRA: Issue KEY | ...                                          */
/*    → GitHub: Repository ...                                         */
/*    → SAP CPI: Downloading ...                                       */
/*    ✓ / ✅ / ❌ markers                                               */
/* ------------------------------------------------------------------ */
function parseRealLogLine(line: string): LogEntry {
  // Extract timestamp if present (e.g. [2025-01-01T...] or [HH:MM:SS])
  const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}T[^\]]+|\d{2}:\d{2}:\d{2})\]\s*/);
  const timestamp = tsMatch ? tsMatch[1] : undefined;
  const text = tsMatch ? line.slice(tsMatch[0].length) : line;

  // Extract stage name from backend format
  const stageMatch = text.match(/\[STAGE:([^\]]+)\]/);
  const stage = stageMatch ? stageMatch[1] : undefined;

  // Determine log level
  let level: LogEntry["level"] = "info";

  if (/FAILED|ERROR|\[ERROR\]|❌|error|Fatal|fatal/i.test(text)) {
    level = "error";
  } else if (/WARN|\[WARN\]|⚠️|Warning/i.test(text)) {
    level = "warn";
  } else if (/SUCCESS|✓|✅|passed|complete|deployed|healthy|verified|approved|downloaded/i.test(text)) {
    level = "success";
  } else if (
    /^▸|^▶|^═{3,}|STARTED|Starting|Pipeline execution|Node completed/i.test(text) ||
    /\[EXECUTION:/.test(text) ||
    /\[NODE:[^\]]+\]\s*(Starting|Node completed)/i.test(text)
  ) {
    level = "system";
  } else if (/^  →|^    →/.test(text)) {
    // Tool output lines (JIRA, GitHub, SAP CPI) — keep as info but could be success
    if (/✓|✅|success|valid|acquired|verified|connected/i.test(text)) {
      level = "success";
    }
  }

  return { text: line, level, timestamp, stage };
}

/* ------------------------------------------------------------------ */
/*  Waiting / idle placeholder (no simulation)                         */
/* ------------------------------------------------------------------ */
function getWaitingEntries(status: string): LogEntry[] {
  const s = status.toLowerCase();
  if (s === "running") {
    return [{ text: "Waiting for execution logs...", level: "system" }];
  }
  if (s === "success") {
    return [{ text: "═══ Pipeline completed successfully ═══", level: "success" }];
  }
  if (s === "failed") {
    return [{ text: "═══ Pipeline failed ═══", level: "error" }];
  }
  if (s === "waiting_approval") {
    return [{ text: "⏸  Pipeline paused — awaiting manual approval", level: "warn" }];
  }
  return [{ text: "Waiting for build to start...", level: "info" }];
}

const LEVEL_CONFIG: Record<LogLevel, { label: string; color: string; activeColor: string }> = {
  all: { label: "All", color: "text-slate-400", activeColor: "bg-slate-700 text-white" },
  info: { label: "Info", color: "text-blue-400", activeColor: "bg-blue-500/20 text-blue-300 border-blue-500/40" },
  warn: { label: "Warn", color: "text-amber-400", activeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  error: { label: "Error", color: "text-red-400", activeColor: "bg-red-500/20 text-red-300 border-red-500/40" },
  success: { label: "Pass", color: "text-emerald-400", activeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  system: { label: "Sys", color: "text-cyan-400", activeColor: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
};

const LEVEL_LINE_STYLES: Record<string, string> = {
  error: "text-red-400 bg-red-500/5 border-l-2 border-red-500/60 pl-2",
  warn: "text-amber-400 bg-amber-500/5 border-l-2 border-amber-500/40 pl-2",
  success: "text-emerald-400",
  system: "text-cyan-300 font-semibold",
  info: "text-slate-300",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export function BuildLogStream({ logs, status, buildNumber, pipelineNodes, activeStageIndex, currentStage, fillHeight, stageFilter, onClearStageFilter }: BuildLogStreamProps) {
  const [streamedEntries, setStreamedEntries] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [activeFilter, setActiveFilter] = useState<LogLevel>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevLogCountRef = useRef<number>(0);

  const hasRealLogs = Boolean(logs && logs.trim().length > 0);

  /* ---------- Parse real log lines ---------- */
  const realLogEntries = useMemo<LogEntry[]>(() => {
    if (!hasRealLogs || !logs) return [];
    return logs.split("\n").filter((line) => line.length > 0).map(parseRealLogLine);
  }, [logs, hasRealLogs]);

  /* ---------- Stream new real log lines with animation ---------- */
  useEffect(() => {
    if (!hasRealLogs) {
      // No real logs — show status placeholder
      setStreamedEntries(getWaitingEntries(status));
      prevLogCountRef.current = 0;
      return;
    }

    const newCount = realLogEntries.length;

    // If count hasn't changed, just update in place (status may have changed)
    if (newCount <= prevLogCountRef.current) {
      setStreamedEntries(realLogEntries);
      return;
    }

    // Stream new lines with a short delay for visual effect
    const newLines = realLogEntries.slice(prevLogCountRef.current);
    const existingEntries = realLogEntries.slice(0, prevLogCountRef.current);
    setStreamedEntries([...existingEntries]);

    let lineIdx = 0;
    const streamInterval = setInterval(() => {
      if (lineIdx < newLines.length) {
        setStreamedEntries((prev) => [...prev, newLines[lineIdx]]);
        lineIdx++;
      } else {
        clearInterval(streamInterval);
      }
    }, 60);

    prevLogCountRef.current = newCount;
    return () => clearInterval(streamInterval);
  }, [realLogEntries, hasRealLogs, status]);

  /* ---------- Append status markers when execution completes ---------- */
  useEffect(() => {
    if (!hasRealLogs) return;
    const s = status.toLowerCase();
    if (s === "success") {
      setStreamedEntries((prev) => {
        if (prev.some((e) => e.text.includes("Pipeline completed"))) return prev;
        return [...prev, { text: "", level: "info" }, { text: "═══ Pipeline completed successfully ═══", level: "success" }];
      });
    } else if (s === "failed") {
      setStreamedEntries((prev) => {
        if (prev.some((e) => e.text.includes("Pipeline failed"))) return prev;
        return [...prev, { text: "", level: "info" }, { text: "═══ Pipeline failed ═══", level: "error" }];
      });
    } else if (s === "waiting_approval") {
      setStreamedEntries((prev) => {
        if (prev.some((e) => e.text.includes("awaiting manual approval"))) return prev;
        return [...prev, { text: "", level: "info" }, { text: "⏸  Pipeline paused — awaiting manual approval", level: "warn" }];
      });
    }
  }, [status, hasRealLogs]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [streamedEntries, autoScroll]);

  // Detect manual scroll-up to auto-disable, scroll-to-bottom to re-enable
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
      setAutoScroll(atBottom);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Focus search input when toggled
  useEffect(() => {
    if (showSearch && searchInputRef.current) searchInputRef.current.focus();
  }, [showSearch]);

  /* ---------- Filtered + searched entries ---------- */
  const filteredEntries = useMemo(() => {
    let entries = streamedEntries.filter(Boolean);
    // Stage-level filter
    if (stageFilter) {
      entries = entries.filter((e) => {
        const text = e.text;
        return text.includes(stageFilter.id) ||
          text.includes(`Node: ${stageFilter.label}`) ||
          text.includes(`Stage: ${stageFilter.label}`) ||
          text.includes(`[STAGE:${stageFilter.label}]`) ||
          (e.stage && e.stage === stageFilter.label);
      });
    }
    if (activeFilter !== "all") {
      entries = entries.filter((e) => e.level === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter((e) => e.text.toLowerCase().includes(q));
    }
    return entries;
  }, [streamedEntries, activeFilter, searchQuery, stageFilter]);

  /* ---------- Level counts ---------- */
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, info: 0, warn: 0, error: 0, success: 0, system: 0 };
    for (const e of streamedEntries) {
      if (!e) continue;
      counts[e.level] = (counts[e.level] || 0) + 1;
      counts.all++;
    }
    return counts;
  }, [streamedEntries]);

  const logsText = useMemo(() => filteredEntries.map((e) => e.text).join("\n"), [filteredEntries]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(logsText);
    toast.success("Logs copied to clipboard");
  }, [logsText]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([logsText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${buildNumber}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Logs downloaded");
  }, [logsText, buildNumber]);

  const toggleSearch = useCallback(() => {
    setShowSearch((prev) => {
      if (prev) setSearchQuery("");
      return !prev;
    });
  }, []);

  const isRunning = status === "running" || status === "RUNNING";

  const highlightMatch = useCallback((text: string) => {
    if (!searchQuery.trim()) return text;
    const q = searchQuery.trim();
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-500/40 text-yellow-100 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }, [searchQuery]);

  return (
    <div className={cn(
      "flex flex-col rounded-lg overflow-hidden border border-slate-800",
      fillHeight ? "h-full" : isExpanded ? "h-[480px]" : "h-64"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-mono text-slate-300">{buildNumber} — logs</span>
          {hasRealLogs ? (
            <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono flex items-center gap-1 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          ) : isRunning ? (
            <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded font-mono border border-amber-400/30">POLLING</span>
          ) : null}
          {isRunning && (
            <motion.div
              className="w-2 h-2 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
          {currentStage && !stageFilter && (
            <span className="text-[10px] text-cyan-400 ml-1">● {currentStage}</span>
          )}
          {stageFilter && (
            <button
              onClick={onClearStageFilter}
              className="flex items-center gap-1 text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full border border-primary/30 hover:bg-primary/25 transition-colors ml-1"
            >
              <Filter className="w-2.5 h-2.5" />
              {stageFilter.label}
              <X className="w-2.5 h-2.5 ml-0.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-500 mr-1 tabular-nums">
            {filteredEntries.length}/{streamedEntries.length}
          </span>
          <Button variant="ghost" size="icon" className={cn("h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700", showFilters && "bg-slate-700 text-white")} onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className={cn("h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700", showSearch && "bg-slate-700 text-white")} onClick={toggleSearch}>
            <Search className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700" onClick={handleCopy} title="Copy logs">
            <Copy className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700" onClick={handleDownload} title="Download logs">
            <Download className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700", autoScroll && "bg-slate-700 text-emerald-400")}
            onClick={() => {
              setAutoScroll(!autoScroll);
              if (!autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
            }}
            title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          >
            <ChevronsDown className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 border-b border-slate-800">
          <Search className="w-3 h-3 text-slate-500 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="flex-1 bg-transparent text-xs font-mono text-slate-300 placeholder:text-slate-600 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-slate-500 hover:text-slate-300">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Filter pills */}
      {showFilters && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-900/60 border-b border-slate-800 flex-wrap">
          {(Object.keys(LEVEL_CONFIG) as LogLevel[]).map((level) => {
            const cfg = LEVEL_CONFIG[level];
            const isActive = activeFilter === level;
            const count = levelCounts[level] || 0;
            return (
              <button
                key={level}
                onClick={() => setActiveFilter(level)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono transition-all border",
                  isActive
                    ? cfg.activeColor
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                )}
              >
                {cfg.label}
                <span className="ml-1 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Log content */}
      <div ref={logRef} className="flex-1 bg-slate-950 overflow-y-auto font-mono text-[13px] leading-6 p-3 space-y-px">
        {filteredEntries.length === 0 && (searchQuery || activeFilter !== "all") ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs">
            No logs match current filters
          </div>
        ) : (
          filteredEntries.map((entry, i) => {
            if (!entry) return null;
            return (
              <motion.div
                key={`${entry.stage ?? "r"}-${i}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.08 }}
                className={cn(
                  "py-0.5 rounded-sm",
                  LEVEL_LINE_STYLES[entry.level] || "text-slate-300"
                )}
              >
                <span className="text-slate-600 select-none mr-3 inline-block w-7 text-right text-[11px]">{i + 1}</span>
                {highlightMatch(entry.text)}
              </motion.div>
            );
          })
        )}
        {isRunning && (
          <motion.span
            className="text-emerald-400 inline-block ml-10"
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
