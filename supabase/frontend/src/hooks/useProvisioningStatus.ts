import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { provisioningService, type ProvisioningJob } from "@/lib/api";

export type { ProvisioningJob };
export type ProvisioningStatus = ProvisioningJob['status'];

export interface ProvisioningEvent {
  id: string;
  accountId: string;
  accountName: string;
  cloudType: "public" | "private";
  status: ProvisioningStatus;
  message: string;
  stackId?: string;
  stackName?: string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  progress: number;
  resources?: ProvisioningJob['resources'];
}

const POLL_INTERVAL = 2000; // Poll every 2 seconds

// Persistent store that survives re-renders
const provisioningStore = new Map<string, ProvisioningEvent>();
const storeListeners = new Set<() => void>();

function notifyStoreListeners() {
  storeListeners.forEach((listener) => listener());
}

export function useProvisioningStatus() {
  const [events, setEvents] = useState<ProvisioningEvent[]>(() => 
    Array.from(provisioningStore.values())
  );
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeAccountIds = useRef<Set<string>>(new Set());

  // Subscribe to store updates
  useEffect(() => {
    const updateFromStore = () => {
      setEvents(Array.from(provisioningStore.values()));
    };
    
    storeListeners.add(updateFromStore);
    return () => {
      storeListeners.delete(updateFromStore);
    };
  }, []);

  // Poll for status updates
  const pollStatuses = useCallback(async () => {
    if (activeAccountIds.current.size === 0) {
      setIsPolling(false);
      return;
    }

    const completedIds: string[] = [];

    for (const accountId of activeAccountIds.current) {
      try {
        const { data: job, error } = await provisioningService.getProvisioningStatus(accountId);
        
        if (error) {
          console.error(`[Provisioning] Error fetching status for ${accountId}:`, error.message);
          continue;
        }

        if (!job) continue;

        const existingEvent = provisioningStore.get(accountId);
        const wasActive = existingEvent && (existingEvent.status === 'pending' || existingEvent.status === 'in_progress');
        const isNowComplete = job.status === 'completed' || job.status === 'failed';

        // Update the store
        const event: ProvisioningEvent = {
          id: job.id,
          accountId: job.accountId,
          accountName: job.accountName,
          cloudType: job.cloudType,
          status: job.status,
          message: job.message,
          stackId: job.stackId,
          stackName: job.stackName,
          startedAt: new Date(job.startedAt),
          completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
          error: job.error,
          progress: job.progress,
          resources: job.resources,
        };

        provisioningStore.set(accountId, event);

        // Show completion toast
        if (wasActive && isNowComplete) {
          completedIds.push(accountId);

          if (job.status === 'completed') {
            toast.success(`${job.cloudType === 'private' ? 'Dedicated' : 'Shared'} infrastructure for "${job.accountName}" is now active.`);
          } else {
            toast.error(`Failed to provision infrastructure for "${job.accountName}". ${job.error || 'Please contact support.'}`);
          }
        }
      } catch (err) {
        console.error(`[Provisioning] Unexpected error polling ${accountId}:`, err);
      }
    }

    // Remove completed jobs from active polling (after delay)
    completedIds.forEach((id) => {
      setTimeout(() => {
        activeAccountIds.current.delete(id);
        if (activeAccountIds.current.size === 0) {
          setIsPolling(false);
        }
      }, 5000);
    });

    notifyStoreListeners();
  }, []);

  // Start/stop polling based on active jobs
  useEffect(() => {
    if (isPolling && activeAccountIds.current.size > 0) {
      pollStatuses(); // Initial poll
      pollIntervalRef.current = setInterval(pollStatuses, POLL_INTERVAL);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isPolling, pollStatuses]);

  const startProvisioning = useCallback(async (
    accountId: string,
    accountName: string,
    cloudType: "public" | "private"
  ) => {
    try {
      const { data: job, error } = await provisioningService.startProvisioning({
        accountId,
        accountName,
        cloudType,
      });

      if (error) {
        toast.error(`Failed to start provisioning: ${error.message}`);
        return;
      }

      if (!job) return;

      const event: ProvisioningEvent = {
        id: job.id,
        accountId: job.accountId,
        accountName: job.accountName,
        cloudType: job.cloudType,
        status: job.status,
        message: job.message,
        stackId: job.stackId,
        stackName: job.stackName,
        startedAt: new Date(job.startedAt),
        progress: job.progress,
        resources: job.resources,
      };

      provisioningStore.set(accountId, event);
      activeAccountIds.current.add(accountId);
      setIsPolling(true);
      notifyStoreListeners();

      toast.info(`Setting up ${cloudType} cloud infrastructure for "${accountName}"...`);

      return event;
    } catch (err) {
      console.error("[Provisioning] Failed to start:", err);
      toast.error("Failed to start infrastructure provisioning.");
    }
  }, []);

  const clearEvent = useCallback(async (accountId: string) => {
    try {
      await provisioningService.deprovision(accountId);
    } catch (err) {
      console.error("[Provisioning] Error clearing event:", err);
    }

    activeAccountIds.current.delete(accountId);
    provisioningStore.delete(accountId);
    notifyStoreListeners();
  }, []);

  const getEventForAccount = useCallback((accountId: string) => {
    return provisioningStore.get(accountId);
  }, []);

  const activeEvents = events.filter((e) => e.status === "in_progress" || e.status === "pending");
  const recentCompletedEvents = events.filter(
    (e) => (e.status === "completed" || e.status === "failed") && 
           e.completedAt && 
           Date.now() - e.completedAt.getTime() < 60000
  );

  return {
    events,
    activeEvents,
    recentCompletedEvents,
    isPolling,
    startProvisioning,
    clearEvent,
    getEventForAccount,
  };
}
