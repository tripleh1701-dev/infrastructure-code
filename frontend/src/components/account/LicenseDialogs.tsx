import { useLicenses, LicenseWithDetails, LicenseFormData } from "@/hooks/useLicenses";
import { LicenseEditDialog } from "./LicenseEditDialog";
import { LicenseDeleteDialog } from "./LicenseDeleteDialog";
import { LicenseAddDialog } from "./LicenseAddDialog";
import { AccountWithDetails } from "@/hooks/useAccounts";
import { toast } from "@/hooks/use-toast";

interface LicenseDialogsProps {
  addingAccountId: string | null;
  editingLicense: LicenseWithDetails | null;
  deletingLicense: LicenseWithDetails | null;
  accounts: AccountWithDetails[];
  onCloseAdd: () => void;
  onCloseEdit: () => void;
  onCloseDelete: () => void;
  onSuccess: () => void;
}

export function LicenseDialogs({
  addingAccountId,
  editingLicense,
  deletingLicense,
  accounts,
  onCloseAdd,
  onCloseEdit,
  onCloseDelete,
  onSuccess,
}: LicenseDialogsProps) {
  const addingAccount = addingAccountId ? accounts.find((a) => a.id === addingAccountId) : null;
  
  // Use the license hooks for the editing/deleting license's account
  const { createLicense, updateLicense, deleteLicense } = useLicenses(
    addingAccountId || editingLicense?.account_id || deletingLicense?.account_id
  );

  const handleAddLicense = async (data: LicenseFormData & { account_id: string }) => {
    try {
      await createLicense.mutateAsync(data);
      toast({ title: "License Added", description: "License has been created successfully." });
      onCloseAdd();
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create license",
        variant: "destructive",
      });
    }
  };

  const handleUpdateLicense = async (data: LicenseFormData) => {
    if (!editingLicense) return;
    try {
      await updateLicense.mutateAsync({ id: editingLicense.id, data });
      toast({ title: "License Updated", description: "License has been updated successfully." });
      onCloseEdit();
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update license",
        variant: "destructive",
      });
    }
  };

  const handleDeleteLicense = async () => {
    if (!deletingLicense) return;
    try {
      await deleteLicense.mutateAsync(deletingLicense.id);
      toast({ title: "License Deleted", description: "License has been deleted successfully." });
      onCloseDelete();
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete license",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {addingAccountId && addingAccount && (
        <LicenseAddDialog
          accountId={addingAccountId}
          accountName={addingAccount.name}
          open={!!addingAccountId}
          onOpenChange={(open) => !open && onCloseAdd()}
          onSave={handleAddLicense}
        />
      )}
      {editingLicense && (
        <LicenseEditDialog
          license={editingLicense}
          open={!!editingLicense}
          onOpenChange={(open) => !open && onCloseEdit()}
          onSave={handleUpdateLicense}
        />
      )}
      {deletingLicense && (
        <LicenseDeleteDialog
          license={deletingLicense}
          open={!!deletingLicense}
          onOpenChange={(open) => !open && onCloseDelete()}
          onConfirm={handleDeleteLicense}
        />
      )}
    </>
  );
}
