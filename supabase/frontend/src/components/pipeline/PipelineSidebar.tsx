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
  X,
  ChevronsDownUp,
  ChevronsUpDown,
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
  const allCategories = Object.keys(NODE_CATEGORIES);
  const [openCategories, setOpenCategories] = useState<string[]>(["environment", "plan", "code", "build"]);
  const [preSearchOpen, setPreSearchOpen] = useState<string[] | null>(null);

  const allExpanded = allCategories.every((c) => openCategories.includes(c));

  const toggleAll = () => {
    setOpenCategories(allExpanded ? [] : allCategories);
  };

  const handleSearch = (value: string) => {
    if (value && !searchQuery) {
      // Entering search — save current state, expand all
      setPreSearchOpen(openCategories);
      setOpenCategories(allCategories);
    } else if (!value && preSearchOpen !== null) {
      // Clearing search — restore previous state
      setOpenCategories(preSearchOpen);
      setPreSearchOpen(null);
    }
    setSearchQuery(value);
  };

  const onDragStart = (event: React.DragEvent, nodeType: WorkflowNodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleAddClick = (nodeType: WorkflowNodeType) => {
    if (onAddNode) onAddNode(nodeType);
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

  const totalNodes = filteredCategories.reduce((acc, [_, nodes]) => {
    return acc + nodes.filter((n) =>
      NODE_LABELS[n as WorkflowNodeType].toLowerCase().includes(searchQuery.toLowerCase())
    ).length;
  }, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f8fafc] border-r border-[#e2e8f0]">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3.5 bg-white border-b border-[#e2e8f0]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Server className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-[#0f172a] leading-tight">Node Palette</h3>
            <p className="text-[10px] text-[#94a3b8] leading-tight">{totalNodes} nodes available</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleAll}
                className="h-7 w-7 rounded-lg hover:bg-[#f1f5f9] text-[#64748b]"
              >
                <motion.div
                  key={allExpanded ? "collapse" : "expand"}
                  initial={{ opacity: 0, rotate: -15 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {allExpanded ? (
                    <ChevronsDownUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                  )}
                </motion.div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {allExpanded ? "Collapse all" : "Expand all"}
            </TooltipContent>
          </Tooltip>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 rounded-lg hover:bg-[#f1f5f9] text-[#64748b]"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 p-3 bg-white border-b border-[#e2e8f0]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
          <Input
            type="search"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-8 h-8 text-sm bg-[#f8fafc] border-[#e2e8f0] rounded-lg focus-visible:ring-1 focus-visible:ring-primary/30"
          />
          <AnimatePresence>
            {searchQuery && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => handleSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] transition-colors"
              >
                <X className="w-3 h-3" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Scrollable Node Categories */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="p-3 space-y-1.5">
          {filteredCategories.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-10 gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-[#e2e8f0] flex items-center justify-center">
                <Search className="w-4 h-4 text-[#94a3b8]" />
              </div>
              <p className="text-xs text-[#94a3b8] text-center">No nodes match<br />"{searchQuery}"</p>
            </motion.div>
          ) : (
            filteredCategories.map(([category, nodes], categoryIndex) => {
              const Icon = categoryIcons[category] || GitBranch;
              const color = CATEGORY_COLORS[category];
              const isOpen = openCategories.includes(category);

              const filteredNodes = nodes.filter((node) =>
                NODE_LABELS[node as WorkflowNodeType].toLowerCase().includes(searchQuery.toLowerCase())
              );

              if (filteredNodes.length === 0) return null;

              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: categoryIndex * 0.04 }}
                >
                  <Collapsible
                    open={isOpen}
                    onOpenChange={() => toggleCategory(category)}
                  >
                    <CollapsibleTrigger className="w-full group">
                      <div
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200",
                          isOpen
                            ? "bg-white shadow-sm border border-[#e2e8f0]"
                            : "hover:bg-white hover:shadow-sm hover:border hover:border-[#e2e8f0] border border-transparent"
                        )}
                      >
                        {/* Category icon */}
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
                          style={{ backgroundColor: `${color}18` }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color }} />
                        </div>

                        <span className="flex-1 text-left text-xs font-semibold text-[#374151] tracking-wide uppercase">
                          {categoryLabels[category]}
                        </span>

                        {/* Count badge */}
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-all"
                          style={{ backgroundColor: `${color}18`, color }}
                        >
                          {filteredNodes.length}
                        </span>

                        <motion.div
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                        >
                          <ChevronDown className="w-3.5 h-3.5 text-[#94a3b8]" />
                        </motion.div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="mt-1 pl-2 pr-1 pb-1 space-y-0.5">
                        <AnimatePresence initial={false}>
                          {filteredNodes.map((nodeType, nodeIndex) => {
                            const NodeIcon = PIPELINE_NODE_ICONS[nodeType];
                            return (
                              <motion.div
                                key={nodeType}
                                initial={{ opacity: 0, x: -8, height: 0 }}
                                animate={{ opacity: 1, x: 0, height: "auto" }}
                                exit={{ opacity: 0, x: -8, height: 0 }}
                                transition={{
                                  duration: 0.18,
                                  delay: nodeIndex * 0.03,
                                  ease: "easeOut",
                                }}
                                draggable
                                onDragStart={(e) =>
                                  onDragStart(e as unknown as React.DragEvent, nodeType as WorkflowNodeType)
                                }
                                className="group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-grab hover:bg-white hover:shadow-sm border border-transparent hover:border-[#e2e8f0] transition-all duration-150 active:cursor-grabbing active:scale-[0.98]"
                              >
                                {/* Drag handle */}
                                <GripVertical className="w-3 h-3 text-[#cbd5e1] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />

                                {/* Node icon */}
                                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-white border border-[#e2e8f0] shadow-sm group-hover:border-[#cbd5e1] transition-colors">
                                  {NodeIcon ? (
                                    <NodeIcon className="w-3.5 h-3.5" />
                                  ) : (
                                    <div
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: color }}
                                    />
                                  )}
                                </div>

                                {/* Node label */}
                                <span className="flex-1 text-xs text-[#475569] group-hover:text-[#1e293b] transition-colors font-medium leading-tight">
                                  {NODE_LABELS[nodeType as WorkflowNodeType]}
                                </span>

                                {/* Add button */}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-all duration-150 hover:bg-primary/10 rounded-md flex-shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddClick(nodeType as WorkflowNodeType);
                                      }}
                                    >
                                      <Plus className="w-3 h-3 text-primary" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="text-xs">
                                    Add to canvas
                                  </TooltipContent>
                                </Tooltip>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[#e2e8f0] bg-white">
        <p className="text-[10px] text-[#94a3b8] text-center leading-relaxed">
          Drag to canvas &nbsp;·&nbsp; Click <Plus className="w-2.5 h-2.5 inline mb-0.5" /> to add
        </p>
      </div>
    </div>
  );
}
