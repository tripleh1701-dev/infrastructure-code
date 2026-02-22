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
import { workstreamsService } from "../workstreams.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedPut = httpClient.put as ReturnType<typeof vi.fn>;
const mockedDelete = httpClient.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── getAll ──────────────────────────────────────────────────────────────────

describe("workstreamsService.getAll", () => {
  it("passes account and enterprise params", async () => {
    const workstreams = [
      { id: "w1", name: "Default", accountId: "a1", enterpriseId: "e1", tools: [] },
    ];
    mockedGet.mockResolvedValue({ data: workstreams, error: null });

    const result = await workstreamsService.getAll("a1", "e1");

    expect(mockedGet).toHaveBeenCalledWith("/workstreams", { params: { accountId: "a1", enterpriseId: "e1" } });
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe("Default");
  });

  it("works without params", async () => {
    mockedGet.mockResolvedValue({ data: [], error: null });
    await workstreamsService.getAll();
    expect(mockedGet).toHaveBeenCalledWith("/workstreams", { params: { accountId: undefined, enterpriseId: undefined } });
  });

  it("returns error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "Forbidden" } });
    const result = await workstreamsService.getAll("a1");
    expect(result.error?.message).toBe("Forbidden");
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("workstreamsService.create", () => {
  it("posts full input with tools", async () => {
    const input = {
      name: "DevOps",
      accountId: "a1",
      enterpriseId: "e1",
      tools: [{ category: "Build", toolName: "Jenkins" }],
    };
    mockedPost.mockResolvedValue({ data: { id: "w-new", ...input }, error: null });

    const result = await workstreamsService.create(input);

    expect(mockedPost).toHaveBeenCalledWith("/workstreams", input);
    expect(result.data?.name).toBe("DevOps");
  });

  it("returns error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "Validation" } });
    const result = await workstreamsService.create({ name: "X", accountId: "a", enterpriseId: "e", tools: [] });
    expect(result.error?.message).toBe("Validation");
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("workstreamsService.update", () => {
  it("puts partial update to /workstreams/:id", async () => {
    mockedPut.mockResolvedValue({ data: { id: "w1", name: "Renamed" }, error: null });

    const result = await workstreamsService.update("w1", { name: "Renamed" });

    expect(mockedPut).toHaveBeenCalledWith("/workstreams/w1", { name: "Renamed" });
    expect(result.data?.name).toBe("Renamed");
  });

  it("updates tools", async () => {
    mockedPut.mockResolvedValue({ data: { id: "w1" }, error: null });

    await workstreamsService.update("w1", {
      tools: [{ category: "Code", toolName: "GitHub" }],
    });

    const payload = mockedPut.mock.calls[0][1];
    expect(payload.tools).toEqual([{ category: "Code", toolName: "GitHub" }]);
  });

  it("returns error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "Not Found" } });
    const result = await workstreamsService.update("w1", {});
    expect(result.error?.message).toBe("Not Found");
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("workstreamsService.delete", () => {
  it("calls DELETE /workstreams/:id", async () => {
    mockedDelete.mockResolvedValue({ data: undefined, error: null });
    const result = await workstreamsService.delete("w1");
    expect(mockedDelete).toHaveBeenCalledWith("/workstreams/w1");
    expect(result.error).toBeNull();
  });

  it("returns error", async () => {
    mockedDelete.mockResolvedValue({ data: null, error: { message: "err" } });
    const result = await workstreamsService.delete("w1");
    expect(result.error?.message).toBe("err");
  });
});

// ─── ensureDefault ───────────────────────────────────────────────────────────

describe("workstreamsService.ensureDefault", () => {
  it("posts to /workstreams/ensure-default", async () => {
    mockedPost.mockResolvedValue({ data: "w-default-id", error: null });

    const result = await workstreamsService.ensureDefault("a1", "e1");

    expect(mockedPost).toHaveBeenCalledWith("/workstreams/ensure-default", { accountId: "a1", enterpriseId: "e1" });
    expect(result.data).toBe("w-default-id");
  });

  it("returns error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "fail" } });
    const result = await workstreamsService.ensureDefault("a1", "e1");
    expect(result.error?.message).toBe("fail");
  });
});
