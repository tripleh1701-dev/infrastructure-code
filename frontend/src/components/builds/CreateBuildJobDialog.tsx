import { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBuilds } from "@/hooks/useBuilds";
import { useWorkstreams } from "@/hooks/useWorkstreams";
import { usePipelines } from "@/hooks/usePipelines";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { Zap, FileText, Layers, GitBranch } from "lucide-react";

interface CreateBuildJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBuildJobDialog({ open, onOpenChange }: CreateBuildJobDialogProps) {
  const { createBuildJob } = useBuilds();
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { workstreams } = useWorkstreams(selectedAccount?.id, selectedEnterprise?.id);
  const { pipelines } = usePipelines();

  const [form, setForm] = useState({
    connector_name: "",
    description: "",
    entity: "",
    pipeline: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.connector_name.trim()) return;
    setIsSubmitting(true);
    try {
      await createBuildJob.mutateAsync({
        connector_name: form.connector_name,
        description: form.description || undefined,
        entity: form.entity || undefined,
        pipeline: form.pipeline || undefined,
      });
      setForm({ connector_name: "", description: "", entity: "", pipeline: "" });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-[hsl(186,99%,51%)] flex items-center justify-center"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              <Zap className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <DialogTitle className="text-lg font-semibold">Create New Job</DialogTitle>
              <p className="text-sm text-muted-foreground">Add a new integration build job</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Job Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. SAP-Integration-Main"
              value={form.connector_name}
              onChange={(e) => setForm({ ...form, connector_name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Description
            </Label>
            <Textarea
              placeholder="Brief description of this build job"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              Workstream
            </Label>
            <Select value={form.entity} onValueChange={(v) => setForm({ ...form, entity: v })}>
              <SelectTrigger>
                <SelectValue placeholder={workstreams.length === 0 ? "No workstreams available" : "Select workstream"} />
              </SelectTrigger>
              <SelectContent className="bg-popover z-[100]">
                {workstreams.length === 0 ? (
                  <SelectItem value="__none" disabled>No workstreams found — create one first</SelectItem>
                ) : (
                  workstreams.map((ws) => (
                    <SelectItem key={ws.id} value={ws.name}>
                      {ws.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              Pipeline
            </Label>
            <Select value={form.pipeline} onValueChange={(v) => setForm({ ...form, pipeline: v })}>
              <SelectTrigger>
                <SelectValue placeholder={pipelines.length === 0 ? "No pipelines available" : "Select pipeline"} />
              </SelectTrigger>
              <SelectContent className="bg-popover z-[100]">
                {pipelines.length === 0 ? (
                  <SelectItem value="__none" disabled>No pipelines found — create one first</SelectItem>
                ) : (
                  pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.connector_name.trim() || isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Create Job
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}