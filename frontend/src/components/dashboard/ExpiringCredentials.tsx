import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Key,
  AlertTriangle,
  Calendar,
  Layers,
  ExternalLink,
  Bell,
  Mail,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays, isPast } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";

interface ExpiringCredential {
  id: string;
  name: string;
  connector: string;
  category: string;
  expires_at: string;
  expiry_notify: boolean;
  account_id: string;
  accounts: { id: string; name: string } | null;
  enterprises: { id: string; name: string } | null;
  workstreams: { id: string; name: string } | null;
}

export function ExpiringCredentials() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  const { data: expiringCredentials = [], isLoading } = useQuery({
    queryKey: ["expiring-credentials", selectedAccount?.id, selectedEnterprise?.id],
    queryFn: async () => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<ExpiringCredential[]>("/api/credentials/expiring", {
          params: {
            accountId: selectedAccount?.id,
            enterpriseId: selectedEnterprise?.id,
            days: 30,
          },
        });
        if (error) throw new Error(error.message);
        return data || [];
      }

      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      let query = supabase
        .from("credentials")
        .select(`
          id,
          name,
          connector,
          category,
          expires_at,
          expiry_notify,
          account_id,
          accounts (id, name),
          enterprises (id, name),
          workstreams (id, name)
        `)
        .not("expires_at", "is", null)
        .lte("expires_at", thirtyDaysFromNow.toISOString());
      
      if (selectedAccount?.id) {
        query = query.eq("account_id", selectedAccount.id);
      }
      
      if (selectedEnterprise?.id) {
        query = query.eq("enterprise_id", selectedEnterprise.id);
      }
      
      const { data, error } = await query.order("expires_at", { ascending: true });

      if (error) throw error;
      return (data as ExpiringCredential[]).filter(cred => {
        const daysRemaining = differenceInDays(new Date(cred.expires_at), new Date());
        return daysRemaining <= 30;
      });
    },
  });

  const handleSendReminders = async () => {
    setIsSendingReminders(true);
    try {
      let result: { success: boolean; emailsSent?: number; logged?: number; error?: string };

      if (isExternalApi()) {
        const { data, error } = await httpClient.post<typeof result>("/api/credentials/check-expiration");
        if (error) throw new Error(error.message);
        result = data!;
      } else {
        const { data, error } = await supabase.functions.invoke("check-credential-expiration");
        if (error) throw error;
        result = data;
      }
      
      if (result.success) {
        toast.success(`Successfully sent ${result.emailsSent} credential expiry reminder${result.emailsSent !== 1 ? "s" : ""}. ${result.logged} logged to history.`);
        queryClient.invalidateQueries({ queryKey: ["credential-notification-history"] });
      } else {
        throw new Error(result.error || "Failed to send reminders");
      }
    } catch (error: any) {
      console.error("Error sending reminders:", error);
      toast.error(error.message || "Failed to send credential expiry reminders");
    } finally {
      setIsSendingReminders(false);
    }
  };

  const getDaysRemaining = (expiresAt: string) => {
    return differenceInDays(new Date(expiresAt), new Date());
  };

  const getUrgencyColor = (daysRemaining: number) => {
    if (daysRemaining < 0) return "text-destructive";
    if (daysRemaining <= 7) return "text-destructive";
    if (daysRemaining <= 14) return "text-warning";
    return "text-muted-foreground";
  };

  const getUrgencyBadge = (daysRemaining: number) => {
    if (daysRemaining < 0) {
      return (
        <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
          Expired
        </Badge>
      );
    }
    if (daysRemaining <= 7) {
      return (
        <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
          Critical
        </Badge>
      );
    }
    if (daysRemaining <= 14) {
      return (
        <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-warning border-warning">
          Soon
        </Badge>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f0]">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f0]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-destructive/10">
            <Key className="w-4 h-4 text-destructive" />
          </div>
          <h3 className="font-semibold text-[#0f172a]">Expiring Credentials</h3>
        </div>
        <div className="flex items-center gap-2">
          {expiringCredentials.length > 0 && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                onClick={handleSendReminders}
                disabled={isSendingReminders}
              >
                {isSendingReminders ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Mail className="w-3 h-3" />
                )}
                Send Reminders
              </Button>
              <span className="px-2 py-0.5 bg-destructive/10 text-destructive text-xs font-medium rounded-full">
                {expiringCredentials.length} expiring
              </span>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {expiringCredentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
              <Key className="w-6 h-6 text-success" />
            </div>
            <p className="text-sm font-medium text-[#0f172a]">All Clear!</p>
            <p className="text-xs text-[#64748b] mt-1">
              No credentials expiring in the next 30 days
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[320px] overflow-y-auto">
            {expiringCredentials.map((credential) => {
              const daysRemaining = getDaysRemaining(credential.expires_at);
              const isExpired = isPast(new Date(credential.expires_at));
              return (
                <div
                  key={credential.id}
                  className="flex gap-3 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#cbd5e1] transition-colors"
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      isExpired || daysRemaining <= 7
                        ? "bg-destructive/10"
                        : daysRemaining <= 14
                        ? "bg-warning/10"
                        : "bg-muted"
                    )}
                  >
                    <Calendar
                      className={cn(
                        "w-5 h-5",
                        isExpired || daysRemaining <= 7
                          ? "text-destructive"
                          : daysRemaining <= 14
                          ? "text-warning"
                          : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[#0f172a] truncate">
                            {credential.name}
                          </p>
                          {getUrgencyBadge(daysRemaining)}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Layers className="w-3 h-3 text-[#64748b]" />
                          <span className="text-xs text-[#64748b] truncate">
                            {credential.connector} • {credential.workstreams?.name || "Unknown Workstream"}
                          </span>
                        </div>
                      </div>
                      {credential.expiry_notify && (
                        <Bell className="w-4 h-4 text-success shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        <span className={cn("text-xs font-medium", getUrgencyColor(daysRemaining))}>
                          {isExpired ? "Expired" : `${daysRemaining} days left`}
                        </span>
                        <span className="text-xs text-[#94a3b8]">•</span>
                        <span className="text-xs text-[#64748b]">
                          {format(new Date(credential.expires_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      <span className="text-xs text-[#64748b]">
                        {credential.accounts?.name || "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {expiringCredentials.length > 0 && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="gap-1 text-[#0171EC] p-0 h-auto mt-4 w-full justify-center"
            onClick={() => navigate("/security")}
          >
            Manage Credentials
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
