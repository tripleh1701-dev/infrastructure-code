import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  GitBranch,
  Hammer,
  TestTube,
  Rocket,
  CheckSquare,
  Server,
  StickyNote,
  Plus,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkflowNodeType } from "@/types/pipeline";
import { NODE_LABELS, NODE_CATEGORIES, CATEGORY_COLORS } from "@/constants/pipeline";
import { PIPELINE_NODE_ICONS } from "./icons/BrandIcons";

interface PipelineSidebarProps {
  onClose: () => void;
  onAddNode?: (nodeType: WorkflowNodeType) => void;
}

const categoryIcons: Record<string, React.ElementType> = {
  plan: ClipboardList,
  code: GitBranch,
  build: Hammer,
  test: TestTube,
  release: Rocket,
  deploy: Rocket,
  approval: CheckSquare,
  environment: Server,
  annotation: StickyNote,
};

const categoryLabels: Record<string, string> = {
  plan: "Planning",
  code: "Source Code",
  build: "Build",
  test: "Testing",
  release: "Release",
  deploy: "Deployment",
  approval: "Approval",
  environment: "Nodes",
  annotation: "Annotations",
};

export function PipelineSidebar({ onClose, onAddNode }: PipelineSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<string[]>(["plan", "code", "build"]);

  const onDragStart = (event: React.DragEvent, nodeType: WorkflowNodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleAddClick = (nodeType: WorkflowNodeType) => {
    if (onAddNode) {
      onAddNode(nodeType);
    }
  };

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const filteredCategories = Object.entries(NODE_CATEGORIES).filter(([_, nodes]) =>
    nodes.some((node) =>
      NODE_LABELS[node as WorkflowNodeType].toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#e2e8f0]">
        <h3 className="font-semibold text-[#0f172a]">Node Palette</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-[#e2e8f0]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
          <Input
            type="search"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-[#f8fafc] border-[#e2e8f0]"
          />
        </div>
      </div>

      {/* Node Categories */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredCategories.map(([category, nodes]) => {
          const Icon = categoryIcons[category] || GitBranch;
          const color = CATEGORY_COLORS[category];
          const isOpen = openCategories.includes(category);

          const filteredNodes = nodes.filter((node) =>
            NODE_LABELS[node as WorkflowNodeType].toLowerCase().includes(searchQuery.toLowerCase())
          );

          if (filteredNodes.length === 0) return null;

          return (
            <Collapsible
              key={category}
              open={isOpen}
              onOpenChange={() => toggleCategory(category)}
            >
              <CollapsibleTrigger className="w-full">
                <div
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg transition-colors",
                    isOpen ? "bg-[#f8fafc]" : "hover:bg-[#f8fafc]"
                  )}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <span className="flex-1 text-left font-medium text-[#0f172a]">
                    {categoryLabels[category]}
                  </span>
                  <span className="text-xs text-[#64748b] mr-2">{filteredNodes.length}</span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-[#64748b] transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <AnimatePresence>
                  <div className="pl-4 py-2 space-y-1">
                    {filteredNodes.map((nodeType) => {
                      const NodeIcon = PIPELINE_NODE_ICONS[nodeType];
                      return (
                        <motion.div
                          key={nodeType}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          draggable
                          onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, nodeType as WorkflowNodeType)}
                          className="group flex items-center gap-2 p-2 rounded-lg cursor-grab hover:bg-[#f1f5f9] transition-colors active:cursor-grabbing"
                        >
                          <GripVertical className="w-3 h-3 text-[#cbd5e1] opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-white border border-[#e2e8f0]"
                          >
                            {NodeIcon ? (
                              <NodeIcon className="w-4 h-4" />
                            ) : (
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            )}
                          </div>
                          <span className="flex-1 text-sm text-[#475569]">
                            {NODE_LABELS[nodeType as WorkflowNodeType]}
                          </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#e2e8f0]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddClick(nodeType as WorkflowNodeType);
                              }}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>Click to add to canvas</p>
                          </TooltipContent>
                        </Tooltip>
                        </motion.div>
                      );
                    })}
                  </div>
                </AnimatePresence>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Help Text */}
      <div className="p-4 border-t border-[#e2e8f0] bg-[#f8fafc]">
        <p className="text-xs text-[#64748b] text-center">
          Drag nodes or click <Plus className="w-3 h-3 inline" /> to add to canvas
        </p>
      </div>
    </div>
  );
}
