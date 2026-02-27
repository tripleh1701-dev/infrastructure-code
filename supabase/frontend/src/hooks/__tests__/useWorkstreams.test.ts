import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useWorkstreams } from "../useWorkstreams";

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

const mockWorkstream = {
  id: "ws-1",
  name: "DevOps",
  accountId: "acc-1",
  enterpriseId: "ent-1",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  tools: [
    { id: "t-1", workstreamId: "ws-1", toolName: "Jira", category: "Plan", createdAt: "2025-01-01T00:00:00Z" },
  ],
};

describe("useWorkstreams (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches workstreams and maps camelCase → snake_case", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockWorkstream], error: null });
    // Mock the ensure-default call that fires when workstreams exist (it won't fire)
    vi.mocked(httpClient.post).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useWorkstreams("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(httpClient.get).toHaveBeenCalledWith("/workstreams", {
      params: { accountId: "acc-1", enterpriseId: "ent-1" },
    });
    expect(result.current.workstreams).toHaveLength(1);
    const ws = result.current.workstreams[0];
    expect(ws.account_id).toBe("acc-1");
    expect(ws.enterprise_id).toBe("ent-1");
    expect(ws.tools).toHaveLength(1);
    expect(ws.tools![0].tool_name).toBe("Jira");
    expect(ws.tools![0].workstream_id).toBe("ws-1");
  });

  it("does not fetch when IDs are missing", async () => {
    const { result } = renderHook(() => useWorkstreams(undefined, "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it("creates a workstream with camelCase payload", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockWorkstream], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({ data: { id: "ws-new" }, error: null });

    const { result } = renderHook(() => useWorkstreams("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createWorkstream.mutateAsync({
        name: "QA",
        account_id: "acc-1",
        enterprise_id: "ent-1",
        tools: [{ category: "Test", tool_name: "Selenium" }],
      });
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      "/workstreams",
      expect.objectContaining({
        name: "QA",
        accountId: "acc-1",
        enterpriseId: "ent-1",
        tools: [{ toolName: "Selenium", category: "Test" }],
      })
    );
  });

  it("updates a workstream via PUT", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockWorkstream], error: null });
    vi.mocked(httpClient.put).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useWorkstreams("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateWorkstream.mutateAsync({
        id: "ws-1",
        name: "DevOps Updated",
        tools: [{ category: "Code", tool_name: "GitHub" }],
      });
    });

    expect(httpClient.put).toHaveBeenCalledWith("/workstreams/ws-1", {
      name: "DevOps Updated",
      tools: [{ toolName: "GitHub", category: "Code" }],
    });
  });

  it("deletes a workstream via DELETE", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockWorkstream], error: null });
    vi.mocked(httpClient.delete).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useWorkstreams("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteWorkstream.mutateAsync("ws-1");
    });

    expect(httpClient.delete).toHaveBeenCalledWith("/workstreams/ws-1");
  });

  it("fetches workstream tools via GET", async () => {
    vi.mocked(httpClient.get).mockImplementation(async (url: string) => {
      if (url === "/workstreams") return { data: [mockWorkstream], error: null };
      if (url === "/workstreams/ws-1/tools") return {
        data: [{ id: "t-1", workstreamId: "ws-1", toolName: "Jira", category: "Plan" }],
        error: null,
      };
      return { data: null, error: null };
    });

    const { result } = renderHook(() => useWorkstreams("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const tools = await result.current.getWorkstreamTools("ws-1");
    expect(tools).toHaveLength(1);
  });

  it("auto-creates default workstream when none exist", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({ data: { id: "ws-default" }, error: null });

    renderHook(() => useWorkstreams("acc-1", "ent-1"), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(httpClient.post).toHaveBeenCalledWith("/workstreams/ensure-default", {
        accountId: "acc-1",
        enterpriseId: "ent-1",
      });
    });
  });
});
