import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useWorkstreams, Workstream } from "@/hooks/useWorkstreams";
import { useDefaultWorkstream } from "@/hooks/useUserWorkstreams";
import { Skeleton } from "@/components/ui/skeleton";

interface WorkstreamMultiSelectProps {
  accountId?: string;
  enterpriseId?: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled?: boolean;
  /** If true, will auto-select default workstream when selectedIds is empty */
  autoSelectDefault?: boolean;
}

export function WorkstreamMultiSelect({
  accountId,
  enterpriseId,
  selectedIds,
  onSelectionChange,
  disabled = false,
  autoSelectDefault = true,
}: WorkstreamMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  // Fetch workstreams for this account/enterprise
  const { workstreams, isLoading: workstreamsLoading } = useWorkstreams(accountId, enterpriseId);
  
  // Ensure a default workstream exists
  const { data: defaultWorkstream, isLoading: defaultLoading } = useDefaultWorkstream(accountId, enterpriseId);
  
  const isLoading = workstreamsLoading || defaultLoading;

  // Track when component has received its initial data
  useEffect(() => {
    if (!isLoading && !hasInitialized) {
      setHasInitialized(true);
    }
  }, [isLoading, hasInitialized]);

  // Auto-select default workstream ONLY if:
  // 1. autoSelectDefault is true (for new users, not editing)
  // 2. Component has initialized
  // 3. selectedIds is still empty after initialization
  // 4. default exists
  useEffect(() => {
    if (autoSelectDefault && hasInitialized && !isLoading && defaultWorkstream && selectedIds.length === 0) {
      onSelectionChange([defaultWorkstream.id]);
    }
  }, [autoSelectDefault, hasInitialized, isLoading, defaultWorkstream, selectedIds.length, onSelectionChange]);

  const handleToggle = (workstreamId: string) => {
    if (selectedIds.includes(workstreamId)) {
      // Don't allow deselecting if it's the only one selected
      if (selectedIds.length > 1) {
        onSelectionChange(selectedIds.filter((id) => id !== workstreamId));
      }
    } else {
      onSelectionChange([...selectedIds, workstreamId]);
    }
  };

  const selectedWorkstreams = workstreams.filter((ws) => selectedIds.includes(ws.id));

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!accountId || !enterpriseId) {
    return (
      <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg border">
        Select an account and enterprise to see available workstreams.
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-auto min-h-10",
            selectedIds.length === 0 && "text-muted-foreground"
          )}
          disabled={disabled || workstreams.length === 0}
        >
          <div className="flex flex-wrap gap-1.5 py-1">
            {selectedWorkstreams.length > 0 ? (
              selectedWorkstreams.map((ws) => (
                <Badge
                  key={ws.id}
                  variant="secondary"
                  className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                >
                  <Layers className="w-3 h-3 mr-1" />
                  {ws.name}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">Select workstreams...</span>
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Layers className="w-4 h-4" />
            Available Workstreams
          </div>
        </div>
        <div className="max-h-[200px] overflow-y-auto p-2 space-y-1">
          <AnimatePresence>
            {workstreams.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 text-center">
                No workstreams available
              </div>
            ) : (
              workstreams.map((ws) => {
                const isSelected = selectedIds.includes(ws.id);
                const isOnlySelected = isSelected && selectedIds.length === 1;
                
                return (
                  <motion.div
                    key={ws.id}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted border border-transparent",
                      isOnlySelected && "cursor-not-allowed opacity-75"
                    )}
                    onClick={() => !isOnlySelected && handleToggle(ws.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isOnlySelected}
                      className={cn(
                        isSelected && "border-primary data-[state=checked]:bg-primary"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{ws.name}</div>
                      {ws.tools && ws.tools.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {ws.tools.length} tool{ws.tools.length !== 1 ? "s" : ""} configured
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
        {selectedIds.length > 0 && (
          <div className="p-2 border-t bg-muted/30">
            <div className="text-xs text-muted-foreground text-center">
              {selectedIds.length} workstream{selectedIds.length !== 1 ? "s" : ""} selected
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
