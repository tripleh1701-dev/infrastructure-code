import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClipboardList,
  GitBranch,
  Hammer,
  TestTube,
  Rocket,
  CheckSquare,
  Server,
  StickyNote,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowNodeType } from "@/types/pipeline";
import { NODE_LABELS, NODE_CATEGORIES, CATEGORY_COLORS } from "@/constants/pipeline";
import { PIPELINE_NODE_ICONS } from "./icons/BrandIcons";
import { useCustomEnvironments, CustomEnvironment } from "@/hooks/useCustomEnvironments";
import { toast } from "sonner";

interface CanvasCompactSidebarProps {
  isExpanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  onAddNode?: (nodeType: WorkflowNodeType, customLabel?: string) => void;
}

const categoryIcons: Record<string, React.ElementType> = {
  environment: Server,
  plan: ClipboardList,
  code: GitBranch,
  build: Hammer,
  test: TestTube,
  release: Rocket,
  deploy: Rocket,
  approval: CheckSquare,
  annotation: StickyNote,
};

const categoryLabels: Record<string, string> = {
  environment: "Nodes",
  plan: "Plan",
  code: "Code",
  build: "Build",
  test: "Test",
  release: "Release",
  deploy: "Deploy",
  approval: "Approval",
  annotation: "Notes",
};

const ENV_COLORS = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#ec4899", label: "Pink" },
  { value: "#06b6d4", label: "Cyan" },
];

export function CanvasCompactSidebar({
  isExpanded,
  onExpandChange,
  onAddNode,
}: CanvasCompactSidebarProps) {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [showCreateEnvDialog, setShowCreateEnvDialog] = useState(false);
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvColor, setNewEnvColor] = useState("#6366f1");
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { customEnvironments, addEnvironment, removeEnvironment } = useCustomEnvironments();

  const handleCategoryHover = (category: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredCategory(category);
  };

  const handleCategoryLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCategory(null);
    }, 150);
  };

  const handleNodeDragStart = (event: React.DragEvent, nodeType: WorkflowNodeType, customLabel?: string) => {
    const data = customLabel ? `${nodeType}::${customLabel}` : nodeType;
    event.dataTransfer.setData("application/reactflow", data);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleCreateEnvironment = () => {
    if (!newEnvName.trim()) {
      toast.error("Please enter a node name");
      return;
    }

    const env = addEnvironment(newEnvName.trim(), undefined, newEnvColor);
    toast.success(`Created "${newEnvName}" node`);
    setNewEnvName("");
    setNewEnvColor("#6366f1");
    setShowCreateEnvDialog(false);
  };

  const handleDeleteCustomEnv = (env: CustomEnvironment, e: React.MouseEvent) => {
    e.stopPropagation();
    removeEnvironment(env.id);
    toast.success(`Deleted "${env.name}" node`);
  };

  const categories = Object.entries(NODE_CATEGORIES);

  const renderEnvironmentFlyout = () => {
    const category = "environment";
    const color = CATEGORY_COLORS[category];
    const standardEnvs = NODE_CATEGORIES.environment;

    return (
      <div className="p-2">
        <div
          className="text-xs font-semibold px-2 py-1 mb-1"
          style={{ color }}
        >
          {categoryLabels[category]}
        </div>
        
        {/* Standard Environments */}
        <div className="space-y-0.5">
          {standardEnvs.map((nodeType) => {
            const NodeIcon = PIPELINE_NODE_ICONS[nodeType];
            return (
              <motion.div
                key={nodeType}
                draggable
                onDragStart={(e) =>
                  handleNodeDragStart(
                    e as unknown as React.DragEvent,
                    nodeType as WorkflowNodeType
                  )
                }
                onClick={() => onAddNode?.(nodeType as WorkflowNodeType)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md",
                  "cursor-grab hover:bg-accent/80 active:cursor-grabbing",
                  "transition-colors text-sm"
                )}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="w-5 h-5 rounded flex items-center justify-center bg-background border border-border/50 flex-shrink-0">
                  {NodeIcon ? (
                    <NodeIcon className="w-3.5 h-3.5" />
                  ) : (
                    <Server className="w-3 h-3" style={{ color }} />
                  )}
                </div>
                <span className="text-xs text-foreground/80 truncate">
                  {NODE_LABELS[nodeType as WorkflowNodeType]}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Custom Environments */}
        {customEnvironments.length > 0 && (
          <>
            <div className="h-px bg-border/50 my-2" />
            <div className="text-[10px] text-muted-foreground px-2 py-1 uppercase tracking-wider">
              Custom
            </div>
            <div className="space-y-0.5">
              {customEnvironments.map((env) => (
                <motion.div
                  key={env.id}
                  draggable
                  onDragStart={(e) =>
                    handleNodeDragStart(
                      e as unknown as React.DragEvent,
                      env.id as WorkflowNodeType,
                      env.name
                    )
                  }
                  onClick={() => onAddNode?.(env.id as WorkflowNodeType, env.name)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md group",
                    "cursor-grab hover:bg-accent/80 active:cursor-grabbing",
                    "transition-colors text-sm"
                  )}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${env.color}20`, border: `1px solid ${env.color}40` }}
                  >
                    <Server className="w-3 h-3" style={{ color: env.color }} />
                  </div>
                  <span className="text-xs text-foreground/80 truncate flex-1">
                    {env.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDeleteCustomEnv(env, e)}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {/* Create Custom Button */}
        <div className="h-px bg-border/50 my-2" />
        <motion.button
          onClick={() => setShowCreateEnvDialog(true)}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-md w-full",
            "hover:bg-primary/10 transition-colors text-sm",
            "border border-dashed border-primary/30"
          )}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="w-5 h-5 rounded flex items-center justify-center bg-primary/10 flex-shrink-0">
            <Plus className="w-3 h-3 text-primary" />
          </div>
          <span className="text-xs text-primary font-medium">
            + Add Custom
          </span>
        </motion.button>
      </div>
    );
  };

  return (
    <>
      <motion.div
        className="absolute left-0 top-0 h-full z-30 flex"
        initial={false}
      >
        {/* Compact Icon Bar */}
        <motion.div
          className={cn(
            "h-full flex flex-col bg-white/95 backdrop-blur-md border-r border-border/50 shadow-lg",
            "transition-all duration-300"
          )}
          animate={{ width: isExpanded ? 0 : 52 }}
        >
          {!isExpanded && (
            <>
              {/* Expand Button */}
              <div className="p-2 border-b border-border/30">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onExpandChange(true)}
                      className="h-9 w-9 hover:bg-primary/10"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand Connectors Palette</TooltipContent>
                </Tooltip>
              </div>

              {/* Category Icons */}
              <div className="flex-1 overflow-y-auto py-2 space-y-1">
                {categories.map(([category]) => {
                  const Icon = categoryIcons[category] || GitBranch;
                  const color = CATEGORY_COLORS[category];
                  const isEnvironment = category === "environment";

                  return (
                    <div
                      key={category}
                      className="px-2 relative"
                      onMouseEnter={() => handleCategoryHover(category)}
                      onMouseLeave={handleCategoryLeave}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-9 w-9 rounded-lg transition-all duration-200",
                              hoveredCategory === category && "bg-accent scale-110"
                            )}
                            style={{
                              backgroundColor: hoveredCategory === category ? `${color}15` : undefined,
                            }}
                          >
                            <Icon className="w-4 h-4" style={{ color }} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {categoryLabels[category]}
                        </TooltipContent>
                      </Tooltip>

                      {/* Flyout Menu */}
                      <AnimatePresence>
                        {hoveredCategory === category && (
                          <motion.div
                            initial={{ opacity: 0, x: -10, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -10, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className={cn(
                              "absolute left-full top-0 ml-2 z-50",
                              "bg-white/95 backdrop-blur-md rounded-lg shadow-xl border border-border/50",
                              "min-w-[180px] max-h-[400px] overflow-y-auto"
                            )}
                            onMouseEnter={() => handleCategoryHover(category)}
                            onMouseLeave={handleCategoryLeave}
                          >
                            {isEnvironment ? (
                              renderEnvironmentFlyout()
                            ) : (
                              <div className="p-2">
                                <div
                                  className="text-xs font-semibold px-2 py-1 mb-1"
                                  style={{ color }}
                                >
                                  {categoryLabels[category]}
                                </div>
                                <div className="space-y-0.5">
                                  {NODE_CATEGORIES[category as keyof typeof NODE_CATEGORIES].map((nodeType) => {
                                    const NodeIcon = PIPELINE_NODE_ICONS[nodeType];
                                    return (
                                      <motion.div
                                        key={nodeType}
                                        draggable
                                        onDragStart={(e) =>
                                          handleNodeDragStart(
                                            e as unknown as React.DragEvent,
                                            nodeType as WorkflowNodeType
                                          )
                                        }
                                        onClick={() => onAddNode?.(nodeType as WorkflowNodeType)}
                                        className={cn(
                                          "flex items-center gap-2 px-2 py-1.5 rounded-md",
                                          "cursor-grab hover:bg-accent/80 active:cursor-grabbing",
                                          "transition-colors text-sm"
                                        )}
                                        whileHover={{ x: 4 }}
                                        whileTap={{ scale: 0.98 }}
                                      >
                                        <div className="w-5 h-5 rounded flex items-center justify-center bg-background border border-border/50 flex-shrink-0">
                                          {NodeIcon ? (
                                            <NodeIcon className="w-3.5 h-3.5" />
                                          ) : (
                                            <div
                                              className="w-2 h-2 rounded-full"
                                              style={{ backgroundColor: color }}
                                            />
                                          )}
                                        </div>
                                        <span className="text-xs text-foreground/80 truncate">
                                          {NODE_LABELS[nodeType as WorkflowNodeType]}
                                        </span>
                                      </motion.div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>

      {/* Create Custom Node Dialog */}
      <Dialog open={showCreateEnvDialog} onOpenChange={setShowCreateEnvDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Custom Node</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="env-name">Node Name</Label>
              <Input
                id="env-name"
                placeholder="e.g., Pre-Production, Sandbox, DR..."
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateEnvironment()}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {ENV_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className={cn(
                      "w-8 h-8 rounded-lg border-2 transition-all",
                      newEnvColor === color.value
                        ? "border-foreground scale-110 shadow-md"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setNewEnvColor(color.value)}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
            <div className="pt-2">
              <div className="text-xs text-muted-foreground">
                Preview:
              </div>
              <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ backgroundColor: `${newEnvColor}20`, border: `1px solid ${newEnvColor}40` }}
                >
                  <Server className="w-4 h-4" style={{ color: newEnvColor }} />
                </div>
                <span className="text-sm font-medium">
                  {newEnvName || "Environment Name"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateEnvDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateEnvironment}>
              Create Environment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
