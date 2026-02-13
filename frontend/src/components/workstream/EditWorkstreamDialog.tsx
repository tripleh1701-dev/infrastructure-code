import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers, Save, X, Loader2, Pencil, AlertCircle, CheckCircle2 } from "lucide-react";
import { Workstream } from "@/hooks/useWorkstreams";
import { cn } from "@/lib/utils";

interface EditWorkstreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workstream: Workstream | null;
  existingWorkstreams: Workstream[];
  onSave: (id: string, name: string) => Promise<void>;
}

export function EditWorkstreamDialog({
  open,
  onOpenChange,
  workstream,
  existingWorkstreams,
  onSave,
}: EditWorkstreamDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Reset form when dialog opens with workstream data
  useEffect(() => {
    if (open && workstream) {
      setName(workstream.name);
      setError("");
    }
  }, [open, workstream]);

  // Real-time duplicate check
  const isDuplicate = useMemo(() => {
    if (!name.trim() || !workstream) return false;
    const trimmedName = name.trim().toLowerCase();
    // Check if any other workstream (excluding the current one) has the same name
    return existingWorkstreams.some(
      (ws) =>
        ws.id !== workstream.id &&
        ws.name.toLowerCase() === trimmedName
    );
  }, [name, workstream, existingWorkstreams]);

  const isUnchanged = name.trim() === workstream?.name;
  const isValid = name.trim() && !isDuplicate && !isUnchanged;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Workstream name is required");
      return;
    }

    if (isDuplicate) {
      setError("A workstream with this name already exists");
      return;
    }

    if (!workstream) return;

    setIsSubmitting(true);
    setError("");
    
    try {
      await onSave(workstream.id, name.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update workstream");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-amber-50 to-orange-50/30">
          <DialogTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <Pencil className="w-5 h-5 text-amber-600" />
            </motion.div>
            Edit Workstream
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-1">
            Update the workstream name
          </p>
        </DialogHeader>

        <div className="p-6 grid gap-fluid-md">
          {/* Workstream Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-sm font-medium text-slate-700">
              Workstream Name *
            </Label>
            <div className="relative">
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                placeholder="Enter workstream name"
                className={cn(
                  "border-slate-200 focus:border-amber-400 pr-10",
                  isDuplicate && "border-red-300 focus:border-red-400 focus:ring-red-200",
                  isValid && "border-green-300 focus:border-green-400 focus:ring-green-200"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSubmitting && isValid) {
                    handleSubmit();
                  }
                }}
              />
              {/* Inline validation indicator */}
              {name.trim() && !isUnchanged && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isDuplicate ? (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                </div>
              )}
            </div>
            {/* Error/validation messages */}
            {isDuplicate && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                A workstream with this name already exists in this account/enterprise
              </p>
            )}
            {error && !isDuplicate && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            {isValid && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Name is available
              </p>
            )}
          </div>

          {/* Info about propagation */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-start gap-2">
              <Layers className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                This change will be reflected everywhere this workstream is referenced throughout the application.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50/50">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="gap-2"
          >
            <X className="w-4 h-4" />
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
