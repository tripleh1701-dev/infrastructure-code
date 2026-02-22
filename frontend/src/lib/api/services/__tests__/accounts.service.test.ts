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
import { accountsService } from "../accounts.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedPut = httpClient.put as ReturnType<typeof vi.fn>;
const mockedDelete = httpClient.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── getAll ──────────────────────────────────────────────────────────────────

describe("accountsService.getAll", () => {
  it("delegates to httpClient.get /accounts", async () => {
    const accounts = [
      { id: "a1", name: "Acme", masterAccountName: "Master", cloudType: "public", status: "active", addresses: [], technicalUsers: [], licenseCount: 2, expiringLicenseCount: 0 },
    ];
    mockedGet.mockResolvedValue({ data: accounts, error: null });

    const result = await accountsService.getAll();

    expect(mockedGet).toHaveBeenCalledWith("/accounts");
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe("Acme");
    expect(result.error).toBeNull();
  });

  it("returns error from API", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "Forbidden" } });

    const result = await accountsService.getAll();
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Forbidden");
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("accountsService.create", () => {
  it("posts full input to /accounts", async () => {
    const input = {
      name: "NewCo",
      masterAccountName: "Master",
      cloudType: "private" as const,
      addresses: [{ line1: "123 St", line2: null, city: "NY", state: "NY", country: "US", postalCode: "10001" }],
      technicalUser: {
        firstName: "John",
        middleName: null,
        lastName: "Doe",
        email: "john@test.com",
        status: "active" as const,
        startDate: "2025-01-01",
        endDate: null,
        assignedGroup: "admins",
        assignedRole: "admin",
        isTechnicalUser: true,
        enterpriseId: "e1",
      },
    };
    mockedPost.mockResolvedValue({ data: { id: "a-new", name: "NewCo" }, error: null });

    const result = await accountsService.create(input);

    expect(mockedPost).toHaveBeenCalledWith("/accounts", input);
    expect(result.data?.name).toBe("NewCo");
  });

  it("returns error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "Validation failed" } });
    const result = await accountsService.create({
      name: "X", masterAccountName: "M", cloudType: "public",
      addresses: [], technicalUser: {} as any,
    });
    expect(result.error?.message).toBe("Validation failed");
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("accountsService.update", () => {
  it("puts to /accounts/:id", async () => {
    const input = {
      id: "a1",
      name: "Updated",
      masterAccountName: "M",
      cloudType: "hybrid" as const,
      addresses: [],
      technicalUser: {} as any,
    };
    mockedPut.mockResolvedValue({ data: { id: "a1", name: "Updated" }, error: null });

    const result = await accountsService.update(input);

    expect(mockedPut).toHaveBeenCalledWith("/accounts/a1", input);
    expect(result.data?.name).toBe("Updated");
  });

  it("returns error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "Not Found" } });
    const result = await accountsService.update({ id: "bad", name: "X", masterAccountName: "M", cloudType: "public", addresses: [], technicalUser: {} as any });
    expect(result.error?.message).toBe("Not Found");
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("accountsService.delete", () => {
  it("calls delete /accounts/:id", async () => {
    mockedDelete.mockResolvedValue({ data: undefined, error: null });

    const result = await accountsService.delete("a1");

    expect(mockedDelete).toHaveBeenCalledWith("/accounts/a1");
    expect(result.error).toBeNull();
  });

  it("returns error", async () => {
    mockedDelete.mockResolvedValue({ data: null, error: { message: "err" } });
    const result = await accountsService.delete("a1");
    expect(result.error?.message).toBe("err");
  });
});
