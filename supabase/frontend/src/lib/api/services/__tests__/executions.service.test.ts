import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/config", () => ({ isExternalApi: () => true }));

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { httpClient } from "@/lib/api/http-client";
import { executionsService } from "../executions.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── run ─────────────────────────────────────────────────────────────────────

describe("executionsService.run", () => {
  it("posts execution run with all params", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "ex-1" } });

    const result = await executionsService.run("p1", "b1", "develop", ["alice@test.com"]);

    expect(mockedPost).toHaveBeenCalledWith("/executions/run", {
      pipelineId: "p1",
      buildJobId: "b1",
      branch: "develop",
      approverEmails: ["alice@test.com"],
    });
    expect(result.data).toEqual({ executionId: "ex-1" });
    expect(result.error).toBeNull();
  });

  it("posts with optional params undefined", async () => {
    mockedPost.mockResolvedValue({ data: { executionId: "ex-2" } });

    const result = await executionsService.run("p1");

    expect(mockedPost).toHaveBeenCalledWith("/executions/run", {
      pipelineId: "p1",
      buildJobId: undefined,
      branch: undefined,
      approverEmails: undefined,
    });
    expect(result.data?.executionId).toBe("ex-2");
  });

  it("returns error on failure", async () => {
    mockedPost.mockRejectedValue(new Error("Network error"));

    const result = await executionsService.run("p1");

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Network error");
  });
});

// ─── getLogs ─────────────────────────────────────────────────────────────────

describe("executionsService.getLogs", () => {
  it("fetches logs for an execution", async () => {
    const logs = { lines: ["step 1", "step 2"] };
    mockedGet.mockResolvedValue({ data: logs });

    const result = await executionsService.getLogs("ex-1");

    expect(mockedGet).toHaveBeenCalledWith("/executions/ex-1/logs");
    expect(result.data).toEqual(logs);
    expect(result.error).toBeNull();
  });

  it("returns error on failure", async () => {
    mockedGet.mockRejectedValue(new Error("Not found"));

    const result = await executionsService.getLogs("ex-bad");

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Not found");
  });
});

// ─── listForPipeline ─────────────────────────────────────────────────────────

describe("executionsService.listForPipeline", () => {
  it("lists executions for a pipeline", async () => {
    const items = [
      { executionId: "ex-1", pipelineId: "p1", status: "running", startTime: "2025-01-01" },
    ];
    mockedGet.mockResolvedValue({ data: items });

    const result = await executionsService.listForPipeline("p1");

    expect(mockedGet).toHaveBeenCalledWith("/executions/pipeline/p1");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].executionId).toBe("ex-1");
  });

  it("returns empty array when data is null", async () => {
    mockedGet.mockResolvedValue({ data: null });

    const result = await executionsService.listForPipeline("p1");
    expect(result.data).toEqual([]);
  });

  it("returns empty array with error on failure", async () => {
    mockedGet.mockRejectedValue(new Error("timeout"));

    const result = await executionsService.listForPipeline("p1");
    expect(result.data).toEqual([]);
    expect(result.error?.message).toBe("timeout");
  });
});

// ─── approveStage ────────────────────────────────────────────────────────────

describe("executionsService.approveStage", () => {
  it("approves a stage", async () => {
    mockedPost.mockResolvedValue({ data: { message: "Approved" } });

    const result = await executionsService.approveStage("ex-1", "stage-1");

    expect(mockedPost).toHaveBeenCalledWith("/executions/ex-1/approve/stage-1", {});
    expect(result.data?.message).toBe("Approved");
  });

  it("returns error on failure", async () => {
    mockedPost.mockRejectedValue(new Error("Unauthorized"));

    const result = await executionsService.approveStage("ex-1", "stage-1");

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Unauthorized");
  });
});
