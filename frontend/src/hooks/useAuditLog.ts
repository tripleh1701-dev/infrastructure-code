import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountContext } from "@/contexts/AccountContext";

export type AuditAction =
  | "user.created"
  | "user.updated"
  | "user.role_changed"
  | "user.group_changed"
  | "group.created"
  | "group.updated"
  | "group.deleted"
  | "role.created"
  | "role.updated"
  | "role.deleted"
  | "role.permissions_updated";

export type AuditEntityType = "user" | "group" | "role" | "permission";

interface AuditLogEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  entityName?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: Record<string, unknown>;
}

export function useAuditLog() {
  const { user } = useAuth();
  const { selectedAccount } = useAccountContext();

  const logAudit = useCallback(
    async (entry: AuditLogEntry) => {
      const accountId = selectedAccount?.id;
      if (!accountId) return;

      try {
        // Use raw REST insert to avoid type generation dependency
        const { error } = await (supabase as any).from("audit_logs").insert({
          action: entry.action,
          entity_type: entry.entityType,
          entity_id: entry.entityId || null,
          entity_name: entry.entityName || null,
          target_user_id: entry.targetUserId || null,
          target_user_email: entry.targetUserEmail || null,
          changed_by_user_id: user?.sub || null,
          changed_by_email: user?.email || null,
          old_value: entry.oldValue || null,
          new_value: entry.newValue || null,
          metadata: entry.metadata || {},
          account_id: accountId,
        });

        if (error) {
          console.warn("Failed to write audit log:", error);
        }
      } catch (err) {
        // Audit logging should never block the main operation
        console.warn("Failed to write audit log:", err);
      }
    },
    [user, selectedAccount]
  );

  return { logAudit };
}
