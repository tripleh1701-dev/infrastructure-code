import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock dependencies before imports
vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { httpClient } from "@/lib/api/http-client";
import { toast } from "sonner";
import { useBuildExecution } from "../useBuildExecution";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedToastError = toast.error as ReturnType<typeof vi.fn>;
const mockedToastSuccess = toast.success as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Initial State ──────────────────────────────────────────────────────────

describe("useBuildExecution – initial state", () => {
  it("returns null/empty defaults", () => {
    const { result } = renderHook(() => useBuildExecution());

    expect(result.current.executionId).toBeNull();
    expect(result.current.status).toBeNull();
    expect(result.current.logs).toEqual([]);
    expect(result.current.stageStates).toEqual({});
    expect(result.current.currentNode).toBeUndefined();
    expect(result.current.currentStage).toBeUndefined();
    expect(result.current.isPolling).toBe(false);
    expect(result.current.pendingApprovalStage).toBeNull();
  });
});

// ─── runExecution ───────────────────────────────────────────────────────────

describe("useBuildExecution – runExecution", () => {
  it("starts execution and begins polling on success", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "exec-1" } });
    mockedGet.mockResolvedValue({
      data: { status: "RUNNING", logs: ["step 1"], stageStates: {}, startTime: "t0" },
    });

    const { result } = renderHook(() => useBuildExecution());

    let execId: string | null = null;
    await act(async () => {
      execId = await result.current.runExecution("pipe-1", "bj-1", "main", ["alice@test.com"]);
    });

    expect(execId).toBe("exec-1");
    expect(mockedPost).toHaveBeenCalledWith("/executions/run", {
      pipelineId: "pipe-1",
      buildJobId: "bj-1",
      branch: "main",
      approverEmails: ["alice@test.com"],
    });
    expect(result.current.executionId).toBe("exec-1");
    expect(result.current.isPolling).toBe(true);
  });

  it("sets FAILED status and toasts on network error", async () => {
    mockedPost.mockRejectedValue(new Error("Network down"));

    const { result } = renderHook(() => useBuildExecution());

    let execId: string | null = null;
    await act(async () => {
      execId = await result.current.runExecution("pipe-1");
    });

    expect(execId).toBeNull();
    expect(result.current.status).toBe("FAILED");
    expect(mockedToastError).toHaveBeenCalledWith("Execution failed: Network down");
  });

  it("sets FAILED when response has no executionId", async () => {
    mockedPost.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useBuildExecution());

    let execId: string | null = null;
    await act(async () => {
      execId = await result.current.runExecution("pipe-1");
    });

    expect(execId).toBeNull();
    expect(result.current.status).toBe("FAILED");
    expect(mockedToastError).toHaveBeenCalled();
  });

  it("resets state before each new execution", async () => {
    // First execution fails
    mockedPost.mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });
    expect(result.current.status).toBe("FAILED");

    // Second execution succeeds – state should be reset
    mockedPost.mockResolvedValueOnce({ data: { executionId: "exec-2" } });
    mockedGet.mockResolvedValue({
      data: { status: "RUNNING", logs: [], stageStates: {}, startTime: "t0" },
    });

    await act(async () => {
      await result.current.runExecution("pipe-2");
    });

    expect(result.current.executionId).toBe("exec-2");
    expect(result.current.logs).toEqual([]);
  });
});

// ─── Polling ────────────────────────────────────────────────────────────────

describe("useBuildExecution – polling", () => {
  it("polls logs at 3-second intervals", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "exec-1" } });
    mockedGet.mockResolvedValue({
      data: {
        status: "RUNNING",
        logs: ["log-1"],
        stageStates: { s1: { status: "running" } },
        currentNode: "node-1",
        currentStage: "stage-1",
        startTime: "t0",
      },
    });

    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });

    // Initial poll happens immediately
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(mockedGet).toHaveBeenCalledWith("/executions/exec-1/logs");

    // Advance 3s – second poll
    mockedGet.mockResolvedValueOnce({
      data: { status: "RUNNING", logs: ["log-1", "log-2"], stageStates: {}, startTime: "t0" },
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(result.current.logs).toContain("log-2");
  });

  it("stops polling when status is SUCCESS", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "exec-1" } });
    mockedGet.mockResolvedValueOnce({
      data: { status: "RUNNING", logs: [], stageStates: {}, startTime: "t0" },
    });

    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });

    expect(result.current.isPolling).toBe(true);

    // Next poll returns SUCCESS
    mockedGet.mockResolvedValueOnce({
      data: { status: "SUCCESS", logs: ["done"], stageStates: {}, startTime: "t0", endTime: "t1" },
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.status).toBe("SUCCESS");
    expect(result.current.isPolling).toBe(false);

    // No more polls after completion
    const callCount = mockedGet.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(mockedGet).toHaveBeenCalledTimes(callCount);
  });

  it("stops polling when status is FAILED", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "exec-1" } });
    mockedGet
      .mockResolvedValueOnce({
        data: { status: "RUNNING", logs: [], stageStates: {}, startTime: "t0" },
      })
      .mockResolvedValueOnce({
        data: { status: "FAILED", logs: ["error occurred"], stageStates: {}, startTime: "t0" },
      });

    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.status).toBe("FAILED");
    expect(result.current.isPolling).toBe(false);
  });

  it("continues polling on transient poll errors", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "exec-1" } });
    // First poll succeeds, second errors, third succeeds
    mockedGet
      .mockResolvedValueOnce({
        data: { status: "RUNNING", logs: ["a"], stageStates: {}, startTime: "t0" },
      })
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({
        data: { status: "RUNNING", logs: ["a", "b"], stageStates: {}, startTime: "t0" },
      });

    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });

    // Transient error – polling should continue
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.isPolling).toBe(true);

    // Recovers on next tick
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.logs).toContain("b");
  });

  it("stopPolling manually cancels interval", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "exec-1" } });
    mockedGet.mockResolvedValue({
      data: { status: "RUNNING", logs: [], stageStates: {}, startTime: "t0" },
    });

    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });
    expect(result.current.isPolling).toBe(true);

    act(() => {
      result.current.stopPolling();
    });

    expect(result.current.isPolling).toBe(false);

    const callCount = mockedGet.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    expect(mockedGet).toHaveBeenCalledTimes(callCount);
  });
});

// ─── Approval Gates ─────────────────────────────────────────────────────────

describe("useBuildExecution – approval gates", () => {
  it("detects WAITING_APPROVAL and sets pendingApprovalStage", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "exec-1" } });
    mockedGet.mockResolvedValueOnce({
      data: {
        status: "WAITING_APPROVAL",
        logs: ["awaiting approval"],
        stageStates: {},
        currentNode: "node-1",
        currentStage: "approval-stage",
        startTime: "t0",
      },
    });

    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });

    expect(result.current.status).toBe("WAITING_APPROVAL");
    expect(result.current.pendingApprovalStage).toBe("approval-stage");
    // WAITING_APPROVAL is not RUNNING, so polling stops
    expect(result.current.isPolling).toBe(false);
  });

  it("approveStage posts to API and resumes polling", async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { executionId: "exec-1" } }) // run
      .mockResolvedValueOnce({ data: { message: "Approved" } }); // approve

    mockedGet
      .mockResolvedValueOnce({
        data: {
          status: "WAITING_APPROVAL",
          logs: [],
          stageStates: {},
          currentStage: "stage-2",
          startTime: "t0",
        },
      })
      .mockResolvedValueOnce({
        data: { status: "RUNNING", logs: ["resumed"], stageStates: {}, startTime: "t0" },
      });

    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });

    expect(result.current.pendingApprovalStage).toBe("stage-2");

    await act(async () => {
      await result.current.approveStage("stage-2");
    });

    expect(mockedPost).toHaveBeenCalledWith("/executions/exec-1/approve/stage-2", {});
    expect(result.current.pendingApprovalStage).toBeNull();
    expect(result.current.status).toBe("RUNNING");
    expect(mockedToastSuccess).toHaveBeenCalledWith("Stage stage-2 approved");
    expect(result.current.isPolling).toBe(true);
  });

  it("approveStage shows error toast on failure", async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { executionId: "exec-1" } })
      .mockRejectedValueOnce(new Error("Unauthorized"));

    mockedGet.mockResolvedValueOnce({
      data: {
        status: "WAITING_APPROVAL",
        logs: [],
        stageStates: {},
        currentStage: "stage-2",
        startTime: "t0",
      },
    });

    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });

    await act(async () => {
      await result.current.approveStage("stage-2");
    });

    expect(mockedToastError).toHaveBeenCalledWith("Approval failed: Unauthorized");
  });

  it("approveStage is a no-op when executionId is null", async () => {
    const { result } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.approveStage("stage-1");
    });

    expect(mockedPost).not.toHaveBeenCalled();
  });
});

// ─── Cleanup ────────────────────────────────────────────────────────────────

describe("useBuildExecution – cleanup", () => {
  it("stops polling on unmount", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "exec-1" } });
    mockedGet.mockResolvedValue({
      data: { status: "RUNNING", logs: [], stageStates: {}, startTime: "t0" },
    });

    const { result, unmount } = renderHook(() => useBuildExecution());

    await act(async () => {
      await result.current.runExecution("pipe-1");
    });

    expect(result.current.isPolling).toBe(true);

    const callCount = mockedGet.mock.calls.length;
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(9000);
    });

    // No additional calls after unmount
    expect(mockedGet).toHaveBeenCalledTimes(callCount);
  });
});
