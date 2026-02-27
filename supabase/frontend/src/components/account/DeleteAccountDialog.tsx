import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle } from "lucide-react";
import { AccountWithDetails, useAccounts } from "@/hooks/useAccounts";

interface DeleteAccountDialogProps {
  account: AccountWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteAccountDialog({
  account,
  open,
  onOpenChange,
  onSuccess,
}: DeleteAccountDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const { deleteAccount } = useAccounts();

  const isConfirmValid = confirmText === account.name;

  const handleDelete = async () => {
    if (!isConfirmValid) return;

    try {
      await deleteAccount.mutateAsync(account.id);
      setConfirmText("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleClose = () => {
    setConfirmText("");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <AlertDialogTitle className="text-xl">Delete Account</AlertDialogTitle>
              <p className="text-sm text-muted-foreground">This action cannot be undone</p>
            </div>
          </div>
          <AlertDialogDescription className="text-left pt-2">
            <p className="mb-4">
              You are about to permanently delete the account{" "}
              <span className="font-semibold text-foreground">"{account.name}"</span> and all
              associated data including addresses and technical users.
            </p>
            <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 mb-4">
              <p className="text-sm text-destructive font-medium">
                This will delete:
              </p>
              <ul className="text-sm text-destructive/80 mt-1 space-y-0.5">
                <li>• {account.addresses.length} address(es)</li>
                <li>• {account.technical_users.length} technical user(s)</li>
                <li>• All associated configurations</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-foreground">
                Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{account.name}</span> to confirm:
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Enter account name to confirm"
                className="font-mono"
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel onClick={handleClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!isConfirmValid || deleteAccount.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
          >
            {deleteAccount.isPending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete Account
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
