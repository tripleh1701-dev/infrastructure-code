import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Mail,
  RefreshCw,
  User,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountContext } from "@/contexts/AccountContext";

interface RetryEligibleEntry {
  auditId: string;
  recipientEmail: string;
  recipientFirstName: string;
  recipientLastName: string;
  accountId?: string;
  accountName?: string;
  userId?: string;
  errorMessage?: string;
  failedAt: string;
  retryCount: number;
}

interface RetrySummary {
  eligibleCount: number;
  exhaustedCount: number;
  sesHealthy: boolean;
  entries: RetryEligibleEntry[];
}

export function FailedEmailRetryPanel() {
  const external = isExternalApi();
  const queryClient = useQueryClient();
  const { selectedAccount } = useAccountContext();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<RetrySummary>({
    queryKey: ["notification-retry-summary", selectedAccount?.id],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (selectedAccount?.id) params.accountId = selectedAccount.id;
      const { data: result, error } = await httpClient.get<RetrySummary>(
        "/notification-audit/retry-summary",
        { params }
      );
      if (error) throw new Error(error.message);
      return result!;
    },
    enabled: external,
    refetchInterval: 60_000,
  });

  if (!external) return null;

  const handleRetry = async (entry: RetryEligibleEntry) => {
    if (!entry.userId) {
      toast.error("Cannot retry — user ID not found in audit entry. Use 'Resend Credentials' from the Access Control page.");
      return;
    }

    setRetryingId(entry.auditId);
    try {
      const { data: result, error } = await httpClient.post<{
        success: boolean;
        emailSent?: boolean;
        emailError?: string;
        fallbackPassword?: string;
      }>(`/users/${entry.userId}/resend-credentials`, {});

      if (error) {
        toast.error(`Retry failed: ${error.message}`);
        return;
      }

      if (result?.emailSent) {
        toast.success(`Credential email resent to ${entry.recipientEmail}`);
        // Mark as retried in audit
        await httpClient.post(`/notification-audit/${entry.auditId}/mark-retried?succeeded=true`, {});
      } else if (result?.fallbackPassword) {
        toast.info(
          `Email still failed for ${entry.recipientEmail}. Temporary password: ${result.fallbackPassword}`,
          { duration: 20000 }
        );
        await httpClient.post(`/notification-audit/${entry.auditId}/mark-retried?succeeded=false`, {});
      } else {
        toast.error(result?.emailError || "Retry failed — check SES configuration");
      }

      refetch();
      queryClient.invalidateQueries({ queryKey: ["notification-history"] });
    } catch (err: any) {
      toast.error(`Retry failed: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const isEmpty = !data || data.eligibleCount === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 overflow-hidden shadow-lg"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-red-50/50 to-transparent">
        <div className="flex items-center gap-4">
          <motion.div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-200/50"
            whileHover={{ rotate: -15, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <RotateCcw className="w-6 h-6 text-white" />
          </motion.div>
          <div>
            <h3 className="font-semibold text-slate-800 text-lg">Failed Email Retry</h3>
            <p className="text-sm text-slate-500">
              Retry credential emails that failed to deliver
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && !isEmpty && (
            <Badge variant="outline" className="gap-1.5 font-medium bg-red-50 text-red-700 border-red-200">
              <XCircle className="w-3.5 h-3.5" />
              {data.eligibleCount} pending
            </Badge>
          )}
          {data && data.exhaustedCount > 0 && (
            <Badge variant="outline" className="gap-1.5 font-medium bg-slate-50 text-slate-600 border-slate-200">
              {data.exhaustedCount} exhausted
            </Badge>
          )}
          {data && !data.sesHealthy && (
            <Badge variant="outline" className="gap-1.5 font-medium bg-amber-50 text-amber-700 border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" />
              SES unhealthy
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            className="gap-2 bg-white/80 border-slate-200 hover:border-red-300 hover:text-red-600 transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-8 text-center text-slate-400"
          >
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
            <span className="text-sm">Checking failed notifications...</span>
          </motion.div>
        ) : isEmpty ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-8 text-center text-slate-400"
          >
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400 opacity-60" />
            <p className="text-sm font-medium text-slate-500">No failed emails to retry</p>
            <p className="text-xs text-slate-400 mt-1">All credential notifications delivered successfully</p>
          </motion.div>
        ) : (
          <motion.div
            key="entries"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-5 space-y-3"
          >
            {!data?.sesHealthy && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700 mb-4">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">SES is not healthy</p>
                  <p className="mt-0.5">Fix SES configuration before retrying — emails may continue to fail.</p>
                </div>
              </div>
            )}

            {data?.entries.map((entry) => (
              <motion.div
                key={entry.auditId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {entry.recipientFirstName} {entry.recipientLastName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{entry.recipientEmail}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(entry.failedAt).toLocaleString()}
                    </span>
                    {entry.retryCount > 0 && (
                      <span className="text-[10px] text-amber-600 font-medium">
                        {entry.retryCount}/3 retries
                      </span>
                    )}
                  </div>
                  {entry.errorMessage && (
                    <p className="text-[10px] text-red-500 mt-1 truncate" title={entry.errorMessage}>
                      Error: {entry.errorMessage}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRetry(entry)}
                  disabled={retryingId === entry.auditId || !data?.sesHealthy}
                  className="gap-1.5 text-xs flex-shrink-0 hover:border-red-300 hover:text-red-600"
                >
                  {retryingId === entry.auditId ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  {retryingId === entry.auditId ? "Retrying..." : "Retry"}
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
