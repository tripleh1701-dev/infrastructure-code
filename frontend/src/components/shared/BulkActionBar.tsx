import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Trash2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  entityName: string;
  onToggleAll: () => void;
  onClear: () => void;
  onDelete: () => Promise<void>;
  isAllSelected: boolean;
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  entityName,
  onToggleAll,
  onClear,
  onDelete,
  isAllSelected,
}: BulkActionBarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
      setDialogOpen(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -10, height: 0 }}
        className="mb-4"
      >
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-sm font-medium text-red-700">
            {selectedCount} selected
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs text-slate-600 hover:text-slate-900"
            onClick={onToggleAll}
          >
            {isAllSelected ? "Deselect All" : `Select All (${totalCount})`}
          </Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs text-slate-500"
            onClick={onClear}
          >
            <X className="w-3.5 h-3.5" /> Clear
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white"
            onClick={() => setDialogOpen(true)}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Selected
          </Button>
        </div>
      </motion.div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} {entityName}{selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected {entityName}{selectedCount !== 1 ? "s" : ""}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : `Delete ${selectedCount}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
