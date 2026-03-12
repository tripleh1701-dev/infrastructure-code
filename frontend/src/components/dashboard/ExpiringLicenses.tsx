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
  XCircle,
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

  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  const { data: allLicenses = [], isLoading } = useQuery({
    queryKey: ["expiring-licenses", selectedAccount?.id, selectedEnterprise?.id],
    queryFn: async () => {
      if (isExternalApi()) {
        // Fetch both expired and expiring from the API
        const [expiringRes, expiredRes] = await Promise.all([
          httpClient.get<ExpiringLicense[]>("/licenses/expiring", {
            params: {
              accountId: selectedAccount?.id,
              enterpriseId: selectedEnterprise?.id,
              days: 30,
            },
          }),
          httpClient.get<ExpiringLicense[]>("/licenses", {
            params: {
              accountId: selectedAccount?.id,
            },
          }),
        ]);

        const expiring = expiringRes.data || [];
        // Filter already-expired from all licenses
        const today = new Date().toISOString().split("T")[0];
        const expired = (expiredRes.data || [])
          .filter((l: any) => {
            const endDate = l.endDate || l.end_date;
            return typeof endDate === "string" && endDate < today;
          })
          .map((l: any) => ({
            id: l.id,
            end_date: l.endDate || l.end_date,
            number_of_users: l.numberOfUsers ?? l.number_of_users ?? 0,
            contact_full_name: l.contactFullName || l.contact_full_name || "",
            renewal_notify: l.renewalNotify ?? l.renewal_notify ?? false,
            accounts: l.account || l.accounts || null,
            enterprises: l.enterprise || l.enterprises || null,
            products: l.product || l.products || null,
          }));

        return [...expired, ...expiring];
      }

      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      const todayStr = today.toISOString().split("T")[0];
      const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

      // Fetch expired + expiring in next 30 days
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
        .lte("end_date", futureStr);

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

  // Split into expired vs expiring
  const todayStr = new Date().toISOString().split("T")[0];
  const expiredLicenses = allLicenses.filter((l) => l.end_date < todayStr);
  const expiringLicenses = allLicenses.filter((l) => l.end_date >= todayStr);
  const totalCount = allLicenses.length;

  const handleSendReminders = async () => {
    setIsSendingReminders(true);
    try {
      let result: { success: boolean; emailsSent?: number; logged?: number; error?: string };

      if (isExternalApi()) {
        const { data, error } = await httpClient.post<typeof result>("/licenses/send-reminders");
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

  const renderLicenseCard = (license: ExpiringLicense) => {
    const daysRemaining = getDaysRemaining(license.end_date);
    const isExpired = daysRemaining < 0;
    return (
      <div
        key={license.id}
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
          {isExpired ? (
            <XCircle className="w-5 h-5 text-destructive" />
          ) : (
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
          )}
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
                {isExpired
                  ? `Expired ${Math.abs(daysRemaining)} days ago`
                  : `${daysRemaining} days left`}
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
          <h3 className="font-semibold text-[#0f172a]">License Status</h3>
        </div>
        <div className="flex items-center gap-2">
          {totalCount > 0 && (
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
              {expiredLicenses.length > 0 && (
                <span className="px-2 py-0.5 bg-destructive/10 text-destructive text-xs font-medium rounded-full">
                  {expiredLicenses.length} expired
                </span>
              )}
              {expiringLicenses.length > 0 && (
                <span className="px-2 py-0.5 bg-warning/10 text-warning text-xs font-medium rounded-full">
                  {expiringLicenses.length} expiring
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6 text-success" />
            </div>
            <p className="text-sm font-medium text-[#0f172a]">All Clear!</p>
            <p className="text-xs text-[#64748b] mt-1">
              No expired or expiring licenses
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {/* Expired Section */}
            {expiredLicenses.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-xs font-semibold text-destructive uppercase tracking-wider">
                    Expired ({expiredLicenses.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {expiredLicenses.map(renderLicenseCard)}
                </div>
              </div>
            )}

            {/* Expiring Soon Section */}
            {expiringLicenses.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  <span className="text-xs font-semibold text-warning uppercase tracking-wider">
                    Expiring in 30 Days ({expiringLicenses.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {expiringLicenses.map(renderLicenseCard)}
                </div>
              </div>
            )}
          </div>
        )}

        {totalCount > 0 && (
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
