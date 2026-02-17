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
  FileText,
  AlertTriangle,
  Calendar,
  Building2,
  ExternalLink,
  Bell,
  Mail,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAccountContext } from "@/contexts/AccountContext";
import { useEnterpriseContext } from "@/contexts/EnterpriseContext";

interface ExpiringLicense {
  id: string;
  end_date: string;
  number_of_users: number;
  contact_full_name: string;
  renewal_notify: boolean;
  accounts: { id: string; name: string } | null;
  enterprises: { id: string; name: string } | null;
  products: { id: string; name: string } | null;
}

export function ExpiringLicenses() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  
  // Get selected account and enterprise from context
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  const { data: expiringLicenses = [], isLoading } = useQuery({
    queryKey: ["expiring-licenses", selectedAccount?.id, selectedEnterprise?.id],
    queryFn: async () => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<ExpiringLicense[]>("/api/licenses/expiring", {
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
        .from("account_licenses")
        .select(`
          id,
          end_date,
          number_of_users,
          contact_full_name,
          renewal_notify,
          accounts (id, name),
          enterprises (id, name),
          products (id, name)
        `)
        .gte("end_date", today.toISOString().split("T")[0])
        .lte("end_date", thirtyDaysFromNow.toISOString().split("T")[0]);
      
      if (selectedAccount?.id) {
        query = query.eq("account_id", selectedAccount.id);
      }
      
      if (selectedEnterprise?.id) {
        query = query.eq("enterprise_id", selectedEnterprise.id);
      }
      
      const { data, error } = await query.order("end_date", { ascending: true });

      if (error) throw error;
      return data as ExpiringLicense[];
    },
  });

  const handleSendReminders = async () => {
    setIsSendingReminders(true);
    try {
      let result: { success: boolean; emailsSent?: number; logged?: number; error?: string };

      if (isExternalApi()) {
        const { data, error } = await httpClient.post<typeof result>("/api/licenses/send-reminders");
        if (error) throw new Error(error.message);
        result = data!;
      } else {
        const { data, error } = await supabase.functions.invoke("send-renewal-reminders");
        if (error) throw error;
        result = data;
      }
      
      if (result.success) {
        toast.success(`Successfully sent ${result.emailsSent} renewal reminder${result.emailsSent !== 1 ? "s" : ""}. ${result.logged} logged to history.`);
        queryClient.invalidateQueries({ queryKey: ["notification-history"] });
      } else {
        throw new Error(result.error || "Failed to send reminders");
      }
    } catch (error: any) {
      console.error("Error sending reminders:", error);
      toast.error(error.message || "Failed to send renewal reminders");
    } finally {
      setIsSendingReminders(false);
    }
  };

  const getDaysRemaining = (endDate: string) => {
    return differenceInDays(new Date(endDate), new Date());
  };

  const getUrgencyColor = (daysRemaining: number) => {
    if (daysRemaining <= 7) return "text-destructive";
    if (daysRemaining <= 14) return "text-warning";
    return "text-muted-foreground";
  };

  const getUrgencyBadge = (daysRemaining: number) => {
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
          <Skeleton className="h-5 w-40" />
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
          <div className="p-1.5 rounded-lg bg-warning/10">
            <AlertTriangle className="w-4 h-4 text-warning" />
          </div>
          <h3 className="font-semibold text-[#0f172a]">Expiring Licenses</h3>
        </div>
        <div className="flex items-center gap-2">
          {expiringLicenses.length > 0 && (
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
              <span className="px-2 py-0.5 bg-warning/10 text-warning text-xs font-medium rounded-full">
                {expiringLicenses.length} expiring
              </span>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {expiringLicenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-success" />
            </div>
            <p className="text-sm font-medium text-[#0f172a]">All Clear!</p>
            <p className="text-xs text-[#64748b] mt-1">
              No licenses expiring in the next 30 days
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[320px] overflow-y-auto">
            {expiringLicenses.map((license) => {
              const daysRemaining = getDaysRemaining(license.end_date);
              return (
                <div
                  key={license.id}
                  className="flex gap-3 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] hover:border-[#cbd5e1] transition-colors"
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      daysRemaining <= 7
                        ? "bg-destructive/10"
                        : daysRemaining <= 14
                        ? "bg-warning/10"
                        : "bg-muted"
                    )}
                  >
                    <Calendar
                      className={cn(
                        "w-5 h-5",
                        daysRemaining <= 7
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
                            {license.accounts?.name || "Unknown Account"}
                          </p>
                          {getUrgencyBadge(daysRemaining)}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Building2 className="w-3 h-3 text-[#64748b]" />
                          <span className="text-xs text-[#64748b] truncate">
                            {license.enterprises?.name} • {license.products?.name}
                          </span>
                        </div>
                      </div>
                      {license.renewal_notify && (
                        <Bell className="w-4 h-4 text-success shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        <span className={cn("text-xs font-medium", getUrgencyColor(daysRemaining))}>
                          {daysRemaining} days left
                        </span>
                        <span className="text-xs text-[#94a3b8]">•</span>
                        <span className="text-xs text-[#64748b]">
                          {format(new Date(license.end_date), "MMM d, yyyy")}
                        </span>
                      </div>
                      <span className="text-xs text-[#64748b]">
                        {license.number_of_users} users
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {expiringLicenses.length > 0 && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="gap-1 text-[#0171EC] p-0 h-auto mt-4 w-full justify-center"
            onClick={() => navigate("/account-settings")}
          >
            Manage Licenses
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
