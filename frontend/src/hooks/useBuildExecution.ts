import { useState, useEffect, useRef, useCallback } from "react";
import { httpClient } from "@/lib/api/http-client";
import { API_CONFIG, isExternalApi } from "@/lib/api/config";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ExecutionStatus = "RUNNING" | "SUCCESS" | "FAILED" | "WAITING_APPROVAL";

export interface StageState {
  stageId: string;
  nodeId: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  message?: string;
}

export interface ExecutionLogsResponse {
  status: ExecutionStatus;
  stageStates: Record<string, any>;
  currentNode?: string;
  currentStage?: string;
  startTime: string;
  endTime?: string;
  logs: string[];
}

const POLL_INTERVAL_MS = 3000;

/**
 * Hook for managing build execution lifecycle.
 * 
 * Handles:
 * - Starting a pipeline execution
 * - Polling for logs every 3 seconds
 * - Stopping polling when execution completes
 * - Approving stages (for manual approval gates)
 * 
 * Falls back to Supabase-based simulation when not using external API.
 */
export function useBuildExecution() {
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [stageStates, setStageStates] = useState<Record<string, any>>({});
  const [currentNode, setCurrentNode] = useState<string | undefined>();
  const [currentStage, setCurrentStage] = useState<string | undefined>();
  const [isPolling, setIsPolling] = useState(false);
  const [pendingApprovalStage, setPendingApprovalStage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Poll logs from backend
  const pollLogs = useCallback(async (execId: string) => {
    if (!isExternalApi()) return; // Skip for Supabase mode

    try {
      const response = await httpClient.get<ExecutionLogsResponse>(
        `/executions/${execId}/logs`,
      );

      if (response.data) {
        setStatus(response.data.status);
        setLogs(response.data.logs);
        setStageStates(response.data.stageStates || {});
        setCurrentNode(response.data.currentNode);
        setCurrentStage(response.data.currentStage);

        if (response.data.status === "WAITING_APPROVAL") {
          setPendingApprovalStage(response.data.currentStage || null);
        }

        // Stop polling when execution is complete
        if (response.data.status !== "RUNNING") {
          stopPolling();
        }
      }
    } catch (error) {
      console.error("Failed to poll execution logs:", error);
    }
  }, [stopPolling]);

  // Start polling
  const startPolling = useCallback((execId: string) => {
    stopPolling();
    setIsPolling(true);

    // Initial fetch
    pollLogs(execId);

    // Set up interval
    pollRef.current = setInterval(() => {
      pollLogs(execId);
    }, POLL_INTERVAL_MS);
  }, [pollLogs, stopPolling]);

  // Run pipeline execution
  const runExecution = useCallback(async (
    pipelineId: string,
    buildJobId?: string,
    branch?: string,
    approverEmails?: string[],
  ): Promise<string | null> => {
    // Reset state
    setLogs([]);
    setStageStates({});
    setCurrentNode(undefined);
    setCurrentStage(undefined);
    setPendingApprovalStage(null);
    setStatus("RUNNING");

    if (isExternalApi()) {
      // --- External API (AWS Lambda) path ---
      try {
        const response = await httpClient.post<{ executionId: string }>(
          `/executions/run`,
          { pipelineId, buildJobId, branch, approverEmails },
        );

        if (response.data?.executionId) {
          const execId = response.data.executionId;
          setExecutionId(execId);
          startPolling(execId);
          return execId;
        }

        throw new Error("No executionId returned");
      } catch (error: any) {
        setStatus("FAILED");
        toast.error(`Execution failed: ${error.message}`);
        return null;
      }
    } else {
      // --- Supabase fallback (simulated execution) ---
      // This simulates execution locally for dev/demo
      const execId = crypto.randomUUID();
      setExecutionId(execId);

      // Create execution record in Supabase
      try {
        await (supabase.from("build_executions" as any).insert({
          id: execId,
          build_job_id: buildJobId || pipelineId,
          build_number: `#${String(Date.now()).slice(-4)}`,
          branch: branch || "main",
          status: "running",
        }) as any);
      } catch (e) {
        console.warn("Could not create Supabase execution record:", e);
      }

      return execId;
    }
  }, [startPolling]);

  // Approve a stage
  const approveStage = useCallback(async (stageId: string) => {
    if (!executionId) return;

    if (isExternalApi()) {
      try {
        await httpClient.post(
          `/executions/${executionId}/approve/${stageId}`,
          {},
        );

        setPendingApprovalStage(null);
        setStatus("RUNNING");
        startPolling(executionId);
        toast.success(`Stage ${stageId} approved`);
      } catch (error: any) {
        toast.error(`Approval failed: ${error.message}`);
      }
    } else {
      // Supabase fallback
      setPendingApprovalStage(null);
      setStatus("RUNNING");
      toast.success(`Stage ${stageId} approved (simulated)`);
    }
  }, [executionId, startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return {
    executionId,
    status,
    logs,
    stageStates,
    currentNode,
    currentStage,
    isPolling,
    pendingApprovalStage,
    runExecution,
    approveStage,
    stopPolling,
  };
}
