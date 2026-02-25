import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBuildYamlViewer } from "@/hooks/usePipelineConfigs";
import { BuildJob } from "@/hooks/useBuilds";
import { FileCode, RotateCw, FileX } from "lucide-react";

interface PipelineConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildJob?: BuildJob | null;
}

/**
 * View Build YAML dialog (read-only, admin-only).
 * Fetches the latest stored Build YAML and displays it in a code preview.
 */
export function PipelineConfigDialog({
  open,
  onOpenChange,
  buildJob,
}: PipelineConfigDialogProps) {
  const { data: yamlData, isLoading, refetch } = useBuildYamlViewer(
    buildJob?.id,
    buildJob?.pipeline || undefined,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              <FileCode className="w-5 h-5 text-primary-foreground" />
            </motion.div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                Build YAML
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {buildJob?.connector_name} — {buildJob?.pipeline || "No pipeline"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RotateCw className="w-5 h-5 text-primary animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">Loading Build YAML...</span>
            </div>
          ) : yamlData?.yamlContent ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Version: <span className="font-medium text-foreground">{yamlData.buildVersion}</span></span>
                  <span>Status: <span className="font-medium text-foreground">{yamlData.status}</span></span>
                  <span>Updated: <span className="font-medium text-foreground">{new Date(yamlData.createdAt).toLocaleString()}</span></span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs">
                  <RotateCw className="w-3 h-3 mr-1" /> Refresh
                </Button>
              </div>
              <ScrollArea className="h-[400px]">
                <pre className="p-4 rounded-lg bg-muted/50 border border-border/50 text-xs font-mono whitespace-pre-wrap text-foreground/90 leading-relaxed">
                  {yamlData.yamlContent}
                </pre>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileX className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No Build YAML generated yet</p>
              <p className="text-xs mt-1">
                Build YAML is auto-generated when a pipeline is assigned and configurations are saved.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
