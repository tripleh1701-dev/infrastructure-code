import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api/config", () => ({ isExternalApi: () => true }));

vi.mock("@/lib/api/http-client", () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}));

import { httpClient } from "@/lib/api/http-client";
import { credentialsService } from "../credentials.service";

const mockedGet = httpClient.get as ReturnType<typeof vi.fn>;
const mockedPost = httpClient.post as ReturnType<typeof vi.fn>;
const mockedPatch = (httpClient as any).patch as ReturnType<typeof vi.fn>;
const mockedDelete = httpClient.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── getAll ──────────────────────────────────────────────────────────────────

describe("credentialsService.getAll", () => {
  it("fetches credentials", async () => {
    mockedGet.mockResolvedValue({
      data: [{ id: "cr1", name: "Jira PAT", category: "Plan", connector: "jira", auth_type: "pat", status: "active" }],
      error: null,
    });

    const result = await credentialsService.getAll("a1", "e1");

    expect(mockedGet).toHaveBeenCalledWith("/credentials", { params: { accountId: "a1", enterpriseId: "e1" } });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Jira PAT");
  });

  it("returns empty array on null data", async () => {
    mockedGet.mockResolvedValue({ data: null, error: null });
    expect(await credentialsService.getAll("a1", "e1")).toEqual([]);
  });

  it("throws on error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "Unauthorized" } });
    await expect(credentialsService.getAll("a1", "e1")).rejects.toThrow("Unauthorized");
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("credentialsService.create", () => {
  it("posts camelCase payload", async () => {
    mockedPost.mockResolvedValue({ data: { id: "cr-new", name: "GH Token" }, error: null });

    const result = await credentialsService.create({
      name: "GH Token",
      description: "desc",
      account_id: "a1",
      enterprise_id: "e1",
      workstream_ids: ["w1", "w2"],
      product_id: "p1",
      service_id: "s1",
      category: "Code",
      connector: "github",
      auth_type: "pat",
      credentials: { token: "abc" },
      created_by: "user1",
      expires_at: "2026-01-01",
      expiry_notice_days: 30,
      expiry_notify: true,
    });

    const payload = mockedPost.mock.calls[0][1];
    expect(payload.accountId).toBe("a1");
    expect(payload.enterpriseId).toBe("e1");
    expect(payload.workstreamIds).toEqual(["w1", "w2"]);
    expect(payload.authType).toBe("pat");
    expect(payload.expiresAt).toBe("2026-01-01");
    expect(payload.expiryNoticeDays).toBe(30);
    expect(payload.expiryNotify).toBe(true);
    expect(payload.createdBy).toBe("user1");
    expect(result.id).toBe("cr-new");
  });

  it("omits undefined optional fields", async () => {
    mockedPost.mockResolvedValue({ data: { id: "cr2" }, error: null });

    await credentialsService.create({
      name: "Min",
      account_id: "a1",
      enterprise_id: "e1",
      workstream_ids: [],
      category: "Plan",
      connector: "jira",
      auth_type: "basic",
    });

    const payload = mockedPost.mock.calls[0][1];
    expect(payload.description).toBeUndefined();
    expect(payload.productId).toBeUndefined();
    expect(payload.credentials).toBeUndefined();
  });

  it("throws on error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "Bad Request" } });
    await expect(credentialsService.create({
      name: "X", account_id: "a", enterprise_id: "e", workstream_ids: [],
      category: "c", connector: "x", auth_type: "pat",
    })).rejects.toThrow("Bad Request");
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("credentialsService.update", () => {
  it("sends snake_case → camelCase mapped patch", async () => {
    mockedPatch.mockResolvedValue({ error: null });

    await credentialsService.update("cr1", {
      name: "Renamed",
      product_id: "p2",
      service_id: "s2",
      status: "expired",
      expires_at: "2026-06-01",
      expiry_notice_days: 14,
      expiry_notify: false,
      credentials: { token: "new" },
      workstream_ids: ["w3"],
    });

    const payload = mockedPatch.mock.calls[0][1];
    expect(payload.name).toBe("Renamed");
    expect(payload.productId).toBe("p2");
    expect(payload.serviceId).toBe("s2");
    expect(payload.status).toBe("expired");
    expect(payload.expiresAt).toBe("2026-06-01");
    expect(payload.expiryNoticeDays).toBe(14);
    expect(payload.expiryNotify).toBe(false);
    expect(payload.credentials).toEqual({ token: "new" });
    expect(payload.workstreamIds).toEqual(["w3"]);
  });

  it("only sends defined fields", async () => {
    mockedPatch.mockResolvedValue({ error: null });

    await credentialsService.update("cr1", { name: "Only Name" });

    const payload = mockedPatch.mock.calls[0][1];
    expect(payload).toEqual({ name: "Only Name" });
  });

  it("throws on error", async () => {
    mockedPatch.mockResolvedValue({ error: { message: "Conflict" } });
    await expect(credentialsService.update("cr1", { name: "X" })).rejects.toThrow("Conflict");
  });
});

// ─── rotate ──────────────────────────────────────────────────────────────────

describe("credentialsService.rotate", () => {
  it("posts rotation credentials", async () => {
    mockedPost.mockResolvedValue({ error: null });

    await credentialsService.rotate("cr1", { token: "rotated" });

    expect(mockedPost).toHaveBeenCalledWith("/credentials/cr1/rotate", { credentials: { token: "rotated" } });
  });

  it("throws on error", async () => {
    mockedPost.mockResolvedValue({ error: { message: "Failed" } });
    await expect(credentialsService.rotate("cr1", {})).rejects.toThrow("Failed");
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("credentialsService.delete", () => {
  it("calls delete endpoint", async () => {
    mockedDelete.mockResolvedValue({ error: null });
    await credentialsService.delete("cr1");
    expect(mockedDelete).toHaveBeenCalledWith("/credentials/cr1");
  });

  it("throws on error", async () => {
    mockedDelete.mockResolvedValue({ error: { message: "err" } });
    await expect(credentialsService.delete("cr1")).rejects.toThrow("err");
  });
});

// ─── checkNameExists ─────────────────────────────────────────────────────────

describe("credentialsService.checkNameExists", () => {
  it("checks name with params", async () => {
    mockedGet.mockResolvedValue({ data: [{ id: "cr1", name: "Jira PAT" }], error: null });

    const result = await credentialsService.checkNameExists("Jira PAT", "a1", "e1");

    expect(mockedGet).toHaveBeenCalledWith("/credentials/check-name", {
      params: { name: "Jira PAT", accountId: "a1", enterpriseId: "e1" },
    });
    expect(result).toEqual([{ id: "cr1", name: "Jira PAT" }]);
  });

  it("returns empty when no matches", async () => {
    mockedGet.mockResolvedValue({ data: null, error: null });
    expect(await credentialsService.checkNameExists("X", "a1", "e1")).toEqual([]);
  });

  it("throws on error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "err" } });
    await expect(credentialsService.checkNameExists("X", "a1", "e1")).rejects.toThrow("err");
  });
});

// ─── OAuth helpers ───────────────────────────────────────────────────────────

describe("credentialsService OAuth", () => {
  it("initiateOAuth posts correct payload", async () => {
    mockedPost.mockResolvedValue({
      data: { authorizationUrl: "https://oauth.example.com", state: "abc123" },
      error: null,
    });

    const result = await credentialsService.initiateOAuth("cr1", "jira", "https://redirect.test");

    expect(mockedPost).toHaveBeenCalledWith("/connectors/oauth/initiate", {
      provider: "jira",
      credentialId: "cr1",
      redirectUri: "https://redirect.test",
    });
    expect(result?.authorizationUrl).toBe("https://oauth.example.com");
  });

  it("checkOAuthStatus fetches status", async () => {
    mockedGet.mockResolvedValue({ data: { status: "active" }, error: null });

    const result = await credentialsService.checkOAuthStatus("cr1");

    expect(mockedGet).toHaveBeenCalledWith("/connectors/oauth/status/cr1");
    expect(result?.status).toBe("active");
  });

  it("revokeOAuth posts revocation", async () => {
    mockedPost.mockResolvedValue({ data: { success: true }, error: null });

    const result = await credentialsService.revokeOAuth("cr1");

    expect(mockedPost).toHaveBeenCalledWith("/connectors/oauth/revoke", { credentialId: "cr1" });
    expect(result?.success).toBe(true);
  });

  it("initiateOAuth throws on error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "OAuth failed" } });
    await expect(credentialsService.initiateOAuth("cr1", "jira", "url")).rejects.toThrow("OAuth failed");
  });

  it("checkOAuthStatus throws on error", async () => {
    mockedGet.mockResolvedValue({ data: null, error: { message: "err" } });
    await expect(credentialsService.checkOAuthStatus("cr1")).rejects.toThrow("err");
  });

  it("revokeOAuth throws on error", async () => {
    mockedPost.mockResolvedValue({ data: null, error: { message: "err" } });
    await expect(credentialsService.revokeOAuth("cr1")).rejects.toThrow("err");
  });
});
