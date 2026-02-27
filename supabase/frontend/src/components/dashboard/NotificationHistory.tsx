import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  History,
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { useAccountContext } from "@/contexts/AccountContext";

interface NotificationHistoryEntry {
  id: string;
  license_id: string;
  recipient_email: string;
  recipient_name: string;
  notification_type: string;
  subject: string;
  days_until_expiry: number;
  status: string;
  error_message: string | null;
  sent_at: string;
  accounts: { name: string } | null;
}

export function NotificationHistory() {
  // Get selected account from context
  const { selectedAccount } = useAccountContext();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notification-history", selectedAccount?.id],
    queryFn: async () => {
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<any[]>("/notification-history", {
          params: {
            accountId: selectedAccount?.id,
            limit: 10,
          },
        });
        if (error) throw new Error(error.message);
        return (data || []).map((n: any) => ({
          id: n.id,
          license_id: n.licenseId ?? n.license_id,
          recipient_email: n.recipientEmail ?? n.recipient_email,
          recipient_name: n.recipientName ?? n.recipient_name,
          notification_type: n.notificationType ?? n.notification_type,
          subject: n.subject,
          days_until_expiry: n.daysUntilExpiry ?? n.days_until_expiry,
          status: n.status,
          error_message: n.errorMessage ?? n.error_message ?? null,
          sent_at: n.sentAt ?? n.sent_at,
          accounts: n.accounts ?? n.account ?? null,
        })) as NotificationHistoryEntry[];
      }

      let query = supabase
        .from("notification_history")
        .select(`
          id,
          license_id,
          recipient_email,
          recipient_name,
          notification_type,
          subject,
          days_until_expiry,
          status,
          error_message,
          sent_at,
          accounts (name)
        `);
      
      // Filter by selected account if available
      if (selectedAccount?.id) {
        query = query.eq("account_id", selectedAccount.id);
      }
      
      const { data, error } = await query
        .order("sent_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as NotificationHistoryEntry[];
    },
  });

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
            <Skeleton key={i} className="h-16 w-full" />
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
          <div className="p-1.5 rounded-lg bg-primary/10">
            <History className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-[#0f172a]">Notification History</h3>
        </div>
        {notifications.length > 0 && (
          <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium rounded-full">
            {notifications.length} recent
          </span>
        )}
      </div>

      <div className="p-4">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Mail className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-[#0f172a]">No Notifications Yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sent reminders will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[320px] overflow-y-auto">
            {notifications.map((notification) => {
              const isSent = notification.status === "sent";
              return (
                <div
                  key={notification.id}
                  className="flex gap-3 p-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]"
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      isSent ? "bg-success/10" : "bg-destructive/10"
                    )}
                  >
                    {isSent ? (
                      <CheckCircle className="w-4 h-4 text-success" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0f172a] truncate">
                          {notification.recipient_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {notification.recipient_email}
                        </p>
                      </div>
                      <Badge
                        variant={isSent ? "outline" : "destructive"}
                        className={cn(
                          "text-[10px] h-5 px-1.5 shrink-0",
                          isSent && "text-success border-success"
                        )}
                      >
                        {isSent ? "Sent" : "Failed"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {notification.accounts?.name}
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-warning font-medium">
                        {notification.days_until_expiry} days left
                      </span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(notification.sent_at), { addSuffix: true })}
                      </span>
                    </div>
                    {notification.error_message && (
                      <p className="text-xs text-destructive mt-1 truncate">
                        {notification.error_message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
