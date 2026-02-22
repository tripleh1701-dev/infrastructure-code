import { describe, it, expect, vi, beforeEach } from "vitest";

// Force external API mode
vi.mock("@/lib/api/config", () => ({ isExternalApi: () => true }));

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

import { httpClient } from "@/lib/api/http-client";
import { buildsService } from "../builds.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedPut = httpClient.put as ReturnType<typeof vi.fn>;
const mockedDelete = httpClient.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── mapApiToBuildJob ────────────────────────────────────────────────────────

describe("buildsService.mapApiToBuildJob", () => {
  it("maps camelCase API response to snake_case BuildJob", () => {
    const apiItem = {
      id: "j1",
      accountId: "a1",
      enterpriseId: "e1",
      connectorName: "Jenkins",
      description: "CI job",
      entity: "backend",
      pipeline: "main-pipe",
      product: "DevOps",
      service: "Integration",
      status: "ACTIVE",
      scope: "full",
      connectorIconName: "jenkins-icon",
      pipelineStagesState: { build: "ok" },
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
    };

    const result = buildsService.mapApiToBuildJob(apiItem);

    expect(result).toEqual({
      id: "j1",
      account_id: "a1",
      enterprise_id: "e1",
      connector_name: "Jenkins",
      description: "CI job",
      entity: "backend",
      pipeline: "main-pipe",
      product: "DevOps",
      service: "Integration",
      status: "ACTIVE",
      scope: "full",
      connector_icon_name: "jenkins-icon",
      pipeline_stages_state: { build: "ok" },
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-02T00:00:00Z",
    });
  });

  it("falls back to snake_case keys when camelCase absent", () => {
    const item = {
      id: "j2",
      account_id: "a2",
      enterprise_id: "e2",
      connector_name: "GitHub",
      connector_icon_name: "gh-icon",
      pipeline_stages_state: null,
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    };

    const result = buildsService.mapApiToBuildJob(item);
    expect(result.account_id).toBe("a2");
    expect(result.connector_name).toBe("GitHub");
    expect(result.connector_icon_name).toBe("gh-icon");
  });

  it("defaults missing optional fields to null/empty", () => {
    const result = buildsService.mapApiToBuildJob({ id: "j3" });

    expect(result.description).toBeNull();
    expect(result.entity).toBeNull();
    expect(result.pipeline).toBeNull();
    expect(result.scope).toBeNull();
    expect(result.connector_icon_name).toBeNull();
    expect(result.pipeline_stages_state).toBeNull();
    expect(result.product).toBe("");
    expect(result.service).toBe("");
    expect(result.status).toBe("");
    expect(result.connector_name).toBe("");
  });
});

// ─── getBuildJobs ────────────────────────────────────────────────────────────

describe("buildsService.getBuildJobs", () => {
  it("fetches and maps build jobs", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { id: "j1", accountId: "a1", enterpriseId: "e1", connectorName: "Jenkins", product: "DevOps", service: "CI", status: "ACTIVE", createdAt: "2025-01-01", updatedAt: "2025-01-01" },
      ],
      error: null,
    });

    const result = await buildsService.getBuildJobs("a1", "e1");

    expect(mockedGet).toHaveBeenCalledWith("/builds/jobs", { params: { accountId: "a1", enterpriseId: "e1" } });
    expect(result).toHaveLength(1);
    expect(result[0].connector_name).toBe("Jenkins");
    expect(result[0].account_id).toBe("a1");
  });

  it("returns empty array when API returns null data", async () => {
    mockedGet.mockResolvedValue({ data: null, error: null });
    const result = await buildsService.getBuildJobs("a1", "e1");
    expect(result).toEqual([]);
  });

  it("throws on API error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "Forbidden" } });
    await expect(buildsService.getBuildJobs("a1", "e1")).rejects.toThrow("Forbidden");
  });
});

// ─── createBuildJob ──────────────────────────────────────────────────────────

describe("buildsService.createBuildJob", () => {
  it("posts camelCase payload and maps response", async () => {
    const apiResponse = {
      id: "j-new",
      accountId: "a1",
      enterpriseId: "e1",
      connectorName: "GitLab",
      product: "DevOps",
      service: "Integration",
      status: "ACTIVE",
      createdAt: "2025-01-01",
      updatedAt: "2025-01-01",
    };
    mockedPost.mockResolvedValue({ data: apiResponse, error: null });

    const result = await buildsService.createBuildJob("a1", "e1", {
      connector_name: "GitLab",
      description: "test desc",
      product: "DevOps",
      connector_icon_name: "gitlab-icon",
    });

    expect(mockedPost).toHaveBeenCalledWith("/builds/jobs", expect.objectContaining({
      accountId: "a1",
      enterpriseId: "e1",
      connectorName: "GitLab",
      description: "test desc",
      connectorIconName: "gitlab-icon",
    }));
    expect(result.connector_name).toBe("GitLab");
    expect(result.id).toBe("j-new");
  });

  it("uses defaults for optional fields", async () => {
    mockedPost.mockResolvedValue({ data: { id: "j2" }, error: null });

    await buildsService.createBuildJob("a1", "e1", { connector_name: "X" });

    const payload = mockedPost.mock.calls[0][1];
    expect(payload.product).toBe("DevOps");
    expect(payload.service).toBe("Integration");
    expect(payload.status).toBe("ACTIVE");
    expect(payload.description).toBeUndefined();
  });

  it("throws on API error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "Bad Request" } });
    await expect(buildsService.createBuildJob("a1", "e1", { connector_name: "X" })).rejects.toThrow("Bad Request");
  });
});

// ─── updateBuildJob ──────────────────────────────────────────────────────────

describe("buildsService.updateBuildJob", () => {
  it("converts snake_case updates to camelCase for API", async () => {
    mockedPut.mockResolvedValue({
      data: { id: "j1", connectorName: "Updated", product: "DevOps", service: "CI", status: "ACTIVE", createdAt: "2025-01-01", updatedAt: "2025-01-02" },
      error: null,
    });

    const result = await buildsService.updateBuildJob("j1", {
      connector_name: "Updated",
      pipeline_stages_state: { deploy: "done" },
    });

    const payload = mockedPut.mock.calls[0][1];
    expect(payload.connectorName).toBe("Updated");
    expect(payload.pipelineStagesState).toEqual({ deploy: "done" });
    expect(result.connector_name).toBe("Updated");
  });

  it("throws on API error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "Not Found" } });
    await expect(buildsService.updateBuildJob("j1", { status: "INACTIVE" })).rejects.toThrow("Not Found");
  });
});

// ─── deleteBuildJob ──────────────────────────────────────────────────────────

describe("buildsService.deleteBuildJob", () => {
  it("calls delete endpoint", async () => {
    mockedDelete.mockResolvedValue({ error: null });
    await buildsService.deleteBuildJob("j1");
    expect(mockedDelete).toHaveBeenCalledWith("/builds/jobs/j1");
  });

  it("throws on API error", async () => {
    mockedDelete.mockResolvedValue({ error: { message: "Server Error" } });
    await expect(buildsService.deleteBuildJob("j1")).rejects.toThrow("Server Error");
  });
});

// ─── getExecutions ───────────────────────────────────────────────────────────

describe("buildsService.getExecutions", () => {
  it("fetches executions for a build job", async () => {
    mockedGet.mockResolvedValue({
      data: [
        { id: "e1", buildJobId: "j1", buildNumber: "#42", branch: "main", status: "success", timestamp: "2025-01-01" },
      ],
      error: null,
    });

    const result = await buildsService.getExecutions("j1");

    expect(mockedGet).toHaveBeenCalledWith("/builds/jobs/j1/executions");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });

  it("returns empty array on null data", async () => {
    mockedGet.mockResolvedValue({ data: null, error: null });
    expect(await buildsService.getExecutions("j1")).toEqual([]);
  });

  it("throws on error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "err" } });
    await expect(buildsService.getExecutions("j1")).rejects.toThrow("err");
  });
});

// ─── createExecution ─────────────────────────────────────────────────────────

describe("buildsService.createExecution", () => {
  it("posts execution with camelCase keys", async () => {
    const resp = { id: "ex1", buildJobId: "j1", buildNumber: "#1", branch: "main", status: "running" };
    mockedPost.mockResolvedValue({ data: resp, error: null });

    const result = await buildsService.createExecution({
      build_job_id: "j1",
      build_number: "#1",
      branch: "develop",
      jira_number: "PROJ-123",
      approvers: ["alice"],
    });

    expect(mockedPost).toHaveBeenCalledWith("/builds/jobs/j1/executions", {
      buildNumber: "#1",
      branch: "develop",
      jiraNumber: "PROJ-123",
      approvers: ["alice"],
    });
    expect(result.id).toBe("ex1");
  });

  it("uses defaults for optional fields", async () => {
    mockedPost.mockResolvedValue({ data: { id: "ex2" }, error: null });
    await buildsService.createExecution({ build_job_id: "j1", build_number: "#2" });

    const payload = mockedPost.mock.calls[0][1];
    expect(payload.branch).toBe("main");
    expect(payload.jiraNumber).toBeNull();
    expect(payload.approvers).toBeNull();
  });

  it("throws on error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "fail" } });
    await expect(buildsService.createExecution({ build_job_id: "j1", build_number: "#1" })).rejects.toThrow("fail");
  });
});

// ─── updateExecution ─────────────────────────────────────────────────────────

describe("buildsService.updateExecution", () => {
  it("sends updates to correct endpoint", async () => {
    const resp = { id: "ex1", status: "success", duration: "2m" };
    mockedPut.mockResolvedValue({ data: resp, error: null });

    const result = await buildsService.updateExecution("ex1", {
      build_job_id: "j1",
      status: "success",
      duration: "2m",
    } as any);

    expect(mockedPut).toHaveBeenCalledWith(
      "/builds/jobs/j1/executions/ex1",
      expect.objectContaining({ status: "success", duration: "2m" })
    );
    expect(result.status).toBe("success");
  });

  it("falls back to 'unknown' when build_job_id missing", async () => {
    mockedPut.mockResolvedValue({ data: { id: "ex1" }, error: null });
    await buildsService.updateExecution("ex1", { status: "failed" } as any);

    expect(mockedPut.mock.calls[0][0]).toBe("/builds/jobs/unknown/executions/ex1");
  });

  it("throws on error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(buildsService.updateExecution("ex1", {} as any)).rejects.toThrow("nope");
  });
});
