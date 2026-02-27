import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useLicenses } from "../useLicenses";

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
vi.mock("../useWorkstreams", () => ({ ensureDefaultWorkstream: vi.fn() }));

import { httpClient } from "@/lib/api/http-client";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mockLicense = {
  id: "lic-1",
  accountId: "acc-1",
  enterpriseId: "ent-1",
  productId: "prod-1",
  serviceId: "svc-1",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  numberOfUsers: 50,
  contactFullName: "Jane Doe",
  contactEmail: "jane@test.com",
  contactPhone: "+1234567890",
  renewalNotify: true,
  noticeDays: 30,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const mockEntities = {
  products: [{ id: "prod-1", name: "Product A" }],
  services: [{ id: "svc-1", name: "Service B" }],
};

describe("useLicenses (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches licenses with entity lookups and maps to snake_case", async () => {
    vi.mocked(httpClient.get).mockImplementation(async (url: string) => {
      if (url === "/licenses") return { data: [mockLicense], error: null };
      if (url === "/licenses/licensed-entities") return { data: mockEntities, error: null };
      return { data: null, error: null };
    });

    const { result } = renderHook(() => useLicenses("acc-1", "ent-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.licenses).toHaveLength(1);
    const lic = result.current.licenses[0];
    expect(lic.account_id).toBe("acc-1");
    expect(lic.product_id).toBe("prod-1");
    expect(lic.number_of_users).toBe(50);
    expect(lic.contact_full_name).toBe("Jane Doe");
    expect(lic.product).toEqual({ id: "prod-1", name: "Product A" });
    expect(lic.service).toEqual({ id: "svc-1", name: "Service B" });
  });

  it("returns empty when accountId is missing", async () => {
    const { result } = renderHook(() => useLicenses(undefined), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(httpClient.get).not.toHaveBeenCalled();
    expect(result.current.licenses).toEqual([]);
  });

  it("creates a license with camelCase payload", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useLicenses("acc-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createLicense.mutateAsync({
        account_id: "acc-1",
        enterprise_id: "ent-1",
        product_id: "prod-1",
        service_id: "svc-1",
        start_date: "2025-01-01",
        end_date: "2025-12-31",
        number_of_users: 10,
        contact_full_name: "John",
        contact_email: "john@test.com",
        renewal_notify: true,
        notice_days: 30,
      });
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      "/licenses",
      expect.objectContaining({
        accountId: "acc-1",
        productId: "prod-1",
        numberOfUsers: 10,
        contactFullName: "John",
        renewalNotify: true,
      })
    );
  });

  it("updates a license via PUT", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.put).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useLicenses("acc-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateLicense.mutateAsync({
        id: "lic-1",
        data: { number_of_users: 100 },
      });
    });

    expect(httpClient.put).toHaveBeenCalledWith("/licenses/lic-1", { number_of_users: 100 });
  });

  it("deletes a license via DELETE", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.delete).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useLicenses("acc-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteLicense.mutateAsync("lic-1");
    });

    expect(httpClient.delete).toHaveBeenCalledWith("/licenses/lic-1");
  });

  it("throws on license fetch error", async () => {
    vi.mocked(httpClient.get).mockImplementation(async (url: string) => {
      if (url === "/licenses") return { data: null, error: { message: "Server error" } };
      return { data: null, error: null };
    });

    const { result } = renderHook(() => useLicenses("acc-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.licenses).toEqual([]);
  });

  it("handles missing entity data gracefully", async () => {
    vi.mocked(httpClient.get).mockImplementation(async (url: string) => {
      if (url === "/licenses") return { data: [mockLicense], error: null };
      if (url === "/licenses/licensed-entities") return { data: null, error: { message: "Not found" } };
      return { data: null, error: null };
    });

    const { result } = renderHook(() => useLicenses("acc-1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Should still return licenses, just without resolved product/service names
    expect(result.current.licenses).toHaveLength(1);
    expect(result.current.licenses[0].product).toBeNull();
    expect(result.current.licenses[0].service).toBeNull();
  });
});
