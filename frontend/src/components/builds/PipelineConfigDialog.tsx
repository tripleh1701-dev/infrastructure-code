import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useBuildYamlViewer } from "@/hooks/usePipelineConfigs";
import { BuildJob } from "@/hooks/useBuilds";
import {
  FileCode,
  RotateCw,
  FileX,
  Copy,
  Check,
  Download,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PipelineConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildJob?: BuildJob | null;
}

/** Simple YAML syntax highlighter */
function highlightYamlLine(line: string, searchTerm: string): React.ReactNode {
  if (/^\s*#/.test(line)) {
    return <span className="text-muted-foreground/60 italic">{line}</span>;
  }

  const parts: React.ReactNode[] = [];
  const keyMatch = line.match(/^(\s*)([\w_.-]+)(\s*:\s*)(.*)/);
  if (keyMatch) {
    const [, indent, key, colon, value] = keyMatch;
    parts.push(
      <span key="indent">{indent}</span>,
      <span key="key" className="text-primary font-semibold">{key}</span>,
      <span key="colon" className="text-muted-foreground">{colon}</span>,
    );
    if (/^(true|false)$/i.test(value.trim())) {
      parts.push(<span key="val" className="text-amber-500">{value}</span>);
    } else if (/^\d+(\.\d+)?$/.test(value.trim())) {
      parts.push(<span key="val" className="text-emerald-500">{value}</span>);
    } else if (/^["'].*["']$/.test(value.trim())) {
      parts.push(<span key="val" className="text-orange-400">{value}</span>);
    } else {
      parts.push(<span key="val" className="text-foreground/80">{value}</span>);
    }
  } else if (/^\s*-\s/.test(line)) {
    const listMatch = line.match(/^(\s*-\s)(.*)/);
    if (listMatch) {
      parts.push(
        <span key="dash" className="text-accent-foreground">{listMatch[1]}</span>,
        <span key="val" className="text-foreground/80">{listMatch[2]}</span>,
      );
    } else {
      parts.push(<span key="line">{line}</span>);
    }
  } else {
    parts.push(<span key="line">{line}</span>);
  }

  if (searchTerm && line.toLowerCase().includes(searchTerm.toLowerCase())) {
    return <mark className="bg-yellow-300/30 rounded px-0">{parts}</mark>;
  }

  return <>{parts}</>;
}

// ─── Section parsing ──────────────────────────────────────────────────────

interface YamlSection {
  key: string;
  headerLineIdx: number; // index in original lines array
  startIdx: number;      // first child line index (inclusive)
  endIdx: number;        // last child line index (exclusive)
  childCount: number;
}

/** Detect top-level keys (indent === 0, pattern: `key:`) and group their children */
function parseYamlSections(lines: string[]): YamlSection[] {
  const sections: YamlSection[] = [];
  const topLevelIndices: number[] = [];

  lines.forEach((line, i) => {
    // Top-level key: no leading whitespace, has a colon
    if (/^[a-zA-Z_][\w_.-]*\s*:/.test(line)) {
      topLevelIndices.push(i);
    }
  });

  topLevelIndices.forEach((idx, si) => {
    const nextIdx = si + 1 < topLevelIndices.length ? topLevelIndices[si + 1] : lines.length;
    const keyMatch = lines[idx].match(/^([\w_.-]+)/);
    const key = keyMatch ? keyMatch[1] : `section-${si}`;
    // Count non-empty child lines
    let childCount = 0;
    for (let j = idx + 1; j < nextIdx; j++) {
      if (lines[j].trim().length > 0) childCount++;
    }
    sections.push({
      key,
      headerLineIdx: idx,
      startIdx: idx + 1,
      endIdx: nextIdx,
      childCount,
    });
  });

  return sections;
}

export function PipelineConfigDialog({
  open,
  onOpenChange,
  buildJob,
}: PipelineConfigDialogProps) {
  const { data: yamlData, isLoading, refetch } = useBuildYamlViewer(
    buildJob?.id,
    buildJob?.pipeline || undefined,
  );
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const lines = useMemo(
    () => (yamlData?.yamlContent || "").split("\n"),
    [yamlData?.yamlContent],
  );

  const sections = useMemo(() => parseYamlSections(lines), [lines]);

  // Build a set of line indices that are currently hidden
  const hiddenLines = useMemo(() => {
    const hidden = new Set<number>();
    sections.forEach((sec) => {
      if (collapsedSections.has(sec.key)) {
        for (let i = sec.startIdx; i < sec.endIdx; i++) {
          hidden.add(i);
        }
      }
    });
    return hidden;
  }, [sections, collapsedSections]);

  // Map from header line index → section (for rendering fold controls)
  const sectionByHeader = useMemo(() => {
    const map = new Map<number, YamlSection>();
    sections.forEach((s) => map.set(s.headerLineIdx, s));
    return map;
  }, [sections]);

  const matchCount = useMemo(() => {
    if (!searchTerm) return 0;
    return lines.filter((l) =>
      l.toLowerCase().includes(searchTerm.toLowerCase()),
    ).length;
  }, [lines, searchTerm]);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedSections(new Set(sections.filter((s) => s.childCount > 0).map((s) => s.key)));
  }, [sections]);

  const expandAll = useCallback(() => {
    setCollapsedSections(new Set());
  }, []);

  const handleCopy = async () => {
    if (!yamlData?.yamlContent) return;
    await navigator.clipboard.writeText(yamlData.yamlContent);
    setCopied(true);
    toast.success("YAML copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!yamlData?.yamlContent) return;
    const blob = new Blob([yamlData.yamlContent], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${buildJob?.connector_name || "build"}-${yamlData.buildVersion || "v1"}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("YAML file downloaded");
  };

  // When search is active, auto-expand all sections so matches are visible
  const effectiveHiddenLines = searchTerm ? new Set<number>() : hiddenLines;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              <FileCode className="w-5 h-5 text-primary-foreground" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold">
                Build YAML
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate">
                {buildJob?.connector_name} — {buildJob?.pipeline || "No pipeline"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <RotateCw className="w-5 h-5 text-primary animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading Build YAML…
              </span>
            </div>
          ) : yamlData?.yamlContent ? (
            <div className="flex flex-col h-full">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/30">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] h-5 font-mono">
                    v{yamlData.buildVersion}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] h-5 capitalize",
                      yamlData.status === "active" && "border-emerald-500/50 text-emerald-600",
                      yamlData.status === "draft" && "border-amber-500/50 text-amber-600",
                    )}
                  >
                    {yamlData.status}
                  </Badge>
                  <span className="text-muted-foreground/60">•</span>
                  <span>{lines.length} lines</span>
                  <span className="text-muted-foreground/60">•</span>
                  <span>
                    Updated{" "}
                    {new Date(yamlData.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {showSearch && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 180, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="relative"
                    >
                      <Input
                        placeholder="Search…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-7 text-xs pr-12"
                        autoFocus
                      />
                      {searchTerm && (
                        <span className="absolute right-7 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          {matchCount}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-7 w-7"
                        onClick={() => {
                          setShowSearch(false);
                          setSearchTerm("");
                        }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </motion.div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowSearch((s) => !s)}
                    title="Search"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={collapsedSections.size > 0 ? expandAll : collapseAll}
                    title={collapsedSections.size > 0 ? "Expand all" : "Collapse all"}
                  >
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCopy}
                    title="Copy"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleDownload}
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => refetch()}
                    title="Refresh"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Code area with line numbers and folding */}
              <ScrollArea className="flex-1 h-[55vh]">
                <div className="flex text-[12px] font-mono leading-[1.7]">
                  {/* Fold gutter + line numbers */}
                  <div className="sticky left-0 z-10 flex-shrink-0 flex bg-muted/40 border-r border-border/30">
                    {/* Fold indicators */}
                    <div className="w-5 flex flex-col items-center py-3">
                      {lines.map((_, i) => {
                        if (effectiveHiddenLines.has(i)) return null;
                        const sec = sectionByHeader.get(i);
                        if (sec && sec.childCount > 0) {
                          const isCollapsed = collapsedSections.has(sec.key);
                          return (
                            <div
                              key={i}
                              className="h-[1.7em] flex items-center justify-center cursor-pointer hover:text-primary text-muted-foreground/50 transition-colors"
                              onClick={() => toggleSection(sec.key)}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </div>
                          );
                        }
                        return <div key={i} className="h-[1.7em]" />;
                      })}
                    </div>
                    {/* Line numbers */}
                    <div className="select-none text-right pr-3 py-3 text-muted-foreground/40">
                      {lines.map((_, i) => {
                        if (effectiveHiddenLines.has(i)) return null;
                        return (
                          <div key={i} className="h-[1.7em]">
                            {i + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Code content */}
                  <pre className="flex-1 py-3 pl-4 pr-4 whitespace-pre overflow-x-auto">
                    {lines.map((line, i) => {
                      if (effectiveHiddenLines.has(i)) return null;

                      const sec = sectionByHeader.get(i);
                      const isCollapsedHeader = sec && collapsedSections.has(sec.key) && !searchTerm;

                      return (
                        <div
                          key={i}
                          className={cn(
                            "h-[1.7em]",
                            searchTerm &&
                              line.toLowerCase().includes(searchTerm.toLowerCase()) &&
                              "bg-yellow-400/10",
                          )}
                        >
                          {highlightYamlLine(line, searchTerm)}
                          {isCollapsedHeader && (
                            <span
                              className="ml-2 inline-flex items-center px-1.5 py-0 rounded text-[10px] bg-muted border border-border/50 text-muted-foreground cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                              onClick={() => toggleSection(sec!.key)}
                            >
                              {sec!.childCount} lines…
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </pre>
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FileX className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No Build YAML generated yet</p>
              <p className="text-xs mt-1">
                Build YAML is auto-generated when a pipeline is assigned and
                configurations are saved.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
