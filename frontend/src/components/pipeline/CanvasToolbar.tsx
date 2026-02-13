import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Save,
  Download,
  Upload,
  Undo2,
  Redo2,
  StickyNote,
  MessageSquare,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  ClipboardPaste,
  Grid3X3,
  Minus,
  FolderOpen,
  LayoutGrid,
} from "lucide-react";
import { BackgroundVariant, Panel } from "@xyflow/react";
import { cn } from "@/lib/utils";

// Line style types
export interface LineStyle {
  type: "straight" | "smoothstep" | "bezier";
  pattern: "solid" | "dashed" | "dotted";
  thickness: 1 | 2 | 3;
  arrow: "none" | "end" | "start" | "both";
  animated: boolean;
  color: string;
}

const DEFAULT_LINE_STYLE: LineStyle = {
  type: "smoothstep",
  pattern: "solid",
  thickness: 2,
  arrow: "end",
  animated: true,
  color: "#64748b",
};

const LINE_COLORS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Green" },
  { value: "#f97316", label: "Orange" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#64748b", label: "Slate" },
  { value: "#71717a", label: "Zinc" },
];

interface CanvasToolbarProps {
  // Callbacks
  onAddStickyNote?: () => void;
  onAddComment?: () => void;
  onImportPipeline?: () => void;
  onExportPipeline?: () => void;
  onSavePipeline?: () => void;
  onLoadPipeline?: () => void;
  onToggleGrid?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopySelection?: () => void;
  onPasteSelection?: () => void;
  onLineStyleChange?: (style: LineStyle) => void;
  onBackgroundChange?: (type: BackgroundVariant) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitView?: () => void;
  onAutoLayout?: () => void;
  // State
  backgroundType?: BackgroundVariant;
  lineStyle?: LineStyle;
  isReadOnly?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  hasSelection?: boolean;
  isSaving?: boolean;
  nodeCount?: number;
}

function CanvasToolbarComponent({
  onAddStickyNote,
  onAddComment,
  onImportPipeline,
  onExportPipeline,
  onSavePipeline,
  onLoadPipeline,
  onUndo,
  onRedo,
  onCopySelection,
  onPasteSelection,
  onLineStyleChange,
  onBackgroundChange,
  onZoomIn,
  onZoomOut,
  onFitView,
  onAutoLayout,
  backgroundType = BackgroundVariant.Dots,
  lineStyle = DEFAULT_LINE_STYLE,
  isReadOnly = false,
  canUndo = false,
  canRedo = false,
  hasSelection = false,
  isSaving = false,
  nodeCount = 0,
}: CanvasToolbarProps) {
  const [localLineStyle, setLocalLineStyle] = useState<LineStyle>(lineStyle);

  const handleLineStyleChange = (updates: Partial<LineStyle>) => {
    const newStyle = { ...localLineStyle, ...updates };
    setLocalLineStyle(newStyle);
    onLineStyleChange?.(newStyle);
  };

  const ToolbarSection = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={cn("flex items-center gap-0.5 px-1.5 py-1 bg-background/80 backdrop-blur-sm rounded-lg border border-border shadow-sm", className)}>
      {children}
    </div>
  );

  const ToolbarButton = ({
    icon: Icon,
    label,
    onClick,
    disabled,
    variant = "ghost",
    className,
  }: {
    icon: React.ElementType;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    variant?: "ghost" | "destructive";
    className?: string;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7",
            variant === "destructive" && "text-destructive hover:text-destructive hover:bg-destructive/10",
            className
          )}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon className="w-3.5 h-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );

  return (
    <Panel position="top-right" className="!m-4 flex items-center gap-2">
      {/* 1. Zoom & Layout Section */}
      <ToolbarSection>
        <ToolbarButton icon={ZoomIn} label="Zoom In" onClick={onZoomIn} />
        <ToolbarButton icon={ZoomOut} label="Zoom Out" onClick={onZoomOut} />
        <ToolbarButton icon={Maximize2} label="Fit to Screen" onClick={onFitView} />
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolbarButton 
          icon={LayoutGrid} 
          label="Auto Layout" 
          onClick={onAutoLayout}
          disabled={isReadOnly || nodeCount === 0}
        />
      </ToolbarSection>

      {/* 2. Annotation Section */}
      <ToolbarSection>
        <ToolbarButton
          icon={StickyNote}
          label="Add Sticky Note"
          onClick={onAddStickyNote}
          disabled={isReadOnly}
        />
        <ToolbarButton
          icon={MessageSquare}
          label="Add Comment"
          onClick={onAddComment}
          disabled={isReadOnly}
        />
      </ToolbarSection>

      {/* 3. Edit Section */}
      <ToolbarSection>
        <ToolbarButton
          icon={Undo2}
          label="Undo"
          onClick={onUndo}
          disabled={isReadOnly || !canUndo}
        />
        <ToolbarButton
          icon={Redo2}
          label="Redo"
          onClick={onRedo}
          disabled={isReadOnly || !canRedo}
        />
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolbarButton
          icon={Copy}
          label="Copy Selection"
          onClick={onCopySelection}
          disabled={isReadOnly || !hasSelection}
        />
        <ToolbarButton
          icon={ClipboardPaste}
          label="Paste"
          onClick={onPasteSelection}
          disabled={isReadOnly}
        />
      </ToolbarSection>

      {/* 4. Pipeline Section */}
      <ToolbarSection>
        <ToolbarButton
          icon={Save}
          label="Save Pipeline"
          onClick={onSavePipeline}
          disabled={isReadOnly || isSaving}
        />
        <ToolbarButton
          icon={FolderOpen}
          label="Load Pipeline"
          onClick={onLoadPipeline}
        />
        <ToolbarButton
          icon={Upload}
          label="Import Pipeline"
          onClick={onImportPipeline}
        />
        <ToolbarButton
          icon={Download}
          label="Export Pipeline"
          onClick={onExportPipeline}
        />
      </ToolbarSection>

      {/* 5. Connector Properties */}
      <Popover>
        <PopoverTrigger asChild>
          <div>
            <ToolbarSection className="cursor-pointer hover:bg-accent/50">
              <div className="flex items-center gap-1.5 px-1">
                <Minus className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Connector</span>
              </div>
            </ToolbarSection>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="end">
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Connector Properties</h4>

            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select
                value={localLineStyle.type}
                onValueChange={(v) => handleLineStyleChange({ type: v as LineStyle["type"] })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight">Straight</SelectItem>
                  <SelectItem value="smoothstep">Smooth</SelectItem>
                  <SelectItem value="bezier">Curved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pattern */}
            <div className="space-y-1.5">
              <Label className="text-xs">Pattern</Label>
              <Select
                value={localLineStyle.pattern}
                onValueChange={(v) => handleLineStyleChange({ pattern: v as LineStyle["pattern"] })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="dashed">Dashed</SelectItem>
                  <SelectItem value="dotted">Dotted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Thickness */}
            <div className="space-y-1.5">
              <Label className="text-xs">Thickness</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[localLineStyle.thickness]}
                  onValueChange={(v) => handleLineStyleChange({ thickness: v[0] as 1 | 2 | 3 })}
                  min={1}
                  max={3}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-12">
                  {localLineStyle.thickness === 1 ? "Thin" : localLineStyle.thickness === 2 ? "Medium" : "Thick"}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div className="space-y-1.5">
              <Label className="text-xs">Arrow</Label>
              <Select
                value={localLineStyle.arrow}
                onValueChange={(v) => handleLineStyleChange({ arrow: v as LineStyle["arrow"] })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="end">End</SelectItem>
                  <SelectItem value="start">Start</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Animation */}
            <div className="space-y-1.5">
              <Label className="text-xs">Animation</Label>
              <Select
                value={localLineStyle.animated ? "animated" : "static"}
                onValueChange={(v) => handleLineStyleChange({ animated: v === "animated" })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="animated">Animated</SelectItem>
                  <SelectItem value="static">Static</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label className="text-xs">Color</Label>
              <div className="flex flex-wrap gap-1.5">
                {LINE_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className={cn(
                      "w-6 h-6 rounded-md border-2 transition-all",
                      localLineStyle.color === color.value
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color.value }}
                    onClick={() => handleLineStyleChange({ color: color.value })}
                    title={color.label}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* 6. View (Canvas Background) */}
      <Popover>
        <PopoverTrigger asChild>
          <div>
            <ToolbarSection className="cursor-pointer hover:bg-accent/50">
              <div className="flex items-center gap-1.5 px-1">
                <Grid3X3 className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">View</span>
              </div>
            </ToolbarSection>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-2" align="end">
          <div className="space-y-1">
            <h4 className="font-medium text-xs px-2 py-1 text-muted-foreground">Canvas Background</h4>
            {[
              { value: BackgroundVariant.Dots, label: "Dots" },
              { value: BackgroundVariant.Lines, label: "Lines" },
              { value: BackgroundVariant.Cross, label: "Cross" },
              { value: "solid" as BackgroundVariant, label: "Solid" },
            ].map((option) => (
              <button
                key={option.value}
                className={cn(
                  "w-full text-left text-xs px-2 py-1.5 rounded-md transition-colors",
                  backgroundType === option.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                )}
                onClick={() => onBackgroundChange?.(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </Panel>
  );
}

export const CanvasToolbar = memo(CanvasToolbarComponent);
