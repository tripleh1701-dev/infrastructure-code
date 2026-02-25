import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useBuilds } from "../useBuilds";

// Mock contexts
vi.mock("@/contexts/AccountContext", () => ({
  useAccountContext: () => ({ selectedAccount: { id: "acc-1", name: "Test Account" } }),
}));

vi.mock("@/contexts/EnterpriseContext", () => ({
  useEnterpriseContext: () => ({ selectedEnterprise: { id: "ent-1", name: "Test Enterprise" } }),
}));

// Mock the builds service
vi.mock("@/lib/api/services/builds.service", () => ({
  buildsService: {
    getBuildJobs: vi.fn(),
    createBuildJob: vi.fn(),
    updateBuildJob: vi.fn(),
    deleteBuildJob: vi.fn(),
    getExecutions: vi.fn(),
    createExecution: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { buildsService } from "@/lib/api/services/builds.service";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mockBuildJob = {
  id: "bj-1",
  account_id: "acc-1",
  enterprise_id: "ent-1",
  connector_name: "Jenkins",
  description: "CI pipeline",
  entity: null,
  pipeline: "pipe-1",
  product: "DevOps",
  service: "Integration",
  status: "ACTIVE",
  scope: null,
  connector_icon_name: "jenkins",
  pipeline_stages_state: null,
  yaml_content: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
};

describe("useBuilds (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches build jobs for the current context", async () => {
    vi.mocked(buildsService.getBuildJobs).mockResolvedValue([mockBuildJob]);

    const { result } = renderHook(() => useBuilds(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(buildsService.getBuildJobs).toHaveBeenCalledWith("acc-1", "ent-1");
    expect(result.current.buildJobs).toHaveLength(1);
    expect(result.current.buildJobs[0].connector_name).toBe("Jenkins");
  });

  it("creates a build job", async () => {
    vi.mocked(buildsService.getBuildJobs).mockResolvedValue([]);
    vi.mocked(buildsService.createBuildJob).mockResolvedValue(mockBuildJob);

    const { result } = renderHook(() => useBuilds(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createBuildJob.mutateAsync({
        connector_name: "Jenkins",
        pipeline: "pipe-1",
      });
    });

    expect(buildsService.createBuildJob).toHaveBeenCalledWith("acc-1", "ent-1", {
      connector_name: "Jenkins",
      pipeline: "pipe-1",
    });
  });

  it("updates a build job", async () => {
    vi.mocked(buildsService.getBuildJobs).mockResolvedValue([mockBuildJob]);
    vi.mocked(buildsService.updateBuildJob).mockResolvedValue({ ...mockBuildJob, status: "INACTIVE" });

    const { result } = renderHook(() => useBuilds(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateBuildJob.mutateAsync({ id: "bj-1", status: "INACTIVE" });
    });

    expect(buildsService.updateBuildJob).toHaveBeenCalledWith("bj-1", { status: "INACTIVE" });
  });

  it("deletes a build job", async () => {
    vi.mocked(buildsService.getBuildJobs).mockResolvedValue([]);
    vi.mocked(buildsService.deleteBuildJob).mockResolvedValue(undefined);

    const { result } = renderHook(() => useBuilds(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteBuildJob.mutateAsync("bj-1");
    });

    expect(buildsService.deleteBuildJob).toHaveBeenCalledWith("bj-1");
  });

  it("fetches executions for a build job", async () => {
    vi.mocked(buildsService.getBuildJobs).mockResolvedValue([]);
    vi.mocked(buildsService.getExecutions).mockResolvedValue([
      {
        id: "exec-1",
        build_job_id: "bj-1",
        build_number: "42",
        branch: "main",
        status: "success",
        duration: "120s",
        timestamp: "2025-01-01T00:00:00Z",
        jira_number: "PROJ-123",
        approvers: null,
        logs: null,
        created_at: "2025-01-01T00:00:00Z",
      },
    ]);

    const { result } = renderHook(() => useBuilds(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const executions = await result.current.fetchExecutions("bj-1");
    expect(executions).toHaveLength(1);
    expect(executions[0].build_number).toBe("42");
  });

  it("creates an execution", async () => {
    vi.mocked(buildsService.getBuildJobs).mockResolvedValue([]);
    vi.mocked(buildsService.createExecution).mockResolvedValue({
      id: "exec-new",
      build_job_id: "bj-1",
      build_number: "43",
      branch: "main",
      status: "running",
      duration: null,
      timestamp: "2025-06-01T00:00:00Z",
      jira_number: null,
      approvers: null,
      logs: null,
      created_at: "2025-06-01T00:00:00Z",
    });

    const { result } = renderHook(() => useBuilds(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createExecution.mutateAsync({
        build_job_id: "bj-1",
        build_number: "43",
        branch: "main",
      });
    });

    expect(buildsService.createExecution).toHaveBeenCalledWith({
      build_job_id: "bj-1",
      build_number: "43",
      branch: "main",
    });
  });

  it("exposes accountId and enterpriseId from context", async () => {
    vi.mocked(buildsService.getBuildJobs).mockResolvedValue([]);

    const { result } = renderHook(() => useBuilds(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.accountId).toBe("acc-1");
    expect(result.current.enterpriseId).toBe("ent-1");
  });
});
