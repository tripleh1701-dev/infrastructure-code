import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inboxService, type InboxNotification } from "@/lib/api/services/inbox.service";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { useAuth } from "@/contexts/AuthContext";

export type { InboxNotification };

/**
 * Send rejection email via Supabase edge function (Supabase mode only).
 * In AWS mode, the backend handles this server-side in the reject endpoint.
 */
async function sendRejectionEmailViaSupabase(notification: InboxNotification, rejectorEmail: string, reason?: string) {
  try {
    const { error } = await supabase.functions.invoke("send-rejection-email", {
      body: {
        recipientEmail: notification.senderEmail,
        recipientName: notification.senderUserId || notification.senderEmail.split("@")[0],
        rejectedByEmail: rejectorEmail,
        rejectedByName: rejectorEmail.split("@")[0],
        pipelineName: notification.context?.pipelineName,
        stageName: notification.context?.stageName,
        buildNumber: notification.context?.buildNumber,
        branch: notification.context?.branch,
        buildJobName: notification.title?.replace("Approval Required: ", ""),
        rejectionReason: reason,
      },
    });
    if (error) {
      console.error("Failed to send rejection email:", error);
    }
  } catch (err) {
    console.error("Rejection email error:", err);
  }
}

export function useInbox() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => inboxService.list(),
    refetchInterval: 15000,
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["inbox-count"],
    queryFn: () => inboxService.getPendingCount(),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (notification: InboxNotification) => {
      return inboxService.approve(notification.notificationId);
    },
    onSuccess: () => {
      toast.success("Approval granted successfully");
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-count"] });
    },
    onError: (err: Error) => toast.error("Failed to approve: " + err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ notification, reason }: { notification: InboxNotification; reason?: string }) => {
      const result = await inboxService.reject(notification.notificationId, reason);
      // In Supabase mode, send rejection email via edge function (fire-and-forget).
      // In AWS mode, the backend reject endpoint handles this server-side.
      if (!isExternalApi()) {
        const rejectorEmail = user?.email || notification.recipientEmail;
        sendRejectionEmailViaSupabase(notification, rejectorEmail, reason);
      }
      return result;
    },
    onSuccess: () => {
      toast.success("Request rejected — notification email sent to requester");
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-count"] });
    },
    onError: (err: Error) => toast.error("Failed to reject: " + err.message),
  });

  const dismissMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return inboxService.dismiss(notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-count"] });
    },
  });

  const pendingNotifications = notifications.filter((n) => n.status === "PENDING");
  const actionedNotifications = notifications.filter((n) => n.status !== "PENDING");

  return {
    notifications,
    pendingNotifications,
    actionedNotifications,
    pendingCount,
    isLoading,
    refetch,
    approve: approveMutation,
    reject: rejectMutation,
    dismiss: dismissMutation,
  };
}
