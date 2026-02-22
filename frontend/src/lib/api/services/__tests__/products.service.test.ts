import { describe, it, expect, vi, beforeEach } from "vitest";
import { productsService, servicesService } from "../products.service";
import { httpClient } from "@/lib/api/http-client";

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockProduct = { id: "prod-1", name: "Platform", description: null, createdAt: "2025-01-01" };
const mockService = { id: "svc-1", name: "Auth Service", description: null, createdAt: "2025-01-01" };

describe("productsService (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll fetches from /products", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockProduct], error: null });
    const result = await productsService.getAll();
    expect(httpClient.get).toHaveBeenCalledWith("/products");
    expect(result.data).toEqual([mockProduct]);
  });

  it("create posts name to /products", async () => {
    vi.mocked(httpClient.post).mockResolvedValue({ data: mockProduct, error: null });
    const result = await productsService.create("Platform");
    expect(httpClient.post).toHaveBeenCalledWith("/products", { name: "Platform" });
    expect(result.data).toEqual(mockProduct);
  });

  it("update puts name to /products/:id", async () => {
    vi.mocked(httpClient.put).mockResolvedValue({ data: { ...mockProduct, name: "New" }, error: null });
    const result = await productsService.update("prod-1", "New");
    expect(httpClient.put).toHaveBeenCalledWith("/products/prod-1", { name: "New" });
    expect(result.data!.name).toBe("New");
  });

  it("delete removes product", async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({ data: undefined, error: null });
    const result = await productsService.delete("prod-1");
    expect(httpClient.delete).toHaveBeenCalledWith("/products/prod-1");
    expect(result.error).toBeNull();
  });
});

describe("servicesService (external API mode)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll fetches from /services", async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [mockService], error: null });
    const result = await servicesService.getAll();
    expect(httpClient.get).toHaveBeenCalledWith("/services");
    expect(result.data).toEqual([mockService]);
  });

  it("create posts name to /services", async () => {
    vi.mocked(httpClient.post).mockResolvedValue({ data: mockService, error: null });
    const result = await servicesService.create("Auth Service");
    expect(httpClient.post).toHaveBeenCalledWith("/services", { name: "Auth Service" });
    expect(result.data).toEqual(mockService);
  });

  it("update puts name to /services/:id", async () => {
    vi.mocked(httpClient.put).mockResolvedValue({ data: { ...mockService, name: "Updated" }, error: null });
    const result = await servicesService.update("svc-1", "Updated");
    expect(httpClient.put).toHaveBeenCalledWith("/services/svc-1", { name: "Updated" });
    expect(result.data!.name).toBe("Updated");
  });

  it("delete removes service", async () => {
    vi.mocked(httpClient.delete).mockResolvedValue({ data: undefined, error: null });
    const result = await servicesService.delete("svc-1");
    expect(httpClient.delete).toHaveBeenCalledWith("/services/svc-1");
    expect(result.error).toBeNull();
  });
});
