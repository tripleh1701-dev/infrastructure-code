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
import { useDeleteGroup, Group } from "@/hooks/useGroups";

interface DeleteGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group | null;
}

export function DeleteGroupDialog({ open, onOpenChange, group }: DeleteGroupDialogProps) {
  const deleteGroup = useDeleteGroup();

  const handleDelete = async () => {
    if (!group) return;
    
    try {
      await deleteGroup.mutateAsync(group.id);
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Group</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the group{" "}
            <span className="font-semibold">"{group?.name}"</span>? 
            {(group?.memberCount ?? 0) > 0 && (
              <span className="block mt-2 text-destructive">
                Warning: This group has {group?.memberCount} member(s). Users in this group will need to be reassigned.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteGroup.isPending}
          >
            {deleteGroup.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
