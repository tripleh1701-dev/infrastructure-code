import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useCredentials } from "../useCredentials";

vi.mock("@/lib/api/http-client", () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  const mockPatch = vi.fn();
  const mockDelete = vi.fn();
  return {
    httpClient: {
      get: mockGet,
      post: mockPost,
      put: vi.fn(),
      patch: mockPatch,
      delete: mockDelete,
      setAuthToken: vi.fn(),
      setBaseUrl: vi.fn(),
    },
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));

import { httpClient } from "@/lib/api/http-client";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockCredential = {
  id: "cred-1",
  name: "My API Key",
  description: "Test key",
  accountId: "acc-1",
  enterpriseId: "ent-1",
  category: "cloud",
  connector: "aws",
  authType: "api_key",
  credentials: { apiKey: "***" },
  status: "active",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  expiryNoticeDays: 30,
  expiryNotify: true,
  workstreams: [{ id: "ws-1", name: "DevOps" }],
};

describe("useCredentials (external API mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches credentials with accountId and enterpriseId params", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      data: [mockCredential],
      error: null,
    });

    const { result } = renderHook(
      () => useCredentials("acc-1", "ent-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(httpClient.get).toHaveBeenCalledWith("/credentials", {
      params: { accountId: "acc-1", enterpriseId: "ent-1" },
    });
    expect(result.current.credentials).toHaveLength(1);
    expect(result.current.credentials[0].account_id).toBe("acc-1");
    expect(result.current.credentials[0].auth_type).toBe("api_key");
    expect(result.current.credentials[0].workstreams).toEqual([
      { id: "ws-1", name: "DevOps" },
    ]);
  });

  it("does not fetch when accountId or enterpriseId is missing", async () => {
    const { result } = renderHook(
      () => useCredentials(undefined, "ent-1"),
      { wrapper: createWrapper() }
    );

    // Should remain loading=false (query disabled)
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(httpClient.get).not.toHaveBeenCalled();
    expect(result.current.credentials).toEqual([]);
  });

  it("maps camelCase API response to snake_case", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      data: [mockCredential],
      error: null,
    });

    const { result } = renderHook(
      () => useCredentials("acc-1", "ent-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.credentials.length).toBe(1));

    const cred = result.current.credentials[0];
    expect(cred.enterprise_id).toBe("ent-1");
    expect(cred.expiry_notice_days).toBe(30);
    expect(cred.expiry_notify).toBe(true);
  });

  it("creates a credential with camelCase payload", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({
      data: { id: "new-cred" },
      error: null,
    });

    const { result } = renderHook(
      () => useCredentials("acc-1", "ent-1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createCredential.mutateAsync({
        name: "New Key",
        account_id: "acc-1",
        enterprise_id: "ent-1",
        workstream_ids: ["ws-1"],
        category: "cloud",
        connector: "gcp",
        auth_type: "api_key",
        credentials: { key: "val" },
      });
    });

    expect(httpClient.post).toHaveBeenCalledWith(
      "/credentials",
      expect.objectContaining({
        name: "New Key",
        accountId: "acc-1",
        enterpriseId: "ent-1",
        workstreamIds: ["ws-1"],
        authType: "api_key",
      })
    );
  });

  it("updates a credential via PATCH", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.patch).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(
      () => useCredentials("acc-1", "ent-1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateCredential.mutateAsync({
        id: "cred-1",
        name: "Updated Key",
        status: "active",
      });
    });

    expect(httpClient.patch).toHaveBeenCalledWith(
      "/credentials/cred-1",
      expect.objectContaining({ name: "Updated Key", status: "active" })
    );
  });

  it("rotates a credential via POST", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(
      () => useCredentials("acc-1", "ent-1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.rotateCredential.mutateAsync({
        id: "cred-1",
        credentials: { newKey: "rotated-value" },
      });
    });

    expect(httpClient.post).toHaveBeenCalledWith("/credentials/cred-1/rotate", {
      credentials: { newKey: "rotated-value" },
    });
  });

  it("deletes a credential via DELETE", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.delete).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(
      () => useCredentials("acc-1", "ent-1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteCredential.mutateAsync("cred-1");
    });

    expect(httpClient.delete).toHaveBeenCalledWith("/credentials/cred-1");
  });

  it("throws on create error", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({
      data: null,
      error: { message: "Duplicate name" },
    });

    const { result } = renderHook(
      () => useCredentials("acc-1", "ent-1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await expect(
      act(async () => {
        await result.current.createCredential.mutateAsync({
          name: "Dup",
          account_id: "acc-1",
          enterprise_id: "ent-1",
          workstream_ids: [],
          category: "cloud",
          connector: "aws",
          auth_type: "api_key",
        });
      })
    ).rejects.toThrow("Duplicate name");
  });

  it("initiates OAuth flow via external API", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({
      data: { authorizationUrl: "https://oauth.example.com", state: "abc123" },
      error: null,
    });

    const { result } = renderHook(
      () => useCredentials("acc-1", "ent-1"),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const oauthResult = await result.current.initiateOAuth(
      "cred-1",
      "github",
      "https://app.test.com/callback"
    );

    expect(oauthResult).toEqual({
      authorizationUrl: "https://oauth.example.com",
      state: "abc123",
    });
  });
});
