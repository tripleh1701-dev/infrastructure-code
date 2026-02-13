import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  CircleDot,
  GitBranch,
  Layers,
  Save,
  Cloud,
  Server,
  Smartphone,
  AlertCircle,
  Check,
  Loader2,
  Pencil,
  ChevronRight,
  Package,
  Workflow,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeploymentType, PipelineMode } from "@/types/pipeline";

interface PipelineHeaderBarProps {
  pipelineName: string;
  onNameChange: (name: string) => void;
  deploymentType: DeploymentType;
  onDeploymentTypeChange: (type: DeploymentType) => void;
  nodeCount: number;
  edgeCount: number;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isAutoSaving?: boolean;
  lastAutoSaved?: Date | null;
  mode: PipelineMode;
  onSave: () => void;
  onBack: () => void;
  // Context selectors
  workstreams?: { id: string; name: string }[];
  products?: { id: string; name: string }[];
  services?: { id: string; name: string }[];
  selectedWorkstreamId?: string;
  selectedProductId?: string;
  selectedServiceIds?: string[];
  onWorkstreamChange?: (id: string) => void;
  onProductChange?: (id: string) => void;
  onServiceChange?: (ids: string[]) => void;
}

const deploymentTypes: { value: DeploymentType; label: string; icon: React.ElementType }[] = [
  { value: "Integration", label: "Integration", icon: Layers },
  { value: "Kubernetes", label: "Kubernetes", icon: Cloud },
  { value: "CloudFoundry", label: "Cloud Foundry", icon: Server },
  { value: "MobileServices", label: "Mobile Services", icon: Smartphone },
];

export function PipelineHeaderBar({
  pipelineName,
  onNameChange,
  deploymentType,
  onDeploymentTypeChange,
  nodeCount,
  edgeCount,
  hasUnsavedChanges,
  isSaving,
  isAutoSaving = false,
  lastAutoSaved = null,
  mode,
  onSave,
  onBack,
  workstreams = [],
  products = [],
  services = [],
  selectedWorkstreamId,
  selectedProductId,
  selectedServiceIds = [],
  onWorkstreamChange,
  onProductChange,
  onServiceChange,
}: PipelineHeaderBarProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(pipelineName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempName(pipelineName);
  }, [pipelineName]);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSubmit = () => {
    const trimmedName = tempName.trim();
    if (trimmedName && trimmedName !== pipelineName) {
      onNameChange(trimmedName);
    } else {
      setTempName(pipelineName);
    }
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNameSubmit();
    } else if (e.key === "Escape") {
      setTempName(pipelineName);
      setIsEditingName(false);
    }
  };

  const DeploymentIcon = deploymentTypes.find(d => d.value === deploymentType)?.icon || Layers;

  const selectedWorkstream = workstreams.find(w => w.id === selectedWorkstreamId);
  const selectedProduct = products.find(p => p.id === selectedProductId);
  const selectedServicesDisplay = services
    .filter(s => selectedServiceIds.includes(s.id))
    .map(s => s.name)
    .join(", ");

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-14 px-4 flex items-center justify-between gap-4 bg-white border-b border-[#e2e8f0] z-20"
    >
      {/* Left Section: Back + Name */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8 flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Back to Pipelines</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-2 min-w-0">
          {isEditingName ? (
            <Input
              ref={inputRef}
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              className="h-8 text-lg font-semibold w-48 border-[#0171EC]"
              placeholder="Pipeline name"
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="group flex items-center gap-2 min-w-0 hover:bg-[#f1f5f9] px-2 py-1 rounded-md transition-colors"
            >
              <h1 className="text-lg font-semibold text-[#0f172a] truncate max-w-[160px]">
                {pipelineName}
              </h1>
              <Pencil className="w-3.5 h-3.5 text-[#94a3b8] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          <span className="text-xs px-2 py-0.5 bg-[#f1f5f9] text-[#64748b] rounded-full capitalize">
            {mode}
          </span>
        </div>
      </div>

      {/* Center Section: Context Breadcrumb */}
      <div className="flex items-center gap-2 flex-1 justify-center">
        {/* Workstream Selector */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
          <Workflow className="w-3.5 h-3.5 text-[#0171EC]" />
          <Select 
            value={selectedWorkstreamId || ""} 
            onValueChange={(v) => onWorkstreamChange?.(v)}
          >
            <SelectTrigger className="h-7 w-[120px] border-0 bg-transparent p-0 text-xs font-medium focus:ring-0">
              <SelectValue placeholder="Workstream" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              {workstreams.map((ws) => (
                <SelectItem key={ws.id} value={ws.id} className="text-xs">
                  {ws.name}
                </SelectItem>
              ))}
              {workstreams.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No workstreams</div>
              )}
            </SelectContent>
          </Select>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-[#94a3b8]" />

        {/* Product Selector */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
          <Package className="w-3.5 h-3.5 text-[#8b5cf6]" />
          <Select 
            value={selectedProductId || ""} 
            onValueChange={(v) => onProductChange?.(v)}
          >
            <SelectTrigger className="h-7 w-[120px] border-0 bg-transparent p-0 text-xs font-medium focus:ring-0">
              <SelectValue placeholder="Product" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
              {products.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No products</div>
              )}
            </SelectContent>
          </Select>
        </div>

        <ChevronRight className="w-3.5 h-3.5 text-[#94a3b8]" />

        {/* Service Selector */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
          <Box className="w-3.5 h-3.5 text-[#10b981]" />
          <Select 
            value={selectedServiceIds[0] || ""} 
            onValueChange={(v) => onServiceChange?.([v])}
          >
            <SelectTrigger className="h-7 w-[120px] border-0 bg-transparent p-0 text-xs font-medium focus:ring-0">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
              {services.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No services</div>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Deployment Type */}
        <div className="ml-2 pl-2 border-l border-[#e2e8f0]">
          <Select value={deploymentType} onValueChange={(v) => onDeploymentTypeChange(v as DeploymentType)}>
            <SelectTrigger className="w-[140px] h-8 bg-[#f8fafc] border-[#e2e8f0] text-xs">
              <div className="flex items-center gap-2">
                <DeploymentIcon className="w-3.5 h-3.5 text-[#64748b]" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              {deploymentTypes.map((type) => (
                <SelectItem key={type.value} value={type.value} className="text-xs">
                  <div className="flex items-center gap-2">
                    <type.icon className="w-3.5 h-3.5" />
                    <span>{type.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right Section: Status Indicators + Save */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Node/Edge Count */}
        <div className="flex items-center gap-2 px-2 py-1 bg-[#f8fafc] rounded-lg border border-[#e2e8f0]">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <CircleDot className="w-3 h-3 text-[#0171EC]" />
                <span className="text-xs font-medium text-[#0f172a]">{nodeCount}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{nodeCount} node{nodeCount !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px h-3 bg-[#e2e8f0]" />

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <GitBranch className="w-3 h-3 text-[#64748b]" />
                <span className="text-xs font-medium text-[#0f172a]">{edgeCount}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{edgeCount} connection{edgeCount !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Unsaved Changes / Autosave Indicator */}
        <AnimatePresence mode="wait">
          {isAutoSaving ? (
            <motion.div
              key="autosaving"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1 text-blue-600"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs font-medium">Saving...</span>
            </motion.div>
          ) : hasUnsavedChanges ? (
            <motion.div
              key="unsaved"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1 text-amber-600"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Unsaved</span>
            </motion.div>
          ) : (
            <motion.div
              key="saved"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-end"
            >
              <div className="flex items-center gap-1 text-emerald-600">
                <Check className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Saved</span>
              </div>
              {lastAutoSaved && (
                <span className="text-[9px] text-slate-400">
                  {lastAutoSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Save Button */}
        <Button
          onClick={onSave}
          disabled={isSaving || !hasUnsavedChanges}
          size="sm"
          className={cn(
            "h-8 px-3 gap-1.5 text-xs",
            hasUnsavedChanges 
              ? "bg-[#0171EC] hover:bg-[#0160c7]" 
              : "bg-[#94a3b8] cursor-not-allowed"
          )}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </>
          )}
        </Button>
      </div>
    </motion.header>
  );
}
