import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useConnectors } from "../useConnectors";

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

const mockConnector = {
  id: "conn-1",
  name: "Jira",
  connectorType: "Project Management",
  connectorTool: "jira",
  category: "Plan",
  status: "connected",
  health: "healthy",
  accountId: "acc-1",
  enterpriseId: "ent-1",
  syncCount: 5,
  lastSyncAt: "2025-06-01T00:00:00Z",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  workstreams: [{ id: "ws-1", name: "DevOps" }],
};

describe("useConnectors (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches connectors and maps camelCase → snake_case", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockConnector], error: null });

    const { result } = renderHook(() => useConnectors("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(httpClient.get).toHaveBeenCalledWith("/connectors", {
      params: { accountId: "acc-1", enterpriseId: "ent-1" },
    });
    expect(result.current.connectors).toHaveLength(1);
    const c = result.current.connectors[0];
    expect(c.connector_type).toBe("Project Management");
    expect(c.connector_tool).toBe("jira");
    expect(c.sync_count).toBe(5);
    expect(c.workstreams).toEqual([{ id: "ws-1", name: "DevOps" }]);
  });

  it("does not fetch when IDs are missing", async () => {
    const { result } = renderHook(() => useConnectors(undefined, "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it("creates a connector with camelCase payload", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({ data: { id: "new-conn" }, error: null });

    const { result } = renderHook(() => useConnectors("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createConnector.mutateAsync({
        name: "GitHub",
        connector_type: "Source Control",
        connector_tool: "github",
        category: "Code",
        account_id: "acc-1",
        enterprise_id: "ent-1",
        workstream_ids: ["ws-1"],
      });
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      "/connectors",
      expect.objectContaining({
        connectorType: "Source Control",
        connectorTool: "github",
        workstreamIds: ["ws-1"],
      })
    );
  });

  it("updates a connector via PUT", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.put).mockResolvedValue({ data: { id: "conn-1" }, error: null });

    const { result } = renderHook(() => useConnectors("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateConnector.mutateAsync({ id: "conn-1", name: "Jira Updated" });
    });

    expect(httpClient.put).toHaveBeenCalledWith("/connectors/conn-1", { name: "Jira Updated" });
  });

  it("deletes a connector via DELETE", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.delete).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useConnectors("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteConnector.mutateAsync("conn-1");
    });

    expect(httpClient.delete).toHaveBeenCalledWith("/connectors/conn-1");
  });

  it("throws on fetch error", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: null, error: { message: "Forbidden" } });

    const { result } = renderHook(() => useConnectors("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.connectors).toEqual([]);
  });
});
