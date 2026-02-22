/**
 * Inbox API Service
 *
 * Provides inbox / notification CRUD operations
 * with automatic provider switching (Supabase ↔ NestJS/DynamoDB).
 */

import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";

export interface InboxNotification {
  notificationId: string;
  accountId: string;
  recipientEmail: string;
  recipientUserId?: string;
  senderEmail: string;
  senderUserId?: string;
  type: "APPROVAL_REQUEST" | "APPROVAL_GRANTED" | "APPROVAL_REJECTED" | "INFO";
  status: "PENDING" | "APPROVED" | "REJECTED" | "DISMISSED";
  title: string;
  message: string;
  context?: {
    executionId?: string;
    pipelineId?: string;
    buildJobId?: string;
    stageId?: string;
    stageName?: string;
    pipelineName?: string;
    buildNumber?: string;
    branch?: string;
  };
  createdAt: string;
  updatedAt: string;
  actionedAt?: string;
  actionedBy?: string;
}

export const inboxService = {
  /**
   * List all notifications for the current user.
   */
  async list(): Promise<InboxNotification[]> {
    if (!isExternalApi()) {
      // Supabase fallback — return empty for now
      return [];
    }

    try {
      const { data, error } = await httpClient.get<InboxNotification[]>("/inbox");
      if (error) throw new Error(error.message);
      return data || [];
    } catch (error: any) {
      console.error("Failed to fetch inbox:", error.message);
      return [];
    }
  },

  /**
   * Get count of pending notifications.
   */
  async getPendingCount(): Promise<number> {
    if (!isExternalApi()) return 0;

    try {
      const { data, error } = await httpClient.get<{ count: number }>("/inbox/count");
      if (error) return 0;
      return data?.count || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Approve an approval request.
   */
  async approve(notificationId: string): Promise<{ message: string; notification: InboxNotification }> {
    const { data, error } = await httpClient.post<{ message: string; notification: InboxNotification }>(
      `/inbox/${notificationId}/approve`,
      {},
    );
    if (error) throw new Error(error.message);
    return data!;
  },

  /**
   * Reject an approval request.
   */
  async reject(notificationId: string): Promise<{ message: string; notification: InboxNotification }> {
    const { data, error } = await httpClient.post<{ message: string; notification: InboxNotification }>(
      `/inbox/${notificationId}/reject`,
      {},
    );
    if (error) throw new Error(error.message);
    return data!;
  },

  /**
   * Dismiss a notification.
   */
  async dismiss(notificationId: string): Promise<void> {
    const { error } = await httpClient.post(`/inbox/${notificationId}/dismiss`, {});
    if (error) throw new Error(error.message);
  },
};
