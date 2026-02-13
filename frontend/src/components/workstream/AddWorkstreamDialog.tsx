import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Layers,
  Settings,
  Copy,
  Building2,
  Globe,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { WorkstreamToolsConfig, ToolSelection, TOOL_CATEGORIES } from "./WorkstreamToolsConfig";

interface AddWorkstreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddWorkstreamDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddWorkstreamDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  
  // Fetch workstreams filtered by current account and enterprise for copy option
  const { workstreams } = useWorkstreams(selectedAccount?.id, selectedEnterprise?.id);
  const { createWorkstream } = useWorkstreams();

  const [name, setName] = useState("");
  const [selectedTools, setSelectedTools] = useState<ToolSelection>([]);
  const [showToolsConfig, setShowToolsConfig] = useState(false);
  const [copyFromId, setCopyFromId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Filter workstreams that have at least one tool configured for copying
  const copyableWorkstreams = workstreams.filter((ws) => ws.tools && ws.tools.length > 0);
  
  // Show copy option if there are ANY workstreams (even without tools - user might want to see them)
  const hasWorkstreamsToShow = workstreams.length > 0;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setSelectedTools([]);
      setCopyFromId("");
    }
  }, [open]);

  // Copy configuration from existing workstream
  useEffect(() => {
    if (copyFromId) {
      const sourceWorkstream = copyableWorkstreams.find((w) => w.id === copyFromId);
      if (sourceWorkstream?.tools) {
        setSelectedTools(
          sourceWorkstream.tools.map((t) => ({
            category: t.category,
            tool_name: t.tool_name,
          }))
        );
      }
    }
  }, [copyFromId, copyableWorkstreams]);

  const handleSubmit = async () => {
    if (!name.trim() || !selectedAccount?.id || !selectedEnterprise?.id) return;

    setIsSubmitting(true);
    try {
      await createWorkstream.mutateAsync({
        name: name.trim(),
        account_id: selectedAccount.id,
        enterprise_id: selectedEnterprise.id,
        tools: selectedTools,
      });
      onSuccess();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getToolCountByCategory = () => {
    const counts: Record<string, number> = {};
    selectedTools.forEach((t) => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return counts;
  };

  const toolCounts = getToolCountByCategory();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-violet-50/30">
            <DialogTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <motion.div
                initial={{ rotate: 0 }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <Layers className="w-5 h-5 text-blue-600" />
              </motion.div>
              Create New Workstream
            </DialogTitle>
            <p className="text-sm text-slate-500 mt-1">
              Define a new CI/CD workstream with tool configurations
            </p>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            <div className="p-6 grid gap-fluid-md">
              {/* Workstream Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                  Workstream Name *
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter workstream name"
                  className="border-slate-200 focus:border-blue-400"
                />
              </div>

              {/* Account (Read-only from breadcrumb) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  Account
                </Label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">
                    {selectedAccount?.name || "No account selected"}
                  </span>
                </div>
              </div>

              {/* Enterprise (Read-only from breadcrumb) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-500" />
                  Enterprise
                </Label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50">
                  <Globe className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">
                    {selectedEnterprise?.name || "No enterprise selected"}
                  </span>
                </div>
              </div>

              {/* Copy Configuration - show if there are any workstreams for this account/enterprise */}
              {hasWorkstreamsToShow && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <Copy className="w-4 h-4 text-slate-500" />
                    Copy Configuration From (Optional)
                  </Label>
                  <Select value={copyFromId} onValueChange={(val) => setCopyFromId(val === "none" ? "" : val)}>
                    <SelectTrigger className="border-slate-200">
                      <SelectValue placeholder="Select existing workstream to copy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {workstreams.map((ws) => {
                        const toolCount = ws.tools?.length || 0;
                        return (
                          <SelectItem 
                            key={ws.id} 
                            value={ws.id}
                            disabled={toolCount === 0}
                          >
                            {ws.name} {toolCount > 0 ? `(${toolCount} tools)` : "(no tools configured)"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {copyableWorkstreams.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No workstreams with tools configured. Configure tools on an existing workstream first to enable copying.
                    </p>
                  )}
                </div>
              )}

              {/* Tool Configuration Button */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-500" />
                  Tool Configuration
                </Label>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setShowToolsConfig(true)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border-2 border-dashed transition-all duration-200",
                    selectedTools.length > 0
                      ? "border-blue-300 bg-blue-50/50"
                      : "border-slate-200 bg-slate-50/50 hover:border-blue-300"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-sm">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-slate-800">
                        {selectedTools.length > 0
                          ? `${selectedTools.length} Tools Configured`
                          : "Configure Tools"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {selectedTools.length > 0
                          ? `Across ${Object.keys(toolCounts).length} categories`
                          : "Click to select tools for each category"}
                      </p>
                    </div>
                  </div>
                  <Settings className="w-5 h-5 text-slate-400" />
                </motion.button>

                {/* Tool Summary Badges */}
                {selectedTools.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(toolCounts).map(([category, count]) => {
                      const config = TOOL_CATEGORIES[category as keyof typeof TOOL_CATEGORIES];
                      return (
                        <Badge
                          key={category}
                          variant="secondary"
                          className={cn("gap-1.5", config?.bgColor)}
                        >
                          {category}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50/50">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || !selectedAccount?.id || !selectedEnterprise?.id || isSubmitting}
              className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create Workstream
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WorkstreamToolsConfig
        open={showToolsConfig}
        onOpenChange={setShowToolsConfig}
        selectedTools={selectedTools}
        onSave={setSelectedTools}
      />
    </>
  );
}
