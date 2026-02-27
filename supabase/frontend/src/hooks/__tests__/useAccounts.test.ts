import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useAccounts } from "../useAccounts";

// Mock httpClient (external API mode is globally set in setup.ts)
vi.mock("@/lib/api/http-client", () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockPut = vi.fn();
  const mockDelete = vi.fn();
  return {
    httpClient: {
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete,
      patch: vi.fn(),
      setAuthToken: vi.fn(),
      setBaseUrl: vi.fn(),
    },
  };
});

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock supabase (shouldn't be called in external mode, but needs to exist)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

import { httpClient } from "@/lib/api/http-client";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockAccountResponse = {
  id: "acc-1",
  name: "Test Account",
  masterAccountName: "Master",
  cloudType: "public",
  status: "active",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  addresses: [
    {
      id: "addr-1",
      line1: "123 Main St",
      city: "NYC",
      state: "NY",
      country: "US",
      postalCode: "10001",
    },
  ],
  technicalUser: {
    id: "user-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@test.com",
    status: "active",
    startDate: "2025-01-01",
    assignedGroup: "admins",
    assignedRole: "admin",
  },
  licenseCount: 2,
  expiringLicenseCount: 1,
};

describe("useAccounts (external API mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches accounts and maps camelCase → snake_case", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      data: [mockAccountResponse],
      error: null,
    });

    const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(httpClient.get).toHaveBeenCalledWith("/accounts");
    expect(result.current.accounts).toHaveLength(1);

    const account = result.current.accounts[0];
    expect(account.master_account_name).toBe("Master");
    expect(account.cloud_type).toBe("public");
    expect(account.addresses).toHaveLength(1);
    expect(account.addresses[0].postal_code).toBe("10001");
    expect(account.technical_users).toHaveLength(1);
    expect(account.technical_users[0].first_name).toBe("John");
    expect(account.license_count).toBe(2);
    expect(account.expiring_license_count).toBe(1);
  });

  it("returns empty array when API returns null data", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.accounts).toEqual([]);
  });

  it("throws on API error during fetch", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      data: null,
      error: { message: "Unauthorized" },
    });

    const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // react-query will keep default empty array on error
    expect(result.current.accounts).toEqual([]);
  });

  it("creates an account with camelCase payload", async () => {
    // Setup: initial fetch returns empty
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({
      data: { id: "new-acc", name: "New" },
      error: null,
    });

    const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createAccount.mutateAsync({
        name: "New",
        master_account_name: "Master",
        cloud_type: "private",
        addresses: [
          { line1: "1 St", city: "LA", state: "CA", country: "US", postal_code: "90001" },
        ],
        technical_users: [{
          first_name: "Jane",
          last_name: "Smith",
          email: "jane@test.com",
          status: "active",
          start_date: "2025-06-01",
          assigned_group: "ops",
          assigned_role: "user",
        }],
      });
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      "/accounts",
      expect.objectContaining({
        name: "New",
        masterAccountName: "Master",
        cloudType: "private",
        technicalUser: expect.objectContaining({ firstName: "Jane" }),
      })
    );
  });

  it("updates an account via PUT", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.put).mockResolvedValue({ data: { id: "acc-1" }, error: null });

    const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateAccount.mutateAsync({
        id: "acc-1",
        name: "Updated",
        master_account_name: "M",
        cloud_type: "hybrid",
        addresses: [],
        technical_users: [{
          first_name: "A",
          last_name: "B",
          email: "a@b.com",
          status: "active",
          start_date: "2025-01-01",
          assigned_group: "g",
          assigned_role: "r",
        }],
      });
    });

    expect(httpClient.put).toHaveBeenCalledWith("/accounts/acc-1", expect.any(Object));
  });

  it("deletes an account via DELETE", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.delete).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteAccount.mutateAsync("acc-1");
    });

    expect(httpClient.delete).toHaveBeenCalledWith("/accounts/acc-1");
  });

  it("throws on delete error", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.delete).mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });

    const { result } = renderHook(() => useAccounts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.deleteAccount.mutateAsync("bad-id");
      })
    ).rejects.toThrow("Not found");
  });
});
