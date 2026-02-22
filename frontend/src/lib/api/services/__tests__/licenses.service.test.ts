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

import { httpClient } from "@/lib/api/http-client";
import { licensesService } from "../licenses.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedPut = httpClient.put as ReturnType<typeof vi.fn>;
const mockedDelete = httpClient.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── getByAccount ────────────────────────────────────────────────────────────

describe("licensesService.getByAccount", () => {
  it("fetches licenses with accountId param", async () => {
    const licenses = [
      { id: "l1", accountId: "a1", productId: "p1", endDate: "2026-01-01", numberOfUsers: 10 },
    ];
    mockedGet.mockResolvedValue({ data: licenses, error: null });

    const result = await licensesService.getByAccount("a1");

    expect(mockedGet).toHaveBeenCalledWith("/licenses", { params: { accountId: "a1" } });
    expect(result.data).toHaveLength(1);
    expect(result.data![0].id).toBe("l1");
  });

  it("returns error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "Unauthorized" } });
    const result = await licensesService.getByAccount("a1");
    expect(result.error?.message).toBe("Unauthorized");
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("licensesService.create", () => {
  it("posts full license input directly", async () => {
    const input = {
      accountId: "a1",
      enterpriseId: "e1",
      productId: "p1",
      serviceId: "s1",
      startDate: "2025-01-01",
      endDate: "2026-01-01",
      numberOfUsers: 25,
      contactFullName: "Jane Smith",
      contactEmail: "jane@test.com",
      contactPhone: "+1234567890",
      contactDepartment: "Engineering",
      contactDesignation: "Manager",
      renewalNotify: true,
      noticeDays: 30,
    };
    mockedPost.mockResolvedValue({ data: { id: "l-new", ...input }, error: null });

    const result = await licensesService.create(input);

    expect(mockedPost).toHaveBeenCalledWith("/licenses", input);
    expect(result.data?.id).toBe("l-new");
  });

  it("returns error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "Bad Request" } });
    const result = await licensesService.create({
      accountId: "a", enterpriseId: "e", productId: "p", serviceId: "s",
      startDate: "2025-01-01", endDate: "2026-01-01", numberOfUsers: 1,
      contactFullName: "X", contactEmail: "x@y.com", renewalNotify: false, noticeDays: 30,
    });
    expect(result.error?.message).toBe("Bad Request");
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("licensesService.update", () => {
  it("puts partial update to /licenses/:id", async () => {
    mockedPut.mockResolvedValue({ data: { id: "l1", numberOfUsers: 50 }, error: null });

    const result = await licensesService.update("l1", { numberOfUsers: 50, endDate: "2027-01-01" });

    expect(mockedPut).toHaveBeenCalledWith("/licenses/l1", { numberOfUsers: 50, endDate: "2027-01-01" });
    expect(result.data?.numberOfUsers).toBe(50);
  });

  it("returns error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "Not Found" } });
    const result = await licensesService.update("l-bad", {});
    expect(result.error?.message).toBe("Not Found");
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("licensesService.delete", () => {
  it("calls DELETE /licenses/:id", async () => {
    mockedDelete.mockResolvedValue({ data: undefined, error: null });
    const result = await licensesService.delete("l1");
    expect(mockedDelete).toHaveBeenCalledWith("/licenses/l1");
    expect(result.error).toBeNull();
  });

  it("returns error", async () => {
    mockedDelete.mockResolvedValue({ data: null, error: { message: "err" } });
    const result = await licensesService.delete("l1");
    expect(result.error?.message).toBe("err");
  });
});
