import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCredentials, type Credential } from "@/hooks/useCredentials";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Trash2,
  Loader2,
  AlertTriangle,
  Key,
  Link2,
  Lock,
  ShieldX,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";
import { format } from "date-fns";

// Auth type display mapping
const authTypeDisplayMap: Record<string, string> = {
  oauth: "OAuth2",
  api_key: "API Key",
  basic: "Basic",
  pat: "PAT",
  username_api_key: "Username & API Key",
  username_token: "Username & Token",
  personal_access_token: "Personal Access Token",
  github_app: "GitHub App",
  basic_auth: "Basic Auth",
  bot_token: "Bot Token",
  webhook: "Webhook",
  app_password: "App Password",
};

interface DeleteCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: Credential | null;
  onSuccess?: () => void;
}

export function DeleteCredentialDialog({
  open,
  onOpenChange,
  credential,
  onSuccess,
}: DeleteCredentialDialogProps) {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const { deleteCredential } = useCredentials(selectedAccount?.id, selectedEnterprise?.id);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const handleClose = () => {
    setConfirmText("");
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!credential || confirmText !== credential.name) return;

    setIsSubmitting(true);

    try {
      await deleteCredential.mutateAsync(credential.id);
      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error("Failed to delete credential:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!credential) return null;

  const displayAuthType = authTypeDisplayMap[credential.auth_type] || credential.auth_type;
  const isConfirmValid = confirmText === credential.name;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-gradient-to-b from-background to-muted/30">
        {/* Danger Header with Gradient */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent" />
          <motion.div
            className="absolute -top-20 -right-20 w-40 h-40 bg-destructive/10 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          
          <DialogHeader className="relative p-6 pb-4">
            <div className="flex items-center gap-3">
              <motion.div
                className="p-2.5 bg-gradient-to-br from-destructive to-red-700 rounded-xl shadow-lg shadow-destructive/25"
                initial={{ scale: 0.8, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Trash2 className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <DialogTitle className="text-xl font-semibold text-destructive">
                  Delete Credential
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-0.5">
                  This action cannot be undone
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Danger Zone Warning */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-br from-destructive/10 to-destructive/5 border border-destructive/30 shadow-sm"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            </motion.div>
            <div className="text-sm space-y-2">
              <p className="font-semibold text-destructive">Danger Zone</p>
              <p className="text-muted-foreground leading-relaxed">
                You are about to permanently delete this credential. This will:
              </p>
              <ul className="text-muted-foreground space-y-1 ml-1">
                <li className="flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                  <span>Revoke all access tokens and API keys</span>
                </li>
                <li className="flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                  <span>Break any integrations using this credential</span>
                </li>
                <li className="flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                  <span>Remove all associated notification settings</span>
                </li>
              </ul>
            </div>
          </motion.div>

          {/* Credential Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl border border-destructive/20 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden"
          >
            {/* Credential Name Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-destructive/10 to-destructive/5 border-b border-destructive/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="p-1.5 bg-destructive/10 rounded-lg"
                  >
                    <Key className="w-4 h-4 text-destructive" />
                  </motion.div>
                  <span className="font-semibold text-foreground">{credential.name}</span>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-medium",
                    credential.status === "active" && "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
                    credential.status === "pending" && "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
                    credential.status === "expired" && "bg-destructive/10 text-destructive border-destructive/20",
                    credential.status === "revoked" && "bg-muted text-muted-foreground border-border"
                  )}
                >
                  {credential.status.charAt(0).toUpperCase() + credential.status.slice(1)}
                </Badge>
              </div>
            </div>

            {/* Credential Details */}
            <div className="p-4 space-y-3">
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5" />
                  Connector
                </span>
                <Badge variant="outline" className="bg-muted/50 font-medium">
                  {credential.connector}
                </Badge>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 }}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  Auth Type
                </span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-medium">
                  {displayAuthType}
                </Badge>
              </motion.div>

              {credential.workstream && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-muted-foreground">Workstream</span>
                  <span className="text-sm font-medium text-foreground">
                    {credential.workstream.name}
                  </span>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 }}
                className="flex items-center justify-between"
              >
                <span className="text-sm text-muted-foreground">Created</span>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(credential.created_at), "MMM d, yyyy")}
                </span>
              </motion.div>
            </div>
          </motion.div>

          {/* Confirmation Input */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3"
          >
            <div className="text-sm">
              <p className="text-muted-foreground">
                To confirm deletion, type{" "}
                <code className="px-1.5 py-0.5 bg-destructive/10 text-destructive font-mono text-xs rounded border border-destructive/20">
                  {credential.name}
                </code>{" "}
                below:
              </p>
            </div>
            <div className="relative">
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={`Type "${credential.name}" to confirm`}
                className={cn(
                  "bg-background transition-all duration-200 pr-10",
                  "border-input hover:border-muted-foreground/50",
                  isConfirmValid && "ring-2 ring-emerald-500/20 border-emerald-400",
                  confirmText.length > 0 && !isConfirmValid && "ring-2 ring-destructive/20 border-destructive/50"
                )}
              />
              <AnimatePresence>
                {confirmText.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    {isConfirmValid ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive/50" />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <DialogFooter className="pt-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="hover:bg-muted transition-colors"
            >
              Cancel
            </Button>
            <motion.div
              whileHover={isConfirmValid && !isSubmitting ? { scale: 1.02 } : undefined}
              whileTap={isConfirmValid && !isSubmitting ? { scale: 0.98 } : undefined}
            >
              <Button
                onClick={handleDelete}
                disabled={!isConfirmValid || isSubmitting}
                variant="destructive"
                className={cn(
                  "gap-2 transition-all duration-300",
                  isConfirmValid
                    ? "bg-gradient-to-r from-destructive to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg shadow-destructive/25"
                    : "opacity-50 cursor-not-allowed"
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <ShieldX className="w-4 h-4" />
                    Delete Permanently
                  </>
                )}
              </Button>
            </motion.div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
