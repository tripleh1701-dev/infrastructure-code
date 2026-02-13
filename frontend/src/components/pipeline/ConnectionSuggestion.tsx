import { memo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConnectionSuggestionProps {
  sourceNodeLabel: string;
  targetNodeLabel: string;
  sourceCategory: string;
  targetCategory: string;
  position: { x: number; y: number };
  onAccept: () => void;
  onDismiss: () => void;
}

function ConnectionSuggestionComponent({
  sourceNodeLabel,
  targetNodeLabel,
  sourceCategory,
  targetCategory,
  position,
  onAccept,
  onDismiss,
}: ConnectionSuggestionProps) {
  const [isVisible, setIsVisible] = useState(true);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleAccept = () => {
    setIsVisible(false);
    setTimeout(onAccept, 100);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 100);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute z-50 pointer-events-auto"
          style={{
            left: position.x,
            top: position.y - 60,
          }}
        >
          <div className="bg-white rounded-lg shadow-lg border border-border p-3 min-w-[220px]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-foreground">Connect nodes?</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={handleDismiss}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2 mb-3 text-xs">
              <div className={cn(
                "px-2 py-1 rounded-md truncate max-w-[80px]",
                "bg-muted text-muted-foreground"
              )}>
                {sourceNodeLabel}
              </div>
              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <div className={cn(
                "px-2 py-1 rounded-md truncate max-w-[80px]",
                "bg-primary/10 text-primary font-medium"
              )}>
                {targetNodeLabel}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-xs"
                onClick={handleDismiss}
              >
                Skip
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleAccept}
              >
                <Check className="w-3 h-3 mr-1" />
                Connect
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const ConnectionSuggestion = memo(ConnectionSuggestionComponent);
