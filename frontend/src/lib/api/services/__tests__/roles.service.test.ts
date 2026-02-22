import { describe, it, expect, vi, beforeEach } from "vitest";
import { rolesService } from "../roles.service";
import { httpClient } from "@/lib/api/http-client";

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockRole = { id: "r-1", name: "Admin", description: "Admin role", permissions: 255, createdAt: "2025-01-01", updatedAt: "2025-01-01", userCount: 5 };
const mockPermission = { id: "p-1", roleId: "r-1", menuKey: "dashboard", menuLabel: "Dashboard", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: true, canDelete: false };

describe("rolesService (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("getAll", () => {
    it("fetches roles with account and enterprise params", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({ data: [mockRole], error: null });
      const result = await rolesService.getAll("acc-1", "ent-1");
      expect(httpClient.get).toHaveBeenCalledWith("/roles", { params: { accountId: "acc-1", enterpriseId: "ent-1" } });
      expect(result.data).toEqual([mockRole]);
    });

    it("passes undefined for null params", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({ data: [], error: null });
      await rolesService.getAll(null, null);
      expect(httpClient.get).toHaveBeenCalledWith("/roles", { params: { accountId: undefined, enterpriseId: undefined } });
    });
  });

  describe("create", () => {
    it("posts new role", async () => {
      const input = { name: "Editor", permissions: 127 };
      vi.mocked(httpClient.post).mockResolvedValue({ data: { ...mockRole, name: "Editor" }, error: null });
      const result = await rolesService.create(input as any);
      expect(httpClient.post).toHaveBeenCalledWith("/roles", input);
      expect(result.data!.name).toBe("Editor");
    });
  });

  describe("update", () => {
    it("puts updated role", async () => {
      const input = { name: "SuperAdmin", permissions: 511 };
      vi.mocked(httpClient.put).mockResolvedValue({ data: { ...mockRole, name: "SuperAdmin" }, error: null });
      const result = await rolesService.update("r-1", input as any);
      expect(httpClient.put).toHaveBeenCalledWith("/roles/r-1", input);
      expect(result.data!.name).toBe("SuperAdmin");
    });
  });

  describe("delete", () => {
    it("deletes role by id", async () => {
      vi.mocked(httpClient.delete).mockResolvedValue({ data: undefined, error: null });
      const result = await rolesService.delete("r-1");
      expect(httpClient.delete).toHaveBeenCalledWith("/roles/r-1");
      expect(result.error).toBeNull();
    });
  });

  describe("getPermissions", () => {
    it("fetches permissions for a role", async () => {
      vi.mocked(httpClient.get).mockResolvedValue({ data: [mockPermission], error: null });
      const result = await rolesService.getPermissions("r-1");
      expect(httpClient.get).toHaveBeenCalledWith("/roles/r-1/permissions");
      expect(result.data).toEqual([mockPermission]);
    });
  });

  describe("updatePermissions", () => {
    it("puts updated permissions array", async () => {
      const perms = [{ menuKey: "builds", menuLabel: "Builds", isVisible: true, tabs: [], canCreate: true, canView: true, canEdit: false, canDelete: false }];
      vi.mocked(httpClient.put).mockResolvedValue({ data: perms, error: null });
      const result = await rolesService.updatePermissions("r-1", perms as any);
      expect(httpClient.put).toHaveBeenCalledWith("/roles/r-1/permissions", { permissions: perms });
      expect(result.data).toEqual(perms);
    });
  });
});
