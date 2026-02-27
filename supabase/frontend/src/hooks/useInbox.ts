import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { inboxService, type InboxNotification } from "@/lib/api/services/inbox.service";

export type { InboxNotification };

export function useInbox() {
  const queryClient = useQueryClient();

  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => inboxService.list(),
    refetchInterval: 15000, // Poll every 15s
  });

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["inbox-count"],
    queryFn: () => inboxService.getPendingCount(),
    refetchInterval: 30000, // Poll every 30s
  });

  const approveMutation = useMutation({
    mutationFn: async (notification: InboxNotification) => {
      // Backend controller handles both inbox approval AND execution stage approval atomically
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
    mutationFn: async (notification: InboxNotification) => {
      return inboxService.reject(notification.notificationId);
    },
    onSuccess: () => {
      toast.success("Request rejected");
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
