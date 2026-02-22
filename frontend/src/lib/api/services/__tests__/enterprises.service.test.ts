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
import { enterprisesService } from "../enterprises.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedPut = httpClient.put as ReturnType<typeof vi.fn>;
const mockedDelete = httpClient.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── getAll ──────────────────────────────────────────────────────────────────

describe("enterprisesService.getAll", () => {
  it("delegates to GET /enterprises", async () => {
    const enterprises = [
      { id: "e1", name: "Acme Corp", product: { id: "p1", name: "DevOps" }, services: [{ id: "s1", name: "CI" }] },
    ];
    mockedGet.mockResolvedValue({ data: enterprises, error: null });

    const result = await enterprisesService.getAll();

    expect(mockedGet).toHaveBeenCalledWith("/enterprises");
    expect(result.data).toHaveLength(1);
    expect(result.data![0].name).toBe("Acme Corp");
  });

  it("returns error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "Forbidden" } });
    const result = await enterprisesService.getAll();
    expect(result.error?.message).toBe("Forbidden");
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("enterprisesService.create", () => {
  it("transforms productId to products[] and serviceIds to services[]", async () => {
    mockedPost.mockResolvedValue({ data: { id: "e-new", name: "New" }, error: null });

    const result = await enterprisesService.create({
      name: "New",
      productId: "p1",
      serviceIds: ["s1", "s2"],
    });

    expect(mockedPost).toHaveBeenCalledWith("/enterprises", {
      name: "New",
      products: ["p1"],
      services: ["s1", "s2"],
    });
    expect(result.data?.name).toBe("New");
  });

  it("omits products/services when not provided", async () => {
    mockedPost.mockResolvedValue({ data: { id: "e2", name: "Min" }, error: null });

    await enterprisesService.create({ name: "Min" });

    const payload = mockedPost.mock.calls[0][1];
    expect(payload).toEqual({ name: "Min" });
    expect(payload.products).toBeUndefined();
    expect(payload.services).toBeUndefined();
  });

  it("returns error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "Conflict" } });
    const result = await enterprisesService.create({ name: "X" });
    expect(result.error?.message).toBe("Conflict");
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("enterprisesService.update", () => {
  it("transforms to backend DTO with products/services arrays", async () => {
    mockedPut.mockResolvedValue({ data: { id: "e1", name: "Updated" }, error: null });

    await enterprisesService.update("e1", {
      name: "Updated",
      productId: "p2",
      serviceIds: ["s3"],
    });

    expect(mockedPut).toHaveBeenCalledWith("/enterprises/e1", {
      name: "Updated",
      products: ["p2"],
      services: ["s3"],
    });
  });

  it("sends empty products array when productId is cleared", async () => {
    mockedPut.mockResolvedValue({ data: { id: "e1" }, error: null });

    await enterprisesService.update("e1", { productId: "" });

    const payload = mockedPut.mock.calls[0][1];
    expect(payload.products).toEqual([]);
  });

  it("sends empty services array when serviceIds is empty", async () => {
    mockedPut.mockResolvedValue({ data: { id: "e1" }, error: null });

    await enterprisesService.update("e1", { serviceIds: [] });

    const payload = mockedPut.mock.calls[0][1];
    expect(payload.services).toEqual([]);
  });

  it("returns error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "Not Found" } });
    const result = await enterprisesService.update("e1", { name: "X" });
    expect(result.error?.message).toBe("Not Found");
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("enterprisesService.delete", () => {
  it("calls DELETE /enterprises/:id", async () => {
    mockedDelete.mockResolvedValue({ data: undefined, error: null });
    const result = await enterprisesService.delete("e1");
    expect(mockedDelete).toHaveBeenCalledWith("/enterprises/e1");
    expect(result.error).toBeNull();
  });

  it("returns error", async () => {
    mockedDelete.mockResolvedValue({ data: null, error: { message: "err" } });
    const result = await enterprisesService.delete("e1");
    expect(result.error?.message).toBe("err");
  });
});
