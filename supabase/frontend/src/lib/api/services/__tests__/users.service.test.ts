import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/config", () => ({ isExternalApi: () => true }));

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("../workstreams.service", () => ({
  workstreamsService: { ensureDefault: vi.fn() },
}));

import { httpClient } from "@/lib/api/http-client";
import { usersService } from "../users.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedPut = httpClient.put as ReturnType<typeof vi.fn>;
const mockedDelete = httpClient.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── getAll ──────────────────────────────────────────────────────────────────

describe("usersService.getAll", () => {
  it("fetches users with account and enterprise params", async () => {
    const users = [
      { id: "u1", firstName: "John", lastName: "Doe", email: "john@test.com", accountName: "Acme", workstreams: [] },
    ];
    mockedGet.mockResolvedValue({ data: users, error: null });

    const result = await usersService.getAll("a1", "e1");

    expect(mockedGet).toHaveBeenCalledWith("/users", {
      params: { accountId: "a1", enterpriseId: "e1" },
    });
    expect(result.data).toHaveLength(1);
    expect(result.data![0].firstName).toBe("John");
  });

  it("passes undefined for null params", async () => {
    mockedGet.mockResolvedValue({ data: [], error: null });

    await usersService.getAll(null, null);

    expect(mockedGet).toHaveBeenCalledWith("/users", {
      params: { accountId: undefined, enterpriseId: undefined },
    });
  });

  it("returns error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "Unauthorized" } });
    const result = await usersService.getAll("a1");
    expect(result.error?.message).toBe("Unauthorized");
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("usersService.create", () => {
  it("posts user input directly", async () => {
    const input = {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@test.com",
      status: "active" as const,
      startDate: "2025-01-01",
      assignedGroup: "devs",
      assignedRole: "developer",
      accountId: "a1",
      enterpriseId: "e1",
      isTechnicalUser: true,
    };
    mockedPost.mockResolvedValue({ data: { id: "u-new", ...input }, error: null });

    const result = await usersService.create(input);

    expect(mockedPost).toHaveBeenCalledWith("/users", input);
    expect(result.data?.id).toBe("u-new");
  });

  it("returns error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "Duplicate email" } });
    const result = await usersService.create({ firstName: "X", lastName: "Y", email: "x@y.com", status: "active", startDate: "2025-01-01", assignedGroup: "g", assignedRole: "r" });
    expect(result.error?.message).toBe("Duplicate email");
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("usersService.update", () => {
  it("puts partial update to /users/:id", async () => {
    mockedPut.mockResolvedValue({ data: { id: "u1", firstName: "Updated" }, error: null });

    const result = await usersService.update("u1", { firstName: "Updated", status: "inactive" });

    expect(mockedPut).toHaveBeenCalledWith("/users/u1", { firstName: "Updated", status: "inactive" });
    expect(result.data?.firstName).toBe("Updated");
  });

  it("returns error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "Not Found" } });
    const result = await usersService.update("u-bad", {});
    expect(result.error?.message).toBe("Not Found");
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("usersService.delete", () => {
  it("calls delete /users/:id", async () => {
    mockedDelete.mockResolvedValue({ data: undefined, error: null });

    const result = await usersService.delete("u1");

    expect(mockedDelete).toHaveBeenCalledWith("/users/u1");
    expect(result.error).toBeNull();
  });

  it("returns error", async () => {
    mockedDelete.mockResolvedValue({ data: null, error: { message: "err" } });
    const result = await usersService.delete("u1");
    expect(result.error?.message).toBe("err");
  });
});

// ─── updateWorkstreams ───────────────────────────────────────────────────────

describe("usersService.updateWorkstreams", () => {
  it("puts workstream IDs to /users/:id/workstreams", async () => {
    mockedPut.mockResolvedValue({ data: undefined, error: null });

    const result = await usersService.updateWorkstreams("u1", ["w1", "w2"]);

    expect(mockedPut).toHaveBeenCalledWith("/users/u1/workstreams", { workstreamIds: ["w1", "w2"] });
    expect(result.error).toBeNull();
  });

  it("handles empty workstream array", async () => {
    mockedPut.mockResolvedValue({ data: undefined, error: null });

    await usersService.updateWorkstreams("u1", []);

    expect(mockedPut).toHaveBeenCalledWith("/users/u1/workstreams", { workstreamIds: [] });
  });

  it("returns error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "fail" } });
    const result = await usersService.updateWorkstreams("u1", ["w1"]);
    expect(result.error?.message).toBe("fail");
  });
});
