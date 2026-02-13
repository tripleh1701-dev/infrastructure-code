import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  Code,
  Hammer,
  TestTube,
  Rocket,
  UserCheck,
  Tag,
  MoreHorizontal,
  Save,
  X,
  Check,
  // Tool-specific icons
  TicketCheck,
  Trello,
  ListChecks,
  CircleDot,
  Github,
  GitBranch,
  Cloud,
  Blocks,
  Cog,
  Cpu,
  FlaskConical,
  SearchCode,
  CloudCog,
  Workflow,
  Hand,
  MessageSquare,
  Users,
  Headset,
  BarChart3,
  Activity,
  HelpCircle,
} from "lucide-react";

// Tool icons with actual Lucide icons
const TOOL_CATEGORIES: Record<string, {
  icon: LucideIcon;
  gradient: string;
  bgColor: string;
  tools: { name: string; color: string; icon: LucideIcon }[];
}> = {
  Plan: {
    icon: FileText,
    gradient: "from-blue-500 to-blue-600",
    bgColor: "bg-blue-50",
    tools: [
      { name: "Jira", color: "bg-blue-600", icon: TicketCheck },
      { name: "Trello", color: "bg-sky-500", icon: Trello },
      { name: "Asana", color: "bg-orange-500", icon: ListChecks },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Code: {
    icon: Code,
    gradient: "from-violet-500 to-violet-600",
    bgColor: "bg-violet-50",
    tools: [
      { name: "GitHub", color: "bg-slate-800", icon: Github },
      { name: "GitLab", color: "bg-orange-600", icon: GitBranch },
      { name: "Azure Repos", color: "bg-blue-500", icon: Cloud },
      { name: "Bitbucket", color: "bg-blue-700", icon: Blocks },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Build: {
    icon: Hammer,
    gradient: "from-amber-500 to-amber-600",
    bgColor: "bg-amber-50",
    tools: [
      { name: "GitHub", color: "bg-slate-800", icon: Github },
      { name: "AWS CodeBuild", color: "bg-orange-500", icon: CloudCog },
      { name: "Jenkins", color: "bg-red-600", icon: Cog },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Test: {
    icon: TestTube,
    gradient: "from-emerald-500 to-emerald-600",
    bgColor: "bg-emerald-50",
    tools: [
      { name: "Tricentis Tosca", color: "bg-blue-600", icon: Cpu },
      { name: "Selenium", color: "bg-green-600", icon: FlaskConical },
      { name: "SonarQube", color: "bg-cyan-600", icon: SearchCode },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Deploy: {
    icon: Rocket,
    gradient: "from-rose-500 to-rose-600",
    bgColor: "bg-rose-50",
    tools: [
      { name: "Cloud Foundry", color: "bg-blue-500", icon: Cloud },
      { name: "AWS CodePipeline", color: "bg-orange-500", icon: Workflow },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Approval: {
    icon: UserCheck,
    gradient: "from-indigo-500 to-indigo-600",
    bgColor: "bg-indigo-50",
    tools: [
      { name: "Manual", color: "bg-slate-600", icon: Hand },
      { name: "Slack", color: "bg-purple-600", icon: MessageSquare },
      { name: "Microsoft Teams", color: "bg-blue-600", icon: Users },
    ],
  },
  Release: {
    icon: Tag,
    gradient: "from-pink-500 to-pink-600",
    bgColor: "bg-pink-50",
    tools: [
      { name: "ServiceNow", color: "bg-green-600", icon: Headset },
      { name: "Other", color: "bg-slate-500", icon: CircleDot },
    ],
  },
  Others: {
    icon: MoreHorizontal,
    gradient: "from-slate-500 to-slate-600",
    bgColor: "bg-slate-50",
    tools: [
      { name: "Grafana", color: "bg-orange-500", icon: BarChart3 },
      { name: "Prometheus", color: "bg-red-500", icon: Activity },
    ],
  },
};

export type ToolSelection = { category: string; tool_name: string }[];

interface WorkstreamToolsConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTools: ToolSelection;
  onSave: (tools: ToolSelection) => void;
}

export function WorkstreamToolsConfig({
  open,
  onOpenChange,
  selectedTools,
  onSave,
}: WorkstreamToolsConfigProps) {
  const [localSelection, setLocalSelection] = useState<ToolSelection>([]);

  useEffect(() => {
    if (open) {
      setLocalSelection(selectedTools);
    }
  }, [open, selectedTools]);

  const isToolSelected = (category: string, toolName: string) => {
    return localSelection.some(
      (t) => t.category === category && t.tool_name === toolName
    );
  };

  const toggleTool = (category: string, toolName: string) => {
    setLocalSelection((prev) => {
      const exists = prev.some(
        (t) => t.category === category && t.tool_name === toolName
      );
      if (exists) {
        return prev.filter(
          (t) => !(t.category === category && t.tool_name === toolName)
        );
      }
      return [...prev, { category, tool_name: toolName }];
    });
  };

  const handleSave = () => {
    onSave(localSelection);
    onOpenChange(false);
  };

  const getCategoryToolCount = (category: string) => {
    return localSelection.filter((t) => t.category === category).length;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-blue-50/30">
          <DialogTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Hammer className="w-5 h-5 text-blue-600" />
            Configure Workstream Tools
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Select tools for each category in your CI/CD pipeline
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-6 space-y-6">
            {Object.entries(TOOL_CATEGORIES).map(([category, config], catIndex) => {
              const Icon = config.icon;
              const toolCount = getCategoryToolCount(category);
              
              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: catIndex * 0.05 }}
                  className="border border-slate-200/60 rounded-xl overflow-hidden bg-white shadow-sm"
                >
                  <div className={cn("flex items-center justify-between px-4 py-3", config.bgColor)}>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center text-white shadow-sm",
                          config.gradient
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800">{category}</h4>
                        <p className="text-xs text-slate-500">
                          {config.tools.length} tools available
                        </p>
                      </div>
                    </div>
                    {toolCount > 0 && (
                      <Badge className="bg-blue-600 text-white">
                        {toolCount} selected
                      </Badge>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex flex-wrap gap-3">
                      <AnimatePresence>
                        {config.tools.map((tool, toolIndex) => {
                          const isSelected = isToolSelected(category, tool.name);
                          const ToolIcon = tool.icon;
                          return (
                            <motion.button
                              key={tool.name}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              transition={{ delay: toolIndex * 0.03 }}
                              onClick={() => toggleTool(category, tool.name)}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all duration-200",
                                "hover:shadow-md hover:scale-[1.02]",
                                isSelected
                                  ? "border-blue-500 bg-blue-50 shadow-sm"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              )}
                            >
                              <div
                                className={cn(
                                  "w-7 h-7 rounded-lg flex items-center justify-center text-white shadow-sm",
                                  tool.color
                                )}
                              >
                                <ToolIcon className="w-4 h-4" />
                              </div>
                              <span
                                className={cn(
                                  "font-medium text-sm",
                                  isSelected ? "text-blue-700" : "text-slate-700"
                                )}
                              >
                                {tool.name}
                              </span>
                              {isSelected && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center"
                                >
                                  <Check className="w-3 h-3 text-white" />
                                </motion.div>
                              )}
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50/50">
          <div className="text-sm text-slate-500">
            {localSelection.length} tools selected across{" "}
            {new Set(localSelection.map((t) => t.category)).size} categories
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
            >
              <Save className="w-4 h-4" />
              Save Configuration
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { TOOL_CATEGORIES };
