import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Maximize2,
  PanelLeftClose,
  PanelLeft,
  Map,
  Sparkles,
  LayoutGrid,
  Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CanvasQuickActionsProps {
  onToggleSidebar: () => void;
  onToggleFullscreen: () => void;
  onToggleMinimap: () => void;
  onAutoLayout: () => void;
  sidebarOpen: boolean;
  isFullscreen: boolean;
  minimapVisible: boolean;
  nodeCount: number;
}

export function CanvasQuickActions({
  onToggleSidebar,
  onToggleFullscreen,
  onToggleMinimap,
  onAutoLayout,
  sidebarOpen,
  isFullscreen,
  minimapVisible,
  nodeCount,
}: CanvasQuickActionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const actions = [
    {
      icon: sidebarOpen ? PanelLeftClose : PanelLeft,
      label: sidebarOpen ? "Hide Node Palette" : "Show Node Palette",
      onClick: onToggleSidebar,
      shortcut: "P",
    },
    {
      icon: Maximize2,
      label: isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode",
      onClick: onToggleFullscreen,
      shortcut: "F",
      active: isFullscreen,
    },
    {
      icon: Map,
      label: minimapVisible ? "Hide Minimap" : "Show Minimap",
      onClick: onToggleMinimap,
      shortcut: "M",
      active: minimapVisible,
    },
    {
      icon: LayoutGrid,
      label: "Auto Layout",
      onClick: onAutoLayout,
      shortcut: "L",
      disabled: nodeCount === 0,
    },
  ];

  return (
    <motion.div
      className="fixed bottom-6 right-6 z-50"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-14 left-0 flex flex-col gap-2"
          >
            {actions.map((action, index) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={action.onClick}
                      disabled={action.disabled}
                      className={cn(
                        "h-10 w-10 rounded-full shadow-lg backdrop-blur-sm",
                        "bg-white/90 border-white/50 hover:bg-white",
                        "transition-all duration-200 hover:scale-110",
                        action.active && "bg-primary/10 border-primary/30 text-primary"
                      )}
                    >
                      <action.icon className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="flex items-center gap-2">
                    <span>{action.label}</span>
                    {action.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded">
                        {action.shortcut}
                      </kbd>
                    )}
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB Button */}
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full shadow-xl",
            "bg-gradient-to-br from-[#0171EC] to-[#0150a8]",
            "hover:from-[#0160c7] hover:to-[#014090]",
            "transition-all duration-300",
            isExpanded && "rotate-45"
          )}
        >
          <Plus className={cn(
            "w-5 h-5 transition-transform duration-300",
            isExpanded && "rotate-45"
          )} />
        </Button>
      </motion.div>

      {/* Keyboard Shortcuts Hint */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute -top-2 -right-2"
          >
            <div className="h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
              <Keyboard className="w-3 h-3 text-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
