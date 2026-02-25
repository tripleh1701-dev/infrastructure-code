import { LayoutGrid, List } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

export type ViewMode = "table" | "tile";

interface ViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ view, onViewChange, className }: ViewToggleProps) {
  return (
    <div className={cn("flex items-center gap-1 p-1 bg-muted/50 rounded-lg border border-border", className)}>
      <Toggle
        pressed={view === "table"}
        onPressedChange={() => onViewChange("table")}
        aria-label="Table view"
        className="h-8 w-8 p-0 data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:border data-[state=on]:border-border text-muted-foreground data-[state=on]:text-foreground"
      >
        <List className="h-4 w-4" />
      </Toggle>
      <Toggle
        pressed={view === "tile"}
        onPressedChange={() => onViewChange("tile")}
        aria-label="Tile view"
        className="h-8 w-8 p-0 data-[state=on]:bg-background data-[state=on]:shadow-sm data-[state=on]:border data-[state=on]:border-border text-muted-foreground data-[state=on]:text-foreground"
      >
        <LayoutGrid className="h-4 w-4" />
      </Toggle>
    </div>
  );
}
