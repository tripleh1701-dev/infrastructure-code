import { describe, it, expect, vi, beforeEach } from "vitest";
import { inboxService } from "../inbox.service";
import { httpClient } from "@/lib/api/http-client";

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockNotification = {
  notificationId: "notif-1",
  accountId: "acc-1",
  recipientEmail: "approver@test.com",
  senderEmail: "requester@test.com",
  type: "APPROVAL_REQUEST" as const,
  status: "PENDING" as const,
  title: "Approval needed",
  message: "Please approve stage Deploy",
  context: {
    executionId: "exec-1",
    pipelineId: "pipe-1",
    stageId: "stage-1",
    stageName: "Deploy",
    pipelineName: "Main Pipeline",
    branch: "main",
  },
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

describe("inboxService (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── list ──────────────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns notifications from GET /inbox", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({
        data: [mockNotification],
        error: null,
      });
      const result = await inboxService.list();
      expect(httpClient.get).toHaveBeenCalledWith("/inbox");
      expect(result).toEqual([mockNotification]);
    });

    it("returns empty array on error", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({
        data: null,
        error: { message: "Network error", code: "ERR" },
      });
      const result = await inboxService.list();
      expect(result).toEqual([]);
    });

    it("returns empty array when request throws", async () => {
      vi.mocked(httpClient.get).mockRejectedValue(new Error("timeout"));
      const result = await inboxService.list();
      expect(result).toEqual([]);
    });
  });

  // ── getPendingCount ───────────────────────────────────────────────────────
  describe("getPendingCount", () => {
    it("returns count from GET /inbox/count", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({
        data: { count: 5 },
        error: null,
      });
      const result = await inboxService.getPendingCount();
      expect(httpClient.get).toHaveBeenCalledWith("/inbox/count");
      expect(result).toBe(5);
    });

    it("returns 0 on error", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({
        data: null,
        error: { message: "fail", code: "ERR" },
      });
      expect(await inboxService.getPendingCount()).toBe(0);
    });

    it("returns 0 when request throws", async () => {
      vi.mocked(httpClient.get).mockRejectedValue(new Error("timeout"));
      expect(await inboxService.getPendingCount()).toBe(0);
    });
  });

  // ── approve ───────────────────────────────────────────────────────────────
  describe("approve", () => {
    it("posts to /inbox/:id/approve and returns result", async () => {
      const response = { message: "Approved", notification: { ...mockNotification, status: "APPROVED" } };
      vi.mocked(httpClient.post).mockResolvedValue({ data: response, error: null });

      const result = await inboxService.approve("notif-1");
      expect(httpClient.post).toHaveBeenCalledWith("/inbox/notif-1/approve", {});
      expect(result).toEqual(response);
    });

    it("throws on error", async () => {
      vi.mocked(httpClient.post).mockResolvedValue({
        data: null,
        error: { message: "Not found", code: "404" },
      });
      await expect(inboxService.approve("notif-x")).rejects.toThrow("Not found");
    });
  });

  // ── reject ────────────────────────────────────────────────────────────────
  describe("reject", () => {
    it("posts to /inbox/:id/reject and returns result", async () => {
      const response = { message: "Rejected", notification: { ...mockNotification, status: "REJECTED" } };
      vi.mocked(httpClient.post).mockResolvedValue({ data: response, error: null });

      const result = await inboxService.reject("notif-1");
      expect(httpClient.post).toHaveBeenCalledWith("/inbox/notif-1/reject", {});
      expect(result).toEqual(response);
    });

    it("throws on error", async () => {
      vi.mocked(httpClient.post).mockResolvedValue({
        data: null,
        error: { message: "Forbidden", code: "403" },
      });
      await expect(inboxService.reject("notif-1")).rejects.toThrow("Forbidden");
    });
  });

  // ── dismiss ───────────────────────────────────────────────────────────────
  describe("dismiss", () => {
    it("posts to /inbox/:id/dismiss", async () => {
      vi.mocked(httpClient.post).mockResolvedValue({ data: null, error: null });

      await inboxService.dismiss("notif-1");
      expect(httpClient.post).toHaveBeenCalledWith("/inbox/notif-1/dismiss", {});
    });

    it("throws on error", async () => {
      vi.mocked(httpClient.post).mockResolvedValue({
        data: null,
        error: { message: "Server error", code: "500" },
      });
      await expect(inboxService.dismiss("notif-1")).rejects.toThrow("Server error");
    });
  });
});
