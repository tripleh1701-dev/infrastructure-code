import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { usePipelines } from "../usePipelines";

// Mock contexts
vi.mock("@/contexts/AccountContext", () => ({
  useAccountContext: () => ({ selectedAccount: { id: "acc-1", name: "Test Account" } }),
}));

vi.mock("@/contexts/EnterpriseContext", () => ({
  useEnterpriseContext: () => ({ selectedEnterprise: { id: "ent-1", name: "Test Enterprise" } }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { sub: "user-1" } }),
}));

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    setAuthToken: vi.fn(),
    setBaseUrl: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { httpClient } from "@/lib/api/http-client";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mockPipeline = {
  id: "pipe-1",
  accountId: "acc-1",
  enterpriseId: "ent-1",
  name: "CI/CD Pipeline",
  description: "Main deployment pipeline",
  status: "active",
  deploymentType: "Integration",
  nodes: [{ id: "n1", type: "stage" }],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
  yamlContent: null,
  productId: "prod-1",
  serviceIds: ["svc-1"],
  createdBy: "user-1",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

describe("usePipelines (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches pipelines and maps camelCase → snake_case", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockPipeline], error: null });

    const { result } = renderHook(() => usePipelines(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(httpClient.get).toHaveBeenCalledWith("/pipelines", {
      params: { accountId: "acc-1", enterpriseId: "ent-1" },
    });
    expect(result.current.pipelines).toHaveLength(1);
    const p = result.current.pipelines[0];
    expect(p.account_id).toBe("acc-1");
    expect(p.deployment_type).toBe("Integration");
    expect(p.service_ids).toEqual(["svc-1"]);
    expect(p.created_by).toBe("user-1");
  });

  it("returns empty array on API error", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: null, error: { message: "Forbidden" } });

    const { result } = renderHook(() => usePipelines(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pipelines).toEqual([]);
  });

  it("fetches a single pipeline by ID", async () => {
    vi.mocked(httpClient.get).mockImplementation(async (url: string) => {
      if (url === "/pipelines") return { data: [], error: null };
      if (url === "/pipelines/pipe-1") return { data: mockPipeline, error: null };
      return { data: null, error: null };
    });

    const { result } = renderHook(() => usePipelines(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const pipeline = await result.current.fetchPipeline("pipe-1");
    expect(pipeline).not.toBeNull();
    expect(pipeline!.name).toBe("CI/CD Pipeline");
    expect(pipeline!.yaml_content).toBeNull();
  });

  it("creates a pipeline with camelCase payload", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({ data: mockPipeline, error: null });

    const { result } = renderHook(() => usePipelines(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createPipeline({
        name: "CI/CD Pipeline",
        description: "Main deployment pipeline",
        deployment_type: "Integration",
        nodes: [],
        edges: [],
      });
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      "/pipelines",
      expect.objectContaining({
        name: "CI/CD Pipeline",
        deploymentType: "Integration",
        accountId: "acc-1",
        enterpriseId: "ent-1",
      })
    );
  });

  it("updates a pipeline via PUT with camelCase keys", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockPipeline], error: null });
    vi.mocked(httpClient.put).mockResolvedValue({ data: mockPipeline, error: null });

    const { result } = renderHook(() => usePipelines(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePipeline({
        id: "pipe-1",
        name: "Updated Pipeline",
        status: "inactive",
      });
    });

    expect(httpClient.put).toHaveBeenCalledWith("/pipelines/pipe-1", {
      name: "Updated Pipeline",
      status: "inactive",
    });
  });

  it("deletes a pipeline", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.delete).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => usePipelines(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deletePipeline("pipe-1");
    });

    expect(httpClient.delete).toHaveBeenCalledWith("/pipelines/pipe-1");
  });

  it("duplicates a pipeline via POST", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockPipeline], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({
      data: { ...mockPipeline, id: "pipe-2", name: "CI/CD Pipeline (Copy)", status: "draft" },
      error: null,
    });

    const { result } = renderHook(() => usePipelines(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.duplicatePipeline("pipe-1");
    });

    expect(httpClient.post).toHaveBeenCalledWith("/api/pipelines/pipe-1/duplicate", {});
  });

  it("exposes context IDs and loading states", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => usePipelines(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.selectedAccountId).toBe("acc-1");
    expect(result.current.selectedEnterpriseId).toBe("ent-1");
    expect(result.current.isCreating).toBe(false);
    expect(result.current.isUpdating).toBe(false);
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.isDuplicating).toBe(false);
  });
});
