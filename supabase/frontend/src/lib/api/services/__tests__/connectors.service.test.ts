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
import { connectorsService } from "../connectors.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedPut = httpClient.put as ReturnType<typeof vi.fn>;
const mockedDelete = httpClient.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── getAll ──────────────────────────────────────────────────────────────────

describe("connectorsService.getAll", () => {
  it("fetches and maps connectors with camelCase response", async () => {
    mockedGet.mockResolvedValue({
      data: [{
        id: "c1",
        name: "Jira",
        connectorType: "Project Management",
        connectorTool: "jira",
        category: "Plan",
        status: "connected",
        health: "healthy",
        accountId: "a1",
        enterpriseId: "e1",
        lastSyncAt: "2025-01-01",
        syncCount: 5,
        createdAt: "2025-01-01",
        updatedAt: "2025-01-02",
        workstreams: [{ id: "w1", name: "WS1" }],
      }],
      error: null,
    });

    const result = await connectorsService.getAll("a1", "e1");

    expect(mockedGet).toHaveBeenCalledWith("/connectors", { params: { accountId: "a1", enterpriseId: "e1" } });
    expect(result).toHaveLength(1);
    expect(result[0].connector_type).toBe("Project Management");
    expect(result[0].connector_tool).toBe("jira");
    expect(result[0].account_id).toBe("a1");
    expect(result[0].last_sync_at).toBe("2025-01-01");
    expect(result[0].sync_count).toBe(5);
    expect(result[0].workstreams).toEqual([{ id: "w1", name: "WS1" }]);
  });

  it("maps snake_case fallback keys", async () => {
    mockedGet.mockResolvedValue({
      data: [{
        id: "c2",
        name: "GH",
        connector_type: "Source Control",
        connector_tool: "github",
        account_id: "a2",
        enterprise_id: "e2",
        last_sync_at: null,
        sync_count: 0,
        created_at: "2025-01-01",
        updated_at: "2025-01-01",
      }],
      error: null,
    });

    const result = await connectorsService.getAll("a2", "e2");
    expect(result[0].connector_type).toBe("Source Control");
    expect(result[0].account_id).toBe("a2");
  });

  it("defaults missing optional fields", async () => {
    mockedGet.mockResolvedValue({ data: [{ id: "c3", name: "X" }], error: null });

    const result = await connectorsService.getAll("a1", "e1");
    expect(result[0].description).toBeNull();
    expect(result[0].url).toBeNull();
    expect(result[0].status).toBe("connected");
    expect(result[0].health).toBe("healthy");
    expect(result[0].sync_count).toBe(0);
    expect(result[0].connector_type).toBe("");
    expect(result[0].workstreams).toEqual([]);
  });

  it("returns empty array on null data", async () => {
    mockedGet.mockResolvedValue({ data: null, error: null });
    expect(await connectorsService.getAll("a1", "e1")).toEqual([]);
  });

  it("throws on error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "Forbidden" } });
    await expect(connectorsService.getAll("a1", "e1")).rejects.toThrow("Forbidden");
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("connectorsService.create", () => {
  it("posts camelCase payload and maps response", async () => {
    mockedPost.mockResolvedValue({
      data: { id: "c-new", name: "Jenkins", connectorTool: "jenkins", category: "Build", accountId: "a1", enterpriseId: "e1" },
      error: null,
    });

    const result = await connectorsService.create({
      name: "Jenkins",
      connector_type: "CI/CD",
      connector_tool: "jenkins",
      category: "Build",
      account_id: "a1",
      enterprise_id: "e1",
      workstream_ids: ["w1"],
      credential_id: "cred1",
    });

    const payload = mockedPost.mock.calls[0][1];
    expect(payload.connectorType).toBe("CI/CD");
    expect(payload.connectorTool).toBe("jenkins");
    expect(payload.accountId).toBe("a1");
    expect(payload.workstreamIds).toEqual(["w1"]);
    expect(payload.credentialId).toBe("cred1");
    expect(result.id).toBe("c-new");
    expect(result.connector_tool).toBe("jenkins");
  });

  it("throws on error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "Conflict" } });
    await expect(connectorsService.create({
      name: "X", connector_type: "t", connector_tool: "x", category: "c",
      account_id: "a", enterprise_id: "e", workstream_ids: [],
    })).rejects.toThrow("Conflict");
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("connectorsService.update", () => {
  it("sends update to correct endpoint", async () => {
    mockedPut.mockResolvedValue({ data: { id: "c1", name: "Updated" }, error: null });

    const result = await connectorsService.update("c1", { name: "Updated", health: "warning" });

    expect(mockedPut).toHaveBeenCalledWith("/connectors/c1", { name: "Updated", health: "warning" });
    expect(result.name).toBe("Updated");
  });

  it("throws on error", async () => {
    mockedPut.mockResolvedValue({ data: null, error: { message: "Not Found" } });
    await expect(connectorsService.update("c1", {})).rejects.toThrow("Not Found");
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("connectorsService.delete", () => {
  it("calls delete endpoint", async () => {
    mockedDelete.mockResolvedValue({ error: null });
    await connectorsService.delete("c1");
    expect(mockedDelete).toHaveBeenCalledWith("/connectors/c1");
  });

  it("throws on error", async () => {
    mockedDelete.mockResolvedValue({ error: { message: "Server Error" } });
    await expect(connectorsService.delete("c1")).rejects.toThrow("Server Error");
  });
});
