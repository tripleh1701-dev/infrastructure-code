import { describe, it, expect, vi, beforeEach } from "vitest";
import { groupsService } from "../groups.service";
import { httpClient } from "@/lib/api/http-client";

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockGroup = { id: "g-1", name: "Admins", description: "Admin group", createdAt: "2025-01-01", updatedAt: "2025-01-01", memberCount: 3 };

describe("groupsService (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getAll", () => {
    it("fetches groups with accountId param", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({ data: [mockGroup], error: null });
      const result = await groupsService.getAll("acc-1");
      expect(httpClient.get).toHaveBeenCalledWith("/groups", { params: { accountId: "acc-1" } });
      expect(result.data).toEqual([mockGroup]);
    });

    it("passes undefined accountId when null", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
      await groupsService.getAll(null);
      expect(httpClient.get).toHaveBeenCalledWith("/groups", { params: { accountId: undefined } });
    });
  });

  describe("create", () => {
    it("posts new group", async () => {
      const input = { name: "NewGroup", description: "desc" };
      vi.mocked(httpClient.post).mockResolvedValue({ data: mockGroup, error: null });
      const result = await groupsService.create(input);
      expect(httpClient.post).toHaveBeenCalledWith("/groups", input);
      expect(result.data).toEqual(mockGroup);
    });
  });

  describe("update", () => {
    it("puts updated group", async () => {
      const input = { name: "Updated", description: "new desc" };
      vi.mocked(httpClient.put).mockResolvedValue({ data: { ...mockGroup, name: "Updated" }, error: null });
      const result = await groupsService.update("g-1", input);
      expect(httpClient.put).toHaveBeenCalledWith("/groups/g-1", input);
      expect(result.data!.name).toBe("Updated");
    });
  });

  describe("delete", () => {
    it("deletes group by id", async () => {
      vi.mocked(httpClient.delete).mockResolvedValue({ data: undefined, error: null });
      const result = await groupsService.delete("g-1");
      expect(httpClient.delete).toHaveBeenCalledWith("/groups/g-1");
      expect(result.error).toBeNull();
    });
  });
});
