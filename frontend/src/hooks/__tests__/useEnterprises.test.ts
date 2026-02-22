import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createElement } from "react";
import { useEnterprises } from "../useEnterprises";

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

const mockEnterprise = {
  id: "ent-1",
  name: "Acme Corp",
  createdAt: "2025-01-01T00:00:00Z",
  product: { id: "prod-1", name: "Product A" },
  services: [{ id: "svc-1", name: "Service B" }],
};

describe("useEnterprises (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches enterprises and maps fields", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockEnterprise], error: null });

    const { result } = renderHook(() => useEnterprises());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(httpClient.get).toHaveBeenCalledWith("/enterprises");
    expect(result.current.enterprises).toHaveLength(1);
    const e = result.current.enterprises[0];
    expect(e.name).toBe("Acme Corp");
    expect(e.created_at).toBe("2025-01-01T00:00:00Z");
    expect(e.product).toEqual({ id: "prod-1", name: "Product A" });
    expect(e.services).toEqual([{ id: "svc-1", name: "Service B" }]);
  });

  it("handles null data gracefully", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useEnterprises());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enterprises).toEqual([]);
  });

  it("handles API error without crashing", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: null, error: { message: "Unauthorized" } });

    const { result } = renderHook(() => useEnterprises());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enterprises).toEqual([]);
  });

  it("ensures services defaults to empty array when missing", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      data: [{ id: "ent-2", name: "NoServices" }],
      error: null,
    });

    const { result } = renderHook(() => useEnterprises());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.enterprises[0].services).toEqual([]);
    expect(result.current.enterprises[0].product).toBeNull();
  });

  it("refetch re-fetches data", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useEnterprises());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockEnterprise], error: null });
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.enterprises).toHaveLength(1));
  });
});
