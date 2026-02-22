import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useInbox } from "../useInbox";

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    setAuthToken: vi.fn(),
    setBaseUrl: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));

import { httpClient } from "@/lib/api/http-client";
import { toast } from "sonner";

const pendingNotification = {
  notificationId: "notif-1",
  accountId: "acc-1",
  recipientEmail: "approver@test.com",
  senderEmail: "requester@test.com",
  type: "APPROVAL_REQUEST" as const,
  status: "PENDING" as const,
  title: "Approve Deploy",
  message: "Please approve",
  context: { executionId: "exec-1", stageId: "stage-1" },
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const approvedNotification = {
  ...pendingNotification,
  notificationId: "notif-2",
  status: "APPROVED" as const,
  type: "APPROVAL_GRANTED" as const,
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useInbox (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches notifications and splits pending/actioned", async () => {
    vi.mocked(httpClient.get).mockImplementation(async (url: string) => {
      if (url === "/inbox") return { data: [pendingNotification, approvedNotification], error: null };
      if (url === "/inbox/count") return { data: { count: 1 }, error: null };
      return { data: null, error: null };
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.pendingNotifications).toHaveLength(1);
    expect(result.current.actionedNotifications).toHaveLength(1);
    expect(result.current.pendingCount).toBe(1);
  });

  it("returns empty arrays when API returns empty", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.notifications).toEqual([]);
    expect(result.current.pendingNotifications).toEqual([]);
    expect(result.current.actionedNotifications).toEqual([]);
  });

  it("approve mutation calls POST and shows success toast", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [pendingNotification], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({
      data: { message: "Approved", notification: { ...pendingNotification, status: "APPROVED" } },
      error: null,
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.approve.mutate(pendingNotification);
    });

    await waitFor(() => expect(result.current.approve.isSuccess).toBe(true));
    expect(httpClient.post).toHaveBeenCalledWith("/inbox/notif-1/approve", {});
    expect(toast.success).toHaveBeenCalledWith("Approval granted successfully");
  });

  it("reject mutation calls POST and shows success toast", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [pendingNotification], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({
      data: { message: "Rejected", notification: { ...pendingNotification, status: "REJECTED" } },
      error: null,
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.reject.mutate(pendingNotification);
    });

    await waitFor(() => expect(result.current.reject.isSuccess).toBe(true));
    expect(httpClient.post).toHaveBeenCalledWith("/inbox/notif-1/reject", {});
    expect(toast.success).toHaveBeenCalledWith("Request rejected");
  });

  it("dismiss mutation calls POST", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [pendingNotification], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.dismiss.mutate("notif-1");
    });

    await waitFor(() => expect(result.current.dismiss.isSuccess).toBe(true));
    expect(httpClient.post).toHaveBeenCalledWith("/inbox/notif-1/dismiss", {});
  });

  it("approve error shows error toast", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [pendingNotification], error: null });
    vi.mocked(httpClient.post).mockResolvedValue({
      data: null,
      error: { message: "Not found", code: "404" },
    });

    const { result } = renderHook(() => useInbox(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.approve.mutate(pendingNotification);
    });

    await waitFor(() => expect(result.current.approve.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});
